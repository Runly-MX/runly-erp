import { amount,decimal,fail,money,sum,commerceDto } from './pos-contracts.js';

export function createPosRefundQuoteService({prisma}) {
  async function lines(tx,value,inputs) {
    if(new Set(inputs.map((l)=>l.orderLineId)).size!==inputs.length)fail('VALIDATION_ERROR','No repitas líneas.',400);
    const documents=[];
    for(const input of inputs){
      const line=await tx.posOrderLine.findFirst({where:{id:input.orderLineId,orderId:value.id,voided:false}});
      if(!line)fail('NOT_FOUND','Línea no encontrada.',404);
      const qty=decimal(input.quantity),remaining=decimal(line.quantity).minus(line.returnedQuantity);
      const stockSource=await tx.catalogStockMovement.findFirst({where:{companyId:value.companyId,sourceType:'POS_SALE',sourceId:value.id,sourceLineId:line.id,balanceApplied:true}});
      if(qty.lte(0) || (stockSource && !qty.isInteger()))fail('VALIDATION_ERROR','La devolución controlada requiere unidades enteras positivas.',400);
      if(qty.gt(remaining))fail('VALIDATION_ERROR','La cantidad excede lo pendiente de devolución.',400);
      const previous=await tx.posRefundLine.findMany({where:{orderLineId:line.id}});
      const total=qty.eq(remaining)?decimal(line.totalAmount).minus(sum(previous,'amount')):money(decimal(line.totalAmount).times(qty).div(line.quantity));
      const tax=qty.eq(remaining)?decimal(line.taxAmount).minus(sum(previous,'taxAmount')):money(decimal(line.taxAmount).times(qty).div(line.quantity));
      documents.push({line,quantity:input.quantity,amount:amount(total),taxAmount:amount(tax),subtotalAmount:amount(total.minus(tax)),restock:input.restock,stockRestored:false});
    }
    return documents;
  }

  async function preview(companyId,orderId,input) {
    if(!companyId)fail('FORBIDDEN','Empresa requerida.',403);
    return prisma.$transaction(async(tx)=>{
      const order=await tx.posOrder.findFirst({where:{id:orderId,companyId}});
      if(!order)fail('NOT_FOUND','Orden no encontrada.',404);
      if(order.version!==input.expectedVersion)fail('ORDER_VERSION_CONFLICT','La orden cambió en otro dispositivo.');
      if(!order.currency)fail('CURRENCY_MISMATCH','La moneda histórica requiere conciliación.');
      if(['CANCELLED','REFUNDED'].includes(order.status))fail('INVALID_TRANSITION','La orden no admite devolución.');
      if((order.status==='PAID')!==(input.lines.length>0))fail('VALIDATION_ERROR','La venta cerrada requiere líneas; el anticipo no admite líneas.',400);
      const documents=await lines(tx,order,input.lines);
      const total=order.status==='PAID'?sum(documents,'amount'):decimal(input.amount??decimal(order.paidAmount).minus(order.refundedAmount));
      if(total.lte(0)||total.gt(decimal(order.paidAmount).minus(order.refundedAmount)))fail('VALIDATION_ERROR','Importe de devolución inválido.',400);
      const captures=await tx.posPayment.findMany({where:{companyId,orderId,status:'CAPTURED'},include:{paymentMethod:true,refundPayments:true},orderBy:[{paidAt:'asc'},{id:'asc'}]});
      if(!sum(captures,'amount').eq(order.paidAmount))fail('RECONCILIATION_REQUIRED','Las capturas no coinciden con el saldo registrado.');
      let remaining=total;
      const payments=captures.map((p)=>{
        const max=decimal(p.amount).minus(sum(p.refundPayments,'amount')),applied=max.lt(remaining)?max:remaining;
        remaining=remaining.minus(applied);
        return{paymentId:p.id,paymentMethodId:p.paymentMethodId,kind:p.paymentMethod.kind,amount:amount(applied),maxRefundable:amount(max),requiresReference:p.paymentMethod.kind!=='CASH'};
      });
      if(remaining.gt(0))fail('RECONCILIATION_REQUIRED','Las capturas no cubren la devolución.');
      const result=[];
      for(const d of documents){
        const original=await tx.catalogStockMovement.findFirst({where:{companyId,sourceType:'POS_SALE',sourceId:orderId,sourceLineId:d.line.id,balanceApplied:true}});
        result.push({orderLineId:d.line.id,quantity:d.quantity,amount:d.amount,subtotalAmount:d.subtotalAmount,taxAmount:d.taxAmount,
          restock:d.restock,stockRestorable:Boolean(original)&&decimal(d.quantity).isInteger(),stockMessage:original?null:'Sin salida comercial registrada: no se crearán existencias.'});
      }
      return commerceDto({orderId,expectedVersion:order.version,currency:order.currency,lines:result,totalAmount:amount(total),
        taxAmount:amount(sum(documents,'taxAmount')),subtotalAmount:amount(sum(documents,'subtotalAmount')),payments});
    },{isolationLevel:'RepeatableRead'});
  }
  return {lines,preview};
}
