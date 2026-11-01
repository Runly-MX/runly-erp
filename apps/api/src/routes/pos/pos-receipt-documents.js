import {amount,decimal,fail,json,sum} from './pos-contracts.js';

export function createPosReceiptDocuments() {
  function project(receipt, metadata={}) {
    const snapshot=receipt.payload,order=snapshot?.order??(snapshot?.id===receipt.orderId?snapshot:null);
    if(!order?.lines || !order.payments || !['SALE','REFUND','REPRINT'].includes(receipt.kind))return null;
    if(receipt.orderId&&order.id!==receipt.orderId)return null;
    if(receipt.kind!=='REFUND'&&!['PAID','REFUNDED'].includes(order.status))return null;
    const refund=snapshot.refund;
    if(receipt.kind==='REFUND'&&!refund?.lines)return null;
    const line=(l,returned)=>({orderLineId:l.id,productId:l.productId,variantId:l.variantId??null,
      name:l.productName,variantLabel:l.variantLabel??null,sku:l.sku??null,
      quantity:decimal(returned?.quantity??l.quantity).toFixed(3),unitPrice:amount(l.unitPrice),discountAmount:returned?null:amount(l.discountAmount??0),
      subtotalAmount:returned?amount(decimal(returned.amount).minus(returned.taxAmount)):amount(decimal(l.totalAmount).minus(l.taxAmount)),
      taxAmount:amount(returned?.taxAmount??l.taxAmount),totalAmount:amount(returned?.amount??l.totalAmount)});
    const lines=refund?refund.lines.map((r)=>{const l=order.lines.find((l)=>l.id===r.orderLineId);return l?line(l,r):null;}):order.lines.filter((l)=>!l.voided).map((l)=>line(l));
    if(lines.some((l)=>!l))return null;
    const methods=snapshot.paymentMethods??[];
    const captures=refund?refund.payments:order.payments.filter((p)=>p.status==='CAPTURED');
    const payments=captures.map((p)=>{
      const original=refund?order.payments.find((o)=>o.id===p.paymentId):p;
      const method=methods.find((m)=>m.id===original?.paymentMethodId)??original?.paymentMethod;
      return{paymentId:original?.id??p.paymentId,paymentMethodId:original?.paymentMethodId??null,name:method?.name??null,kind:method?.kind??'UNKNOWN',
        amount:amount(p.amount),tenderedAmount:refund?null:original?.tenderedAmount==null?null:amount(original.tenderedAmount),
        changeAmount:refund?null:original?.changeAmount==null?null:amount(original.changeAmount),reference:p.reference??original?.reference??null};
    });
    return json({schemaVersion:1,kind:receipt.kind==='REPRINT'?'SALE':receipt.kind,copy:receipt.kind==='REPRINT',header:{companyId:receipt.companyId,companyName:metadata.companyName??null,
      outletId:order.outletId,outletName:metadata.outletName??null,terminalId:metadata.terminalId??order.terminalId??null,terminalName:metadata.terminalName??null,
      receiptNumber:receipt.receiptNumber,orderId:order.id,orderNumber:order.orderNumber,currency:order.currency??null,issuedAt:receipt.createdAt},
      lines,payments,refundId:refund?.id??null,
      totals:{subtotalAmount:refund?amount(lines.length?sum(lines,'subtotalAmount'):refund.amount):amount(order.subtotalAmount),taxAmount:refund?amount(sum(lines,'taxAmount')):amount(order.taxAmount),
        totalAmount:refund?amount(refund.amount):amount(order.totalAmount),capturedAmount:amount(order.paidAmount),refundedAmount:amount(order.refundedAmount??0),
        netPaidAmount:amount(decimal(order.paidAmount).minus(order.refundedAmount??0)),
        tenderedAmount:!refund&&payments.every((p)=>p.tenderedAmount!==null)?amount(sum(payments,'tenderedAmount')):null,
        changeAmount:!refund&&payments.every((p)=>p.changeAmount!==null)?amount(sum(payments,'changeAmount')):null},
      notice:'Comprobante comercial. No es un CFDI.',historicalCurrencyUnknown:!/^[A-Z]{3}$/.test(order.currency??'')});
  }

  async function snapshot(tx,order,kind,receiptNumber,extra={}) {
    const refundSession=extra.refund?.sessionId?await tx.posSession.findFirst({where:{id:extra.refund.sessionId,companyId:order.companyId,outletId:order.outletId}}):null;
    const terminalId=refundSession?.terminalId??order.terminalId;
    const [company,outlet,terminal,methods,time]=await Promise.all([
      tx.company.findUnique({where:{id:order.companyId},select:{name:true}}),
      tx.posOutlet.findFirst({where:{id:order.outletId,companyId:order.companyId},select:{name:true}}),
      terminalId?tx.posTerminal.findFirst({where:{id:terminalId,companyId:order.companyId},select:{name:true}}):null,
      tx.posPaymentMethod.findMany({where:{companyId:order.companyId,id:{in:order.payments.map((p)=>p.paymentMethodId)}},select:{id:true,name:true,kind:true}}),
      tx.$queryRaw`SELECT CURRENT_TIMESTAMP AS issued_at`,
    ]);
    const payload=json({order,...extra,paymentMethods:methods});
    const document=project({companyId:order.companyId,kind,receiptNumber,payload,createdAt:time[0].issued_at},
      {companyName:company?.name,outletName:outlet?.name,terminalId,terminalName:terminal?.name});
    if(!document)fail('RECONCILIATION_REQUIRED','No se pudo generar el comprobante.');
    return {...payload,document};
  }

  function document(receipt) {
    // Legacy snapshots are projected in memory, never rewritten or repriced.
    if(receipt.payload?.document?.schemaVersion===1)return receipt.payload.document;
    try{return project(receipt);}catch{return null;}
  }
  function render(doc,transport,copy) {
    if(!doc || doc.historicalCurrencyUnknown)fail('RECONCILIATION_REQUIRED','El comprobante histórico requiere conciliación antes de imprimir.');
    const value={...doc,copy},h=doc.header;
    const lines=[h.companyName??'Comprobante histórico',h.outletName??'',h.terminalName??'',
      `${doc.kind==='REFUND'?'DEVOLUCIÓN':'VENTA'} #${h.receiptNumber}${copy?' — COPIA':''}`,`Orden #${h.orderNumber}`,h.issuedAt??'',
      ...doc.lines.flatMap((l)=>[`${l.quantity} x ${l.name}${l.variantLabel?` / ${l.variantLabel}`:''}`,`${l.unitPrice} -> ${l.totalAmount}`]),
      `Subtotal ${doc.totals.subtotalAmount}`,`Impuestos ${doc.totals.taxAmount}`,`TOTAL ${doc.totals.totalAmount} ${h.currency}`,
      ...(doc.kind==='SALE'?[`Capturado ${doc.totals.capturedAmount}`,`Devuelto ${doc.totals.refundedAmount}`,`Aplicado neto ${doc.totals.netPaidAmount}`]:[]),
      ...doc.payments.flatMap((p)=>[`${p.name??p.kind}: ${p.amount}`,p.tenderedAmount===null?'':`Recibido ${p.tenderedAmount}`,p.changeAmount===null?'':`Cambio ${p.changeAmount}`]),doc.notice];
    const clean=(s)=>String(s).replace(/[\x00-\x1f\x7f]/g,' ');
    const escape=(s)=>clean(s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    if(transport==='BROWSER')return{document:value,contentType:'text/html',html:`<!doctype html><html lang="es"><meta charset="utf-8"><title>Comprobante #${h.receiptNumber}</title><body><main>${lines.filter(Boolean).map((l)=>`<p>${escape(l)}</p>`).join('')}</main></body></html>`};
    const text=lines.filter(Boolean).map((s)=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?').match(/.{1,32}/g)?.join('\n')??'').join('\n')+'\n\n\n';
    const bytes=Buffer.from(text,'ascii');
    if(bytes.length>2*1024*1024)fail('VALIDATION_ERROR','El comprobante excede el límite del transporte.',400);
    return{document:value,contentType:'text/plain',encoding:'base64',charset:'US-ASCII',dataBase64:bytes.toString('base64')};
  }
  return {snapshot,document,render};
}
