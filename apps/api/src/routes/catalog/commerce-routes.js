import { Hono } from 'hono';
import { CommerceError, parse } from '../pos/pos-contracts.js';
import { getActorId,getCompanyId } from '../pos/service-helpers.js';
import { createCatalogSellablesService } from './catalog-sellables-service.js';
import { createCatalogCommerceStock } from './catalog-commerce-stock.js';
import { createCatalogCommerceAdmin } from './catalog-commerce-admin.js';
import { id,sellablesQuery,outletQuery,scanQuery,stockAdjustment,stockAllocation,availabilityBody,taxBody } from './commerce-contracts.js';

export function createCommerceCatalogRoutes({prisma,requirePermission,requireAnyPermission,supabaseAdmin}) {
  const app=new Hono(),sellables=createCatalogSellablesService({prisma,supabaseAdmin}),stock=createCatalogCommerceStock({prisma}),admin=createCatalogCommerceAdmin({prisma});
  const guard=(middleware)=>async(c,next)=>{
    const response=await middleware(c,next);
    const res=response??c.res;
    if([401,403].includes(res?.status)){
      const body=await res.clone().json().catch(()=>null);
      if(typeof body?.error==='string')return c.json({error:{code:'FORBIDDEN',message:body.error},requestId:c.get('requestId')??`catalog-${Date.now().toString(36)}`},res.status);
    }
    return response;
  };
  const permission=(key)=>guard(requirePermission(key));
  const any=(keys,fallback=keys[0])=>guard(requireAnyPermission?requireAnyPermission(keys):requirePermission(fallback));
  const pos=()=>any(['pos.terminal.use','pos.caja.read','pos.caja.operate','pos.comandas.read','pos.comandas.create']);
  const ctx=(c)=>({companyId:getCompanyId(c),actorId:getActorId(c)}),pid=(c)=>parse(id,c.req.param('id'));
  const handle=(fn)=>async(c)=>{try{return await fn(c);}catch(e){return c.json({error:{code:e instanceof CommerceError?e.code:'INTERNAL_ERROR',message:e instanceof CommerceError?e.message:'No se pudo completar la operación.'},requestId:c.get('requestId')??`catalog-${Date.now().toString(36)}`},e instanceof CommerceError?e.status:500);}};
  // Catalog grants only these scoped read projections, never POS administration.
  app.get('/catalog/outlets',permission('catalog.products.read'),handle(async(c)=>c.json({data:await prisma.posOutlet.findMany({where:{companyId:getCompanyId(c),enabled:true},select:{id:true,name:true,mode:true},orderBy:[{name:'asc'},{id:'asc'}]})})));
  app.get('/catalog/commercial-defaults',permission('catalog.products.read'),handle(async(c)=>{
    const row=await prisma.posSettings.findUnique({where:{companyId:getCompanyId(c)},select:{currency:true,defaultTaxRate:true,pricesIncludeTax:true}});
    return c.json({data:row?{...row,defaultTaxRate:row.defaultTaxRate.toFixed(4)}:null});
  }));
  app.get('/catalog/sellables',permission('catalog.products.read'),handle(async(c)=>c.json(await sellables.list(getCompanyId(c),parse(sellablesQuery,c.req.query())))));
  app.get('/catalog/sellables/:id/variants',permission('catalog.products.read'),handle(async(c)=>c.json({data:await sellables.variants(getCompanyId(c),pid(c),parse(outletQuery,c.req.query()).outletId)})));
  app.get('/pos/v2/sellables',pos(),handle(async(c)=>c.json(await sellables.list(getCompanyId(c),parse(sellablesQuery,c.req.query())))));
  app.get('/pos/v2/categories',pos(),handle(async(c)=>c.json({data:await sellables.categories(getCompanyId(c),parse(outletQuery,c.req.query()).outletId)})));
  app.get('/pos/v2/sellables/:id/variants',pos(),handle(async(c)=>c.json({data:await sellables.variants(getCompanyId(c),pid(c),parse(outletQuery,c.req.query()).outletId)})));
  app.get('/pos/v2/scan',pos(),handle(async(c)=>c.json({data:await sellables.scan(getCompanyId(c),parse(scanQuery,c.req.query()))})));
  app.get('/catalog/products/:id/stock-balances',permission('catalog.products.read'),handle(async(c)=>{
    const q=c.req.query();if(q.variantId)parse(id,q.variantId);if(q.outletId)parse(id,q.outletId);
    return c.json({data:await stock.balances(getCompanyId(c),pid(c),q.variantId,q.outletId)});
  }));
  for(const allocation of [false,true])app.post(`/catalog/products/:id/${allocation?'stock-allocations':'stock-movements'}`,
    any(['catalog.inventory.adjust','catalog.products.update'],'catalog.products.update'),handle(async(c)=>{
      const body=await c.req.json();
      const {variant_id,quantity_delta,...rest}=body;
      const input=allocation?parse(stockAllocation,body):parse(stockAdjustment,{...rest,variantId:rest.variantId??variant_id,quantityDelta:rest.quantityDelta??quantity_delta});
      return c.json({data:await stock.write(ctx(c),pid(c),input,c.req.header('Idempotency-Key'),allocation)});
    }));
  app.get('/catalog/products/:id/stock-movements',permission('catalog.products.read'),handle(async(c)=>{
    const q=c.req.query();if(q.variantId)parse(id,q.variantId);if(q.outletId)parse(id,q.outletId);
    return c.json(await admin.movements(getCompanyId(c),pid(c),q));
  }));
  for(const tax of [false,true]){
    const path=`/catalog/products/:id/${tax?'commercial-tax':'pos-availability'}`;
    app.get(path,permission('catalog.products.read'),handle(async(c)=>{
      const outletId=c.req.query('outletId');if(outletId)parse(id,outletId);
      return c.json({data:tax?await admin.tax(getCompanyId(c),pid(c)):await admin.availability(getCompanyId(c),pid(c),outletId)});
    }));
    app.put(path,permission('catalog.products.update'),handle(async(c)=>c.json({data:await admin.write(ctx(c),pid(c),parse(tax?taxBody:availabilityBody,await c.req.json()),c.req.header('Idempotency-Key'),tax)})));
  }
  return app;
}
