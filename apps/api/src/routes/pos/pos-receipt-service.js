import {commerceDto,fail,json} from './pos-contracts.js';
import {createPosCommandService} from './pos-command-service.js';
import {createPosReceiptDocuments} from './pos-receipt-documents.js';

export function createPosReceiptService({prisma}) {
  const commands=createPosCommandService({prisma}),documents=createPosReceiptDocuments();
  async function receipt(tx,companyId,id) {
    if(!companyId)fail('FORBIDDEN','Empresa requerida.',403);
    const value=await tx.posReceipt.findFirst({where:{id,companyId}});
    if(!value)fail('NOT_FOUND','Comprobante no encontrado.',404);
    const order=await tx.posOrder.findFirst({where:{id:value.orderId,companyId}});
    if(!order)fail('NOT_FOUND','Orden no encontrada.',404);
    return {value,order};
  }
  function dto(job) {
    return json({jobId:job.id,receiptId:job.receiptId,outletId:job.outletId,transport:job.transport,status:job.status,copy:job.copy,
      payload:job.payload,errorCode:job.errorCode,createdAt:job.createdAt,finishedAt:job.finishedAt,physicalConfirmationSupported:false});
  }
  async function get(companyId,id) {
    return prisma.$transaction(async(tx)=>{
      const {value}=await receipt(tx,companyId,id);
      const jobs=await tx.posPrintJob.findMany({where:{companyId,receiptId:id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:20});
      const doc=documents.document(value);
      return commerceDto({...value,document:doc,historicalSnapshotIncomplete:!doc,
        printable:Boolean(doc&&!doc.historicalCurrencyUnknown),unavailableReason:!doc||doc.historicalCurrencyUnknown?'RECONCILIATION_REQUIRED':null,
        printStatus:jobs[0]?.status??'GENERATED',printJobs:jobs.map(dto),physicalConfirmationSupported:false,
        legacyPrintedCount:value.printedCount,confirmedPrintCount:0});
    },{isolationLevel:'RepeatableRead'});
  }
  async function create(ctx,id,input,key) {
    return commands.run({...ctx,operation:'receipt.print.create',key,input:{receiptId:id,...input},serialize:json,execute:async(tx)=>{
      await tx.$queryRaw`SELECT id FROM pos_receipt WHERE id=${id}::uuid AND company_id=${ctx.companyId}::uuid FOR UPDATE`;
      const {value,order}=await receipt(tx,ctx.companyId,id);
      if(!await tx.posOutlet.findFirst({where:{id:order.outletId,companyId:ctx.companyId}}))fail('RECONCILIATION_REQUIRED','La sucursal histórica del comprobante requiere conciliación.');
      const copy=value.kind==='REPRINT'||(await tx.posPrintJob.count({where:{companyId:ctx.companyId,receiptId:id}}))>0;
      const payload=documents.render(documents.document(value),input.transport,copy);
      const job=await tx.posPrintJob.create({data:{companyId:ctx.companyId,receiptId:id,outletId:order.outletId,createdById:ctx.actorId,
        transport:input.transport,copy,reason:input.reason,payload}});
      await commands.audit(tx,{...ctx,entityType:'PosPrintJob',entityId:job.id,action:'pos.receipt.print.create',after:job,metadata:{receiptId:id,copy,reason:input.reason??null}});
      return dto(job);
    }});
  }
  async function result(ctx,id,input,key,permissions={},receiptId) {
    // Check ownership before even a persisted command replay can be returned.
    const own=await prisma.posPrintJob.findFirst({where:{id,companyId:ctx.companyId,...(receiptId?{receiptId}:{})}});
    if(!own)fail('NOT_FOUND','Intento no encontrado.',404);
    if(own.createdById!==ctx.actorId&&!permissions.isAdmin&&!permissions.permissionSet?.has('pos.admin.update'))fail('FORBIDDEN','Sólo el creador del intento o un administrador autorizado puede registrar el resultado.',403);
    return commands.run({...ctx,operation:'receipt.print.result',key,input:{jobId:id,...input},serialize:json,execute:async(tx)=>{
      await tx.$queryRaw`SELECT id FROM pos_print_job WHERE id=${id}::uuid AND company_id=${ctx.companyId}::uuid FOR UPDATE`;
      const job=await tx.posPrintJob.findFirst({where:{id,companyId:ctx.companyId}});
      await receipt(tx,ctx.companyId,job.receiptId);
      if(job.status!=='QUEUED')fail('INVALID_TRANSITION','El intento ya tiene un resultado definitivo.');
      const updated=await tx.posPrintJob.update({where:{id},data:{status:input.status,errorCode:input.status==='FAILED'?(input.errorCode??'UNKNOWN'):null,finishedAt:new Date()}});
      await commands.audit(tx,{...ctx,entityType:'PosPrintJob',entityId:id,action:'pos.receipt.print.result',before:job,after:updated});
      return dto(updated);
    }});
  }
  return {get,create,result};
}
