import { fail, json } from '../pos/pos-contracts.js';
import { createPosCommandService } from '../pos/pos-command-service.js';
import { createCatalogCommerceStock } from './catalog-commerce-stock.js';

export function createCatalogCommerceAdmin({prisma}) {
  const commands=createPosCommandService({prisma}),stock=createCatalogCommerceStock({prisma});
  async function availability(companyId,productId,outletId) {
    const {product}=await stock.item(prisma,companyId,productId,null,false);
    await stock.outlet(prisma,companyId,outletId);
    const [outlets,policies,config,variants]=await Promise.all([
      prisma.posOutlet.findMany({where:{companyId,enabled:true,...(outletId?{id:outletId}:{})},orderBy:{name:'asc'}}),
      prisma.catalogPosAvailability.findMany({where:{companyId,productId}}),
      prisma.posProductConfig.findFirst({where:{companyId,productId,variantId:null}}),
      prisma.posProductConfig.findMany({where:{companyId,productId,variantId:{not:null},availableInPos:false}}),
    ]);
    const baseline=product.posEnabled && config?.availableInPos!==false;
    return {productId,baseline,variantPolicy:'INHERITS_PRODUCT_WITH_LEGACY_DISABLED_GUARD',disabledVariantIds:variants.map((v)=>v.variantId),
      outlets:outlets.map((o)=>{const p=policies.find((p)=>p.outletId===o.id);return{outletId:o.id,name:o.name,enabled:p?.enabled??baseline,inherited:p?.enabled==null};})};
  }
  async function write(ctx,productId,data,key,tax=false) {
    return commands.run({...ctx,operation:tax?'catalog.tax':'catalog.availability',key,input:{productId,data},serialize:json,execute:async(tx)=>{
      const {product}=await stock.item(tx,ctx.companyId,productId,null,false);
      if(tax)await tx.catalogProduct.update({where:{id:productId},data:{commercialTaxRate:data.rate,commercialTaxIncluded:data.included}});
      else if(data.outletId){
        await stock.outlet(tx,ctx.companyId,data.outletId);
        await tx.catalogPosAvailability.upsert({where:{companyId_productId_outletId:{companyId:ctx.companyId,productId,outletId:data.outletId}},
          create:{companyId:ctx.companyId,productId,outletId:data.outletId,enabled:data.enabled},update:{enabled:data.enabled,updatedAt:new Date()}});
      }else{
        await tx.catalogProduct.update({where:{id:productId},data:{posEnabled:data.enabled}});
        await tx.posProductConfig.updateMany({where:{companyId:ctx.companyId,productId,variantId:null},data:{availableInPos:data.enabled}});
      }
      const after=tax?await tx.catalogProduct.findUnique({where:{id:productId}}):data;
      await commands.audit(tx,{...ctx,moduleKey:'runly.catalog',entityType:'CatalogProduct',entityId:productId,action:tax?'catalog.tax.update':'catalog.availability.update',before:product,after});
      return tax?{productId,rate:after.commercialTaxRate?.toFixed(4)??null,included:after.commercialTaxIncluded,inherited:after.commercialTaxRate===null}:data;
    }});
  }
  async function tax(companyId,productId){
    const {product}=await stock.item(prisma,companyId,productId,null,false);
    const settings=await prisma.posSettings.findUnique({where:{companyId}});
    return {productId,rate:product.commercialTaxRate?.toFixed(4)??null,included:product.commercialTaxIncluded,inherited:product.commercialTaxRate===null,
      effective:{rate:(product.commercialTaxRate??settings?.defaultTaxRate)?.toFixed(4)??null,included:product.commercialTaxIncluded??settings?.pricesIncludeTax??null}};
  }
  async function movements(companyId,productId,query={}){
    await stock.item(prisma,companyId,productId,query.variantId,false);await stock.outlet(prisma,companyId,query.outletId);
    const limit=Math.min(200,Math.max(1,Number(query.limit)||50)),offset=Math.max(0,Number(query.offset)||0);
    if(!Number.isInteger(limit)||!Number.isInteger(offset))fail('VALIDATION_ERROR','Paginación inválida.',400);
    const where={companyId,productId,...(query.variantId?{variantId:query.variantId}:{}),...(query.outletId?{outletId:query.outletId}:{})};
    const [data,total]=await Promise.all([prisma.catalogStockMovement.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit,skip:offset}),prisma.catalogStockMovement.count({where})]);
    const users=await prisma.userProfile.findMany({where:{id:{in:[...new Set(data.map((d)=>d.userId).filter(Boolean))]}},select:{id:true,displayName:true}});
    const refunds=await prisma.posRefund.findMany({where:{companyId,id:{in:data.filter((d)=>d.sourceType==='POS_REFUND').map((d)=>d.sourceId)}},select:{id:true,orderId:true}});
    const orders=await prisma.posOrder.findMany({where:{companyId,id:{in:[...data.filter((d)=>d.sourceType==='POS_SALE').map((d)=>d.sourceId),...refunds.map((r)=>r.orderId)]}}});
    return {data:data.map((m)=>({...m,quantity_delta:m.quantityDelta,created_at:m.createdAt,variant_id:m.variantId,product_id:m.productId,
      sourceLabel:({POS_SALE:'Venta POS',POS_REFUND:'Devolución POS',MANUAL_ADJUSTMENT:'Ajuste manual',LEGACY_ALLOCATION:'Asignación',OPENING_BALANCE:'Saldo inicial'})[m.sourceType]??'Movimiento histórico',
      actorName:users.find((u)=>u.id===m.userId)?.displayName??null,
      orderId:m.sourceType==='POS_SALE'?m.sourceId:refunds.find((r)=>r.id===m.sourceId)?.orderId??null,
      orderNumber:orders.find((o)=>o.id===(m.sourceType==='POS_SALE'?m.sourceId:refunds.find((r)=>r.id===m.sourceId)?.orderId))?.orderNumber??null})),total};
  }
  return {availability,write,tax,movements};
}
