import {fail,json,commerceDto,RESTAURANT_LATE_AFTER_MINUTES,KITCHEN_UNDO_WINDOW_MS} from './pos-contracts.js';

export function createPosPreparationService({commands,store,prisma}) {
  const financial=['PAID','CANCELLED','REFUNDED'];
  const sequence=['PENDING','IN_PREPARATION','READY','DELIVERED'];
  const lateAfterMinutes=RESTAURANT_LATE_AFTER_MINUTES;
  async function restaurant(tx,value){
    if(value.experience!=='RESTAURANT')fail('INVALID_TRANSITION','La preparación corresponde a Restaurante.');
    const outlet=await store.row(tx,'posOutlet',value.companyId,value.outletId,{enabled:true});
    if(!['RESTAURANT','HYBRID'].includes(outlet.mode))fail('INVALID_TRANSITION','La sucursal no admite Restaurante.');
    return outlet;
  }
  function derived(rows){
    const active=rows.filter(r=>r.status!=='CANCELLED');
    if(!active.length)return 'CANCELLED';
    if(active.every(r=>r.status==='DELIVERED'))return 'DELIVERED';
    if(active.every(r=>['READY','DELIVERED'].includes(r.status)))return 'READY';
    return active.some(r=>r.status!=='PENDING')?'IN_PREPARATION':'PENDING';
  }
  async function syncTicket(tx,id){
    const rows=await tx.posKitchenTicketLine.findMany({where:{ticketId:id}}),status=derived(rows);
    const before=await tx.posKitchenTicket.findUnique({where:{id}}),active=rows.filter(r=>r.status!=='CANCELLED');
    await tx.posKitchenTicket.update({where:{id},data:{status,version:{increment:1},
      startedAt:status==='CANCELLED'?before.startedAt:active.some(r=>r.status!=='PENDING')?(before.startedAt??new Date()):null,
      readyAt:status==='CANCELLED'?before.readyAt:['READY','DELIVERED'].includes(status)?(before.readyAt??new Date()):null,
      deliveredAt:status==='DELIVERED'?(before.deliveredAt??new Date()):before.deliveredAt}});
  }
  async function syncOrder(tx,value){
    if(financial.includes(value.status)){await store.advanceOrder(tx,value,{});return;}
    const rows=await tx.posKitchenTicketLine.findMany({where:{ticket:{orderId:value.id,companyId:value.companyId}}});
    const status=derived(rows);
    await store.advanceOrder(tx,value,{status:status==='DELIVERED'?'SERVED':status==='READY'?'PARTIALLY_SERVED':'SENT'});
  }
  async function dispatch(tx,ctx,data,{orderId}){
    const value=await store.order(tx,ctx.companyId,orderId,data.expectedVersion),outlet=await restaurant(tx,value);
    if(financial.includes(value.status))fail('INVALID_TRANSITION','La cuenta cerrada no se envía a preparación.');
    if(new Set(data.lineIds).size!==data.lineIds.length)fail('VALIDATION_ERROR','No repitas partidas.',400);
    const lines=await tx.posOrderLine.findMany({where:{orderId,voided:false,id:{in:data.lineIds}},include:{modifiers:true},orderBy:{id:'asc'}});
    if(lines.length!==data.lineIds.length)fail('NOT_FOUND','Partida no encontrada en la cuenta.',404);
    const sent=await tx.posKitchenTicketLine.findMany({where:{orderLineId:{in:data.lineIds}}});
    const already=lines.filter(l=>l.dispatchedAt||l.kitchenStatus!=='PENDING'||sent.some(s=>s.orderLineId===l.id)||(!l.preparationTracked&&['SENT','PARTIALLY_SERVED','SERVED'].includes(value.status)));
    const pending=lines.filter(l=>!already.includes(l));
    if(!pending.length)fail('NO_PENDING_LINES','No quedan partidas nuevas por enviar.');
    await store.settings(tx,ctx.companyId);
    const manual=!outlet.kitchenKdsEnabled&&!outlet.kitchenPrintEnabled;
    const byStation=new Map(),skippedLineIds=already.map(l=>l.id);
    for(const line of pending){
      const configs=await tx.posProductConfig.findMany({where:{companyId:ctx.companyId,productId:line.productId,OR:[{variantId:line.variantId??null},{variantId:null}]}});
      const config=configs.find(c=>c.variantId===line.variantId)??configs.find(c=>!c.variantId);
      if(manual||config?.requiresPreparation===false){skippedLineIds.push(line.id);continue;}
      const stationId=config?.stationId??line.preparationStationId??outlet.defaultStationId;
      if(!stationId||!await tx.posKitchenStation.findFirst({where:{id:stationId,companyId:ctx.companyId,outletId:value.outletId,enabled:true}}))fail('PREPARATION_STATION_REQUIRED','Configura una estación habilitada en esta sucursal o selecciona preparación manual.');
      if(!byStation.has(stationId))byStation.set(stationId,[]);
      byStation.get(stationId).push(line);
    }
    const last=await tx.posKitchenDispatch.findFirst({where:{companyId:ctx.companyId,orderId},orderBy:{sequence:'desc'}});
    const table=value.tableId?await store.row(tx,'posTable',ctx.companyId,value.tableId):null;
    const waiter=value.waiterId?await tx.userProfile.findUnique({where:{id:value.waiterId},select:{displayName:true}}):null;
    const terminal=value.terminalId?await tx.posTerminal.findFirst({where:{id:value.terminalId,companyId:ctx.companyId}}):null;
    const snapshot=json({outletId:value.outletId,orderNumber:value.orderNumber,tableName:table?.name??null,
      orderLabel:table?.name??`${{TAKEAWAY:'Para llevar',PICKUP:'Recoger',DELIVERY:'Entrega',DINE_IN:'Cuenta'}[value.fulfillmentType]} #${value.orderNumber}`,
      waiterName:waiter?.displayName??(terminal?`Mostrador · ${terminal.name}`:null),waiterId:value.waiterId,
      lateAfterMinutes,manual,skippedLineIds,lines:pending.map(l=>({orderLineId:l.id,productName:l.productName,variantLabel:l.variantLabel,
        quantity:String(l.quantity),note:l.note,modifiers:l.modifiers.map(m=>({groupName:m.groupName,optionName:m.optionName}))}))});
    const d=await tx.posKitchenDispatch.create({data:{companyId:ctx.companyId,orderId,sequence:(last?.sequence??0)+1,snapshot}});
    const tickets=[];
    for(const [stationId,rows] of byStation){
      const ticket=await tx.posKitchenTicket.create({data:{companyId:ctx.companyId,orderId,stationId,dispatchId:d.id,sentAt:d.dispatchedAt}});
      await tx.posKitchenTicketLine.createMany({data:rows.map(l=>({ticketId:ticket.id,orderLineId:l.id,quantity:l.quantity,note:l.note,
        snapshot:snapshot.lines.find(s=>s.orderLineId===l.id)}))});
      tickets.push({...ticket,lineIds:rows.map(l=>l.id)});
    }
    await tx.posOrderLine.updateMany({where:{id:{in:pending.map(l=>l.id)},orderId},data:{dispatchedAt:d.dispatchedAt}});
    await store.advanceOrder(tx,value,{status:'SENT'});
    const result={dispatchId:d.id,dispatchSequence:d.sequence,dispatchedAt:d.dispatchedAt,orderId,tickets,skippedLineIds,manual,order:await store.dto(tx,ctx.companyId,orderId)};
    await commands.audit(tx,{...ctx,entityType:'PosKitchenDispatch',entityId:d.id,action:'pos.kitchen.dispatch',after:result});
    return result;
  }
  async function kitchenLine(tx,ctx,data,{ticketId,lineId}){
    const initial=await store.row(tx,'posKitchenTicket',ctx.companyId,ticketId);
    const value=await store.order(tx,ctx.companyId,initial.orderId);await restaurant(tx,value);
    await store.row(tx,'posKitchenStation',ctx.companyId,initial.stationId,{outletId:value.outletId,enabled:true});
    if(['CANCELLED','REFUNDED'].includes(value.status))fail('INVALID_TRANSITION','La cuenta ya fue cancelada o devuelta.');
    const line=await tx.posKitchenTicketLine.findFirst({where:{id:lineId,ticketId}});
    if(!line)fail('NOT_FOUND','Partida de cocina no encontrada.',404);
    if(line.version!==data.expectedVersion)fail('RESOURCE_VERSION_CONFLICT','La partida de cocina cambió.');
    const from=sequence.indexOf(line.status),to=sequence.indexOf(data.status),undo=to===from-1;
    if(from<0||to<0||!(to===from+1||undo)||line.status==='DELIVERED')fail('INVALID_TRANSITION','Transición de preparación no permitida.');
    if(undo&&(!data.reason||!['READY','IN_PREPARATION'].includes(line.status)||financial.includes(value.status)||
      line.previousStatus!==data.status||line.transitionById!==ctx.actorId||!line.transitionAt||Date.now()-line.transitionAt.getTime()>KITCHEN_UNDO_WINDOW_MS))fail('UNDO_NOT_ALLOWED','Sólo el autor puede deshacer su último paso durante cinco segundos y antes de cerrar la cuenta.');
    const after=await tx.posKitchenTicketLine.update({where:{id:lineId},data:{status:data.status,version:{increment:1},
      previousStatus:undo?null:line.status,transitionById:ctx.actorId,transitionAt:new Date()}});
    await tx.posOrderLine.update({where:{id:line.orderLineId},data:{kitchenStatus:data.status}});
    await syncTicket(tx,ticketId);await syncOrder(tx,value);
    await commands.audit(tx,{...ctx,entityType:'PosKitchenTicketLine',entityId:lineId,action:undo?'pos.kitchen.undo':'pos.kitchen.advance',before:line,after,metadata:{reason:data.reason??null}});
    return {orderId:value.id,orderVersion:value.version+1,line:after,ticket:await tx.posKitchenTicket.findUnique({where:{id:ticketId}})};
  }
  async function voidPreparation(tx,ctx,data,{orderId,lineId}){
    const value=await store.order(tx,ctx.companyId,orderId,data.expectedVersion);await restaurant(tx,value);
    if(financial.includes(value.status)||store.decimal(value.paidAmount).gt(0))fail('REFUND_REQUIRED','La anulación de preparación sólo se admite antes del primer pago.');
    const line=await tx.posOrderLine.findFirst({where:{id:lineId,orderId,voided:false}});
    if(!line)fail('NOT_FOUND','Partida no encontrada.',404);
    const tickets=await tx.posKitchenTicketLine.findMany({where:{orderLineId:lineId,ticket:{companyId:ctx.companyId,orderId}}});
    if(line.kitchenStatus==='DELIVERED'||tickets.some(t=>t.status==='DELIVERED'))fail('INVALID_TRANSITION','No se revierte una entrega terminada.');
    await tx.posOrderLine.update({where:{id:lineId},data:{voided:true,kitchenStatus:'CANCELLED',taxAmount:0,totalAmount:0}});
    await tx.posKitchenTicketLine.updateMany({where:{orderLineId:lineId,ticket:{companyId:ctx.companyId,orderId}},data:{status:'CANCELLED',version:{increment:1},previousStatus:null}});
    for(const id of new Set(tickets.map(t=>t.ticketId)))await syncTicket(tx,id);
    await store.recalculate(tx,value);
    const after=await store.dto(tx,ctx.companyId,orderId);
    await commands.audit(tx,{...ctx,entityType:'PosOrderLine',entityId:lineId,action:'pos.preparation.void',before:line,after,
      metadata:{reason:data.reason,stockMovement:false,wasteRequiresSeparateAdjustment:tickets.some(t=>t.status!=='PENDING')}});
    return after;
  }
  async function hydrateTickets(tx,tickets){
    if(!tickets.length)return [];
    const companyId=tickets[0].companyId;
    const [orders,dispatches,rows]=await Promise.all([
      tx.posOrder.findMany({where:{companyId,id:{in:tickets.map(t=>t.orderId)}}}),
      tx.posKitchenDispatch.findMany({where:{companyId,id:{in:tickets.map(t=>t.dispatchId).filter(Boolean)}}}),
      tx.posKitchenTicketLine.findMany({where:{ticketId:{in:tickets.map(t=>t.id)}},orderBy:{id:'asc'}}),
    ]);
    const [tables,waiters,sources]=await Promise.all([
      tx.posTable.findMany({where:{companyId,id:{in:orders.map(o=>o.tableId).filter(Boolean)}}}),
      tx.userProfile.findMany({where:{id:{in:orders.map(o=>o.waiterId).filter(Boolean)}},select:{id:true,displayName:true}}),
      tx.posOrderLine.findMany({where:{id:{in:rows.filter(l=>!l.snapshot).map(l=>l.orderLineId)},order:{companyId}},include:{modifiers:true}}),
    ]);
    const byId=values=>new Map(values.map(v=>[v.id,v]));
    const om=byId(orders),dm=byId(dispatches),tm=byId(tables),wm=byId(waiters),sm=byId(sources),grouped=new Map();
    for(const l of rows){
      const source=l.snapshot??sm.get(l.orderLineId);
      if(!grouped.has(l.ticketId))grouped.set(l.ticketId,[]);
      grouped.get(l.ticketId).push({...l,productName:source?.productName??null,variantLabel:source?.variantLabel??null,
        modifiers:source?.modifiers??[],historicalSnapshotUnknown:!l.snapshot});
    }
    return tickets.map(t=>{
      const value=om.get(t.orderId);if(!value)fail('RECONCILIATION_REQUIRED','La comanda histórica requiere conciliación de empresa.');
      const dispatch=dm.get(t.dispatchId),s=dispatch?.snapshot,dispatchedAt=dispatch?.dispatchedAt??t.sentAt,table=tm.get(value.tableId),waiter=wm.get(value.waiterId);
      return {...t,lines:grouped.get(t.id)??[],outletId:value.outletId,dispatchedAt,tableName:s?s.tableName:table?.name??null,
        orderLabel:s?.orderLabel??table?.name??`Cuenta #${value.orderNumber}`,waiterName:s?s.waiterName:waiter?.displayName??null,
        dispatchSequence:dispatch?.sequence??null,historicalDispatchUnknown:!dispatch,lateAfterMinutes:s?.lateAfterMinutes??lateAfterMinutes,
        isLate:!['DELIVERED','CANCELLED'].includes(t.status)&&Date.now()-dispatchedAt.getTime()>(s?.lateAfterMinutes??lateAfterMinutes)*60000};
    });
  }
  async function ticketDto(tx,t){return (await hydrateTickets(tx,[t]))[0];}
  async function getTicket(companyId,ticketId){
    return prisma.$transaction(async(tx)=>{
      const t=await store.row(tx,'posKitchenTicket',companyId,ticketId),o=await store.row(tx,'posOrder',companyId,t.orderId);
      await store.row(tx,'posOutlet',companyId,o.outletId,{enabled:true});
      await store.row(tx,'posKitchenStation',companyId,t.stationId,{outletId:o.outletId,enabled:true});
      const printJobs=await tx.posPrintJob.findMany({where:{companyId,ticketId},orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,
        select:{id:true,status:true,transport:true,copy:true,errorCode:true,createdAt:true,finishedAt:true}});
      return commerceDto({...await ticketDto(tx,t),printJobs,physicalConfirmationSupported:false});
    },{isolationLevel:'RepeatableRead'});
  }
  async function listTickets(companyId,query){
    return prisma.$transaction(async(tx)=>{
      await store.row(tx,'posOutlet',companyId,query.outletId,{enabled:true});
      if(query.stationId)await store.row(tx,'posKitchenStation',companyId,query.stationId,{outletId:query.outletId,enabled:true});
      if(query.cursor)await store.row(tx,'posKitchenTicket',companyId,query.cursor,{order:{companyId,outletId:query.outletId},...(query.stationId?{stationId:query.stationId}:{})});
      const where={companyId,order:{companyId,outletId:query.outletId},station:{companyId,outletId:query.outletId,enabled:true},
        ...(query.stationId?{stationId:query.stationId}:{}),status:query.status??{in:['PENDING','IN_PREPARATION','READY']}};
      const rows=await tx.posKitchenTicket.findMany({where,orderBy:[{sentAt:'asc'},{id:'asc'}],take:query.limit+1,...(query.cursor?{cursor:{id:query.cursor},skip:1}:{})});
      const hasMore=rows.length>query.limit,selected=rows.slice(0,query.limit),data=await hydrateTickets(tx,selected);
      return commerceDto({data,pagination:{hasMore,nextCursor:hasMore?selected.at(-1).id:null},serverTime:new Date()});
    },{isolationLevel:'RepeatableRead'});
  }
  return {dispatch,kitchenLine,voidPreparation,listTickets,getTicket,ticketDto};
}
