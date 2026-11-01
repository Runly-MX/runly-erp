import {fail,commerceDto} from './pos-contracts.js';
import {createUserAccessService} from '../../services/user-access-service.js';
import {createPosRecoveryOrders} from './pos-recovery-orders.js';

export function createPosRestaurantService({commands,store,prisma}) {
  const terminal=['PAID','CANCELLED','REFUNDED'];
  async function outlet(tx,companyId,id) {
    const value=await store.row(tx,'posOutlet',companyId,id,{enabled:true});
    if(!['RESTAURANT','HYBRID'].includes(value.mode))fail('INVALID_TRANSITION','Selecciona una sucursal de Restaurante o Mixta.');
    return value;
  }
  async function createTable(tx,ctx,data) {
    await outlet(tx,ctx.companyId,data.outletId);
    await commands.lock(tx,`table-name:${ctx.companyId}:${data.outletId}`);
    if(await tx.posTable.findFirst({where:{companyId:ctx.companyId,outletId:data.outletId,name:{equals:data.name,mode:'insensitive'}}}))fail('TABLE_NAME_CONFLICT','Ya existe una mesa con ese nombre.');
    const value=await tx.posTable.create({data:{companyId:ctx.companyId,...data}});
    await commands.audit(tx,{...ctx,entityType:'PosTable',entityId:value.id,action:'pos.table.create',after:value});
    return value;
  }
  async function updateTable(tx,ctx,{expectedVersion,...data},{tableId}) {
    await tx.$queryRaw`SELECT id FROM pos_table WHERE id=${tableId}::uuid AND company_id=${ctx.companyId}::uuid FOR UPDATE`;
    const value=await store.row(tx,'posTable',ctx.companyId,tableId);
    await outlet(tx,ctx.companyId,value.outletId);
    if(value.version!==expectedVersion)fail('RESOURCE_VERSION_CONFLICT','La mesa cambió en otro dispositivo.');
    const active=await tx.posOrder.count({where:{tableId,companyId:ctx.companyId,status:{notIn:terminal}}});
    if(active&&(data.status||data.enabled===false))fail('TABLE_OCCUPIED','Termina la cuenta antes de liberar o deshabilitar la mesa.');
    if(data.name){
      await commands.lock(tx,`table-name:${ctx.companyId}:${value.outletId}`);
      if(await tx.posTable.findFirst({where:{companyId:ctx.companyId,outletId:value.outletId,id:{not:tableId},name:{equals:data.name,mode:'insensitive'}}}))fail('TABLE_NAME_CONFLICT','Ya existe una mesa con ese nombre.');
    }
    const after=await tx.posTable.update({where:{id:tableId},data:{...data,version:{increment:1},...(data.status==='AVAILABLE'?{waiterId:null}:{})}});
    await commands.audit(tx,{...ctx,entityType:'PosTable',entityId:tableId,action:'pos.table.update',before:value,after});
    return after;
  }
  async function tables(companyId,{outletId,myTablesOnly},actorId) {
    if(myTablesOnly&&!actorId)fail('FORBIDDEN','Identidad requerida para Mis mesas.',403);
    return prisma.$transaction(async(tx)=>{
      await outlet(tx,companyId,outletId);
      const rows=await tx.posTable.findMany({where:{companyId,outletId},orderBy:[{name:'asc'},{id:'asc'}]});
      const orders=await tx.posOrder.findMany({where:{companyId,outletId,tableId:{in:rows.map(r=>r.id)},status:{notIn:terminal}},orderBy:{openedAt:'asc'}});
      const users=await tx.userProfile.findMany({where:{id:{in:orders.map(o=>o.waiterId).filter(Boolean)}},select:{id:true,displayName:true}});
      const ready=await tx.posOrderLine.groupBy({by:['orderId'],where:{orderId:{in:orders.map(o=>o.id)},voided:false,kitchenStatus:'READY'},_count:{_all:true}});
      return commerceDto(rows.filter(t=>!myTablesOnly||orders.some(o=>o.tableId===t.id&&o.waiterId===actorId)||(!orders.some(o=>o.tableId===t.id)&&t.waiterId===actorId)).map(t=>{
        const active=orders.filter(o=>o.tableId===t.id),o=active[0];
        return {...t,status:o?(t.status==='BILL_REQUESTED'?'BILL_REQUESTED':'OCCUPIED'):t.status,activeOrderId:active.length===1?o.id:null,activeOrderIds:active.map(o=>o.id),reconciliationRequired:active.length>1,
          activeOrder:o?{id:o.id,orderNumber:o.orderNumber,totalAmount:o.totalAmount,guestCount:o.guestCount,waiterId:o.waiterId,waiterName:users.find(u=>u.id===o.waiterId)?.displayName??null,openedAt:o.openedAt,version:o.version,
            readyLineCount:ready.find(r=>r.orderId===o.id)?._count._all??0}:null};
      }));
    },{isolationLevel:'RepeatableRead'});
  }
  async function updateRestaurantOrder(tx,ctx,data,{orderId}) {
    const value=await store.order(tx,ctx.companyId,orderId,data.expectedVersion);
    await outlet(tx,ctx.companyId,value.outletId);
    if(value.experience!=='RESTAURANT'||terminal.includes(value.status))fail('INVALID_TRANSITION','La cuenta no admite cambios operativos.');
    if(data.waiterId)await createUserAccessService({prisma:tx}).assertCandidates({companyId:ctx.companyId,userIds:[data.waiterId]});
    if(data.guestCount){
      const seats=await tx.posGuestSeat.findMany({where:{orderId},orderBy:{position:'asc'}});
      if(data.guestCount<seats.length)fail('INVALID_TRANSITION','No se eliminan comensales históricos; conserva sus partidas y atribuciones.');
      if(data.guestCount>seats.length)await tx.posGuestSeat.createMany({data:Array.from({length:data.guestCount-seats.length},(_,i)=>({orderId,label:`Comensal ${seats.length+i+1}`,position:seats.length+i+1}))});
    }
    const {expectedVersion,...changes}=data;void expectedVersion;
    await store.advanceOrder(tx,value,changes);
    if(data.waiterId&&value.tableId)await tx.posTable.updateMany({where:{id:value.tableId,companyId:ctx.companyId,outletId:value.outletId},data:{waiterId:data.waiterId,version:{increment:1}}});
    const after=await store.dto(tx,ctx.companyId,orderId);
    await commands.audit(tx,{...ctx,entityType:'PosOrder',entityId:orderId,action:'pos.restaurant.update',before:value,after});
    return after;
  }
  async function seatReservation(tx,ctx,data,{reservationId}) {
    await tx.$queryRaw`SELECT id FROM pos_reservation WHERE id=${reservationId}::uuid AND company_id=${ctx.companyId}::uuid FOR UPDATE`;
    const r=await store.row(tx,'posReservation',ctx.companyId,reservationId);
    if(r.status!=='CONFIRMED'||r.orderId)fail('INVALID_TRANSITION','La reserva ya fue atendida o cancelada.');
    const o=await createPosRecoveryOrders({commands,store}).createOrder(tx,{...ctx,reservationId:r.id,reservationCustomer:{name:r.guestName,phone:r.guestPhone}},{outletId:r.outletId,tableId:r.tableId??undefined,sessionId:data.sessionId,
      experience:'RESTAURANT',fulfillmentType:'DINE_IN',guestCount:r.partySize,notes:r.notes});
    await tx.posReservation.update({where:{id:r.id},data:{status:'SEATED',orderId:o.id}});
    await commands.audit(tx,{...ctx,entityType:'PosReservation',entityId:r.id,action:'pos.reservation.seat',before:r,after:{orderId:o.id}});
    return o;
  }
  async function requestBill(tx,ctx,data,{orderId}){
    const o=await store.order(tx,ctx.companyId,orderId,data.expectedVersion);
    await outlet(tx,ctx.companyId,o.outletId);
    if(o.experience!=='RESTAURANT'||!o.tableId||terminal.includes(o.status))fail('INVALID_TRANSITION','Sólo una cuenta de mesa activa puede pedir cuenta.');
    await tx.$queryRaw`SELECT id FROM pos_table WHERE id=${o.tableId}::uuid AND company_id=${ctx.companyId}::uuid FOR UPDATE`;
    if(await tx.posOrder.count({where:{companyId:ctx.companyId,tableId:o.tableId,status:{notIn:terminal}}})!==1)fail('RECONCILIATION_REQUIRED','La mesa tiene cuentas históricas que requieren conciliación.');
    await tx.posTable.update({where:{id:o.tableId},data:{status:'BILL_REQUESTED',version:{increment:1}}});
    await store.advanceOrder(tx,o,{});
    const after=await store.dto(tx,ctx.companyId,orderId);
    await commands.audit(tx,{...ctx,entityType:'PosOrder',entityId:orderId,action:'pos.restaurant.request_bill',after});
    return after;
  }
  return {outlet,tables,createTable,updateTable,updateRestaurantOrder,seatReservation,requestBill};
}
