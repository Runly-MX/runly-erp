import {amount,decimal,sum,fail,commerceDto} from './pos-contracts.js';

// Attribution is a projection of captures, never a second financial balance.
// All writers hold the order lock (after its financial container, if any).
export function createPosAllocationsService({commands,store}) {
  async function state(tx,value) {
    const [lines,payments,refundLines,refundPayments,allocations]=await Promise.all([
      tx.posOrderLine.findMany({where:{orderId:value.id,voided:false},orderBy:{id:'asc'}}),
      tx.posPayment.findMany({where:{orderId:value.id,companyId:value.companyId,status:'CAPTURED'}}),
      tx.posRefundLine.findMany({where:{refund:{orderId:value.id,companyId:value.companyId}}}),
      tx.posRefundPayment.findMany({where:{refund:{orderId:value.id,companyId:value.companyId}}}),
      tx.posPaymentAllocation.findMany({where:{orderId:value.id,companyId:value.companyId},orderBy:{id:'asc'}}),
    ]);
    return {lines,payments,allocations,
      lineNet:(id)=>decimal(lines.find(l=>l.id===id)?.totalAmount??0).minus(sum(refundLines.filter(r=>r.orderLineId===id),'amount')),
      paymentNet:(id)=>decimal(payments.find(p=>p.id===id)?.amount??0).minus(sum(refundPayments.filter(r=>r.paymentId===id),'amount'))};
  }
  async function validate(tx,value,rows,paymentAmount,excludePaymentId) {
    if(value.experience!=='RESTAURANT'&&rows.length)fail('INVALID_TRANSITION','Las atribuciones corresponden a Restaurante.');
    if(new Set(rows.map(r=>r.orderLineId)).size!==rows.length)fail('VALIDATION_ERROR','No repitas partidas.',400);
    if(sum(rows,'amount').gt(paymentAmount))fail('ALLOCATION_CONFLICT','Las atribuciones exceden el pago neto.');
    const s=await state(tx,value);
    for(const row of rows){
      if(!s.lines.some(l=>l.id===row.orderLineId))fail('NOT_FOUND','Partida no encontrada en esta cuenta.',404);
      const assigned=sum(s.allocations.filter(a=>a.orderLineId===row.orderLineId&&a.paymentId!==excludePaymentId),'amount');
      if(assigned.plus(row.amount).gt(s.lineNet(row.orderLineId)))fail('ALLOCATION_CONFLICT','La partida ya fue cobrada o el importe excede su saldo.');
    }
  }
  async function save(tx,value,paymentId,rows) {
    // Preserve old rows at zero; the audit retains each attribution revision.
    await tx.posPaymentAllocation.updateMany({where:{companyId:value.companyId,orderId:value.id,paymentId},data:{amount:0}});
    for(const row of rows)await tx.posPaymentAllocation.upsert({where:{paymentId_orderLineId:{paymentId,orderLineId:row.orderLineId}},
      create:{companyId:value.companyId,orderId:value.id,paymentId,...row},update:{amount:row.amount}});
  }
  async function allocatePayment(tx,ctx,data,{orderId}) {
    const value=await store.order(tx,ctx.companyId,orderId,data.expectedVersion);
    store.knownCurrency(value);
    if(['CANCELLED','REFUNDED'].includes(value.status))fail('INVALID_TRANSITION','Esta cuenta no admite atribuciones.');
    const s=await state(tx,value);
    if(!s.payments.some(p=>p.id===data.paymentId))fail('NOT_FOUND','Pago no encontrado en la cuenta.',404);
    await validate(tx,value,data.allocations,s.paymentNet(data.paymentId),data.paymentId);
    await save(tx,value,data.paymentId,data.allocations);
    await store.advanceOrder(tx,value,{});
    const after=await tx.posPaymentAllocation.findMany({where:{companyId:ctx.companyId,orderId}});
    await commands.audit(tx,{...ctx,entityType:'PosPayment',entityId:data.paymentId,action:'pos.payment.allocate',before:s.allocations,after});
    return store.dto(tx,ctx.companyId,orderId);
  }
  async function reduceAfterRefund(tx,value) {
    const s=await state(tx,value),lineUsed=new Map(),payUsed=new Map();
    for(const row of s.allocations){
      const lineAvailable=s.lineNet(row.orderLineId).minus(lineUsed.get(row.orderLineId)??0);
      const payAvailable=s.paymentNet(row.paymentId).minus(payUsed.get(row.paymentId)??0);
      const safe=[decimal(row.amount),lineAvailable,payAvailable].reduce((a,b)=>a.lt(b)?a:b);
      const next=safe.lt(0)?decimal(0):safe;
      if(!next.eq(row.amount))await tx.posPaymentAllocation.update({where:{id:row.id},data:{amount:amount(next)}});
      lineUsed.set(row.orderLineId,(lineUsed.get(row.orderLineId)??decimal(0)).plus(next));
      payUsed.set(row.paymentId,(payUsed.get(row.paymentId)??decimal(0)).plus(next));
    }
  }
  async function totals(tx,value) {
    const s=await state(tx,value),guests=await tx.posGuestSeat.findMany({where:{orderId:value.id},orderBy:[{position:'asc'},{id:'asc'}]});
    const groups=[...guests,{id:null,label:'Sin comensal'}];
    const seats=groups.map(g=>{
      const lines=s.lines.filter(l=>(l.guestSeatId??null)===g.id),ids=new Set(lines.map(l=>l.id));
      const total=lines.reduce((v,l)=>v.plus(s.lineNet(l.id)),decimal(0));
      const paid=sum(s.allocations.filter(a=>ids.has(a.orderLineId)),'amount');
      return {id:g.id,label:g.label,totalAmount:amount(total),paidAmount:amount(paid),remainingAmount:amount(total.minus(paid)),lineIds:[...ids]};
    }).filter(g=>g.id||g.lineIds.length);
    const net=decimal(value.paidAmount).minus(value.refundedAmount),closed=['PAID','REFUNDED','CANCELLED'].includes(value.status);
    return commerceDto({seats,orderTotal:amount(value.totalAmount),refundedAmount:amount(value.refundedAmount),netOrderTotalAmount:amount(sum(seats,'totalAmount')),
      paidAmount:amount(net),remainingAmount:amount(closed?0:decimal(value.totalAmount).minus(net)),
      generalPaidAmount:amount(net.minus(sum(s.allocations,'amount'))),allocations:s.allocations});
  }
  return {validate,save,allocatePayment,reduceAfterRefund,totals};
}
