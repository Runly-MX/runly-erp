import {fail,json} from './pos-contracts.js';

export function createPosKitchenPrintService({commands,store,preparation}) {
  function clean(value){return String(value??'').replace(/[\x00-\x1f\x7f]/g,' ');}
  function escape(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function create(tx,ctx,{ticketId,...input}) {
    const ticket=await store.row(tx,'posKitchenTicket',ctx.companyId,ticketId);
    const value=await store.order(tx,ctx.companyId,ticket.orderId);
    await store.row(tx,'posOutlet',ctx.companyId,value.outletId,{enabled:true});
    await store.row(tx,'posKitchenStation',ctx.companyId,ticket.stationId,{outletId:value.outletId,enabled:true});
    if(!ticket.dispatchId)fail('RECONCILIATION_REQUIRED','El envío histórico carece de snapshot verificable para imprimir.');
    const t=await preparation.ticketDto(tx,ticket);
    const copy=(await tx.posPrintJob.count({where:{companyId:ctx.companyId,ticketId}}))>0;
    const text=[`COMANDA${copy?' - COPIA':''}`,t.orderLabel,`Envio ${t.dispatchSequence}`,t.dispatchedAt.toISOString(),t.waiterName,
      ...t.lines.flatMap(l=>[`${l.quantity} x ${l.productName}${l.variantLabel?` (${l.variantLabel})`:''}`,...l.modifiers.map(m=>`${m.groupName}: ${m.optionName}`),l.note])].filter(Boolean).map(clean).join('\n');
    const ascii=text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e\n]/g,'?');
    const payload={html:`<!doctype html><html lang="es"><meta charset="utf-8"><title>Comanda</title><body><pre>${escape(text)}</pre></body></html>`,
      text,encoding:'base64',charset:'US-ASCII',dataBase64:Buffer.from(ascii+'\n\n\n','ascii').toString('base64')};
    const job=await tx.posPrintJob.create({data:{companyId:ctx.companyId,ticketId,outletId:value.outletId,createdById:ctx.actorId,
      transport:input.transport,reason:input.reason,copy,payload}});
    await commands.audit(tx,{...ctx,entityType:'PosPrintJob',entityId:job.id,action:'pos.kitchen.print.create',after:job});
    return json({jobId:job.id,ticketId,receiptId:null,outletId:job.outletId,transport:job.transport,status:job.status,copy,payload,
      errorCode:null,createdAt:job.createdAt,finishedAt:null,physicalConfirmationSupported:false});
  }
  return {create};
}
