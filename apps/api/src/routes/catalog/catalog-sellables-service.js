import { amount, decimal, fail } from '../pos/pos-contracts.js';
import { createCatalogProductService } from './catalog-product-service.js';

export function createCatalogSellablesService({ prisma, supabaseAdmin }) {
  const images = createCatalogProductService({ prisma, supabaseAdmin });
  const messages = { DISABLED: 'El artículo está inactivo.', NOT_AVAILABLE_AT_OUTLET: 'No está habilitado para POS en esta sucursal.',
    CURRENCY_MISMATCH: 'La moneda del artículo no coincide con POS.', NO_ACTIVE_VARIANT: 'No tiene variantes activas.',
    OUT_OF_STOCK_AT_OUTLET: 'No hay existencias en esta sucursal.' };

  async function scope(tx, companyId, outletId) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    if (!await tx.posOutlet.findFirst({ where: { id: outletId, companyId, enabled: true } })) fail('NOT_FOUND', 'Sucursal no encontrada.', 404);
    const settings = await tx.posSettings.findUnique({ where: { companyId } });
    if (!settings) fail('CONFIGURATION_REQUIRED', 'Configura la moneda e impuestos de POS.');
    return { companyId, outletId, settings };
  }

  async function context(tx, products, current) {
    const ids = products.map((p) => p.id);
    const [policies, configs, balances] = await Promise.all([
      tx.catalogPosAvailability.findMany({ where: { companyId: current.companyId, outletId: current.outletId, productId: { in: ids } } }),
      tx.posProductConfig.findMany({ where: { companyId: current.companyId, productId: { in: ids } } }),
      tx.catalogStockBalance.findMany({ where: { companyId: current.companyId, productId: { in: ids }, OR: [{ outletId: current.outletId }, { outletId: null }] } }),
    ]);
    return { ...current, policies, configs, balances };
  }

  function dto(product, variant, current) {
    const parent = current.configs.find((c) => c.productId === product.id && c.variantId === null);
    const config = variant ? current.configs.find((c) => c.productId === product.id && c.variantId === variant.id) : parent;
    const policy = current.policies.find((p) => p.productId === product.id);
    const enabled = policy?.enabled ?? (product.posEnabled && parent?.availableInPos !== false);
    const stock = current.balances.find((b) => b.productId === product.id && b.variantId === (variant?.id ?? null) && b.outletId === current.outletId)?.quantity ?? 0;
    const unallocatedStock = current.balances.find((b) => b.productId === product.id && b.variantId === (variant?.id ?? null) && b.outletId === null)?.quantity ?? 0;
    const reason = !product.enabled || variant?.enabled === false ? 'DISABLED' : !enabled || (variant && config?.availableInPos === false) ? 'NOT_AVAILABLE_AT_OUTLET'
      : product.currency !== current.settings.currency ? 'CURRENCY_MISMATCH' : product.trackStock && stock <= 0 ? 'OUT_OF_STOCK_AT_OUTLET' : null;
    return { id: variant?.id ?? product.id, productId: product.id, variantId: variant?.id ?? null,
      productType: product.productType, name: product.name, categoryId: product.categoryId, categoryName: product.category?.companyId===current.companyId ? product.category.name : null,
      optionValues: variant?.optionValues ?? {}, variantLabel: variant ? Object.values(variant.optionValues ?? {}).join(' / ') || null : null,
      sku: variant?.sku ?? product.sku, barcode: variant?.barcode ?? product.barcode,
      price: amount(variant && !variant.priceInherited ? variant.price : product.price), currency: product.currency,
      priceInherited: Boolean(variant?.priceInherited), priceVersion: variant && !variant.priceInherited ? variant.priceVersion : product.priceVersion,
      tax: { rate: decimal(product.commercialTaxRate ?? current.settings.defaultTaxRate).toFixed(4), included: product.commercialTaxIncluded ?? current.settings.pricesIncludeTax },
      requiresVariant: product.productType === 'VARIABLE' && !variant, trackStock: product.trackStock,
      stock: product.trackStock ? stock : null, unallocatedStock: product.trackStock ? unallocatedStock : null,
      stockState: !product.trackStock ? 'UNTRACKED' : stock > 0 ? 'AVAILABLE' : unallocatedStock > 0 ? 'UNALLOCATED' : 'OUT_OF_STOCK',
      available: !reason, unavailableReason: reason,
      unavailableMessage: reason === 'OUT_OF_STOCK_AT_OUTLET' && unallocatedStock > 0 ? 'Hay existencias «Sin asignar»; asígnalas a esta sucursal.' : messages[reason] ?? null,
      requiresPreparation: config?.requiresPreparation ?? parent?.requiresPreparation ?? true,
      imageUrl: null,
    };
  }

  function parentDto(product, current) {
    const result = dto(product, null, current);
    if (product.productType !== 'VARIABLE') return result;
    if(result.unavailableReason && result.unavailableReason!=='OUT_OF_STOCK_AT_OUTLET')return {...result,stock:null,price:null};
    const variants = (product.variants ?? []).map((v) => dto(product, v, current));
    const active = variants.filter((v) => v.available).sort((a,b) => decimal(a.price).comparedTo(b.price));
    const fallback = variants.find((v) => v.unavailableReason !== 'DISABLED');
    return { ...result, stock: null, stockState: active.length ? 'AVAILABLE' : fallback?.stockState ?? 'OUT_OF_STOCK',
      price: active[0]?.price ?? null, available: active.length > 0,
      unavailableReason: active.length ? null : fallback?.unavailableReason ?? 'NO_ACTIVE_VARIANT',
      unavailableMessage: active.length ? null : fallback?.unavailableMessage ?? messages.NO_ACTIVE_VARIANT };
  }

  async function list(companyId, query) {
    return prisma.$transaction(async (tx) => {
      const current = await scope(tx, companyId, query.outletId);
      const search = query.search ? { contains: query.search, mode: 'insensitive' } : null;
      const where = { companyId, enabled: true, ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(search ? { OR: [{ name: search },{ sku: search },{ barcode: search },{ variants: { some: { companyId, enabled: true, OR: [{ sku: search },{ barcode: search }] } } }] } : {}) };
      const [products,total] = await Promise.all([tx.catalogProduct.findMany({ where, include: { variants: { where: { companyId } }, category: true },
        orderBy: [{ name:'asc' },{ id:'asc' }], skip:(query.page-1)*query.pageSize, take:query.pageSize }), tx.catalogProduct.count({ where })]);
      const support = await context(tx, products, current);
      const urls = await images.resolveImageUrls(products.map((p) => ({ ...p, cover_asset_id:p.coverAssetId })), { companyId });
      const data = products.map((p,i) => ({ ...parentDto(p,support), imageUrl:urls[i]?.image_url ?? null }));
      return { data, pagination:{ page:query.page,pageSize:query.pageSize,total,hasMore:query.page*query.pageSize<total } };
    }, { isolationLevel:'RepeatableRead',timeout:20000 });
  }

  async function variants(companyId, productId, outletId) {
    const current = await scope(prisma,companyId,outletId);
    const product = await prisma.catalogProduct.findFirst({ where:{ id:productId,companyId },include:{variants:{where:{companyId}},category:true} });
    if(!product) fail('NOT_FOUND','Producto no encontrado.',404);
    const support=await context(prisma,[product],current);
    return product.variants.map((v)=>dto(product,v,support));
  }

  async function categories(companyId,outletId) {
    await scope(prisma,companyId,outletId);
    return prisma.catalogCategory.findMany({ where:{ companyId,enabled:true },orderBy:[{position:'asc'},{name:'asc'},{id:'asc'}],select:{id:true,name:true,parentId:true,position:true} });
  }

  async function scan(companyId,query) {
    return prisma.$transaction(async(tx)=>{
      const current=await scope(tx,companyId,query.outletId);
      let mode='barcode';
      const find=(sku)=>tx.catalogProduct.findMany({where:{companyId,OR:[{[sku?'sku':'barcode']:sku?{equals:query.code,mode:'insensitive'}:query.code},
        {variants:{some:{companyId,[sku?'sku':'barcode']:sku?{equals:query.code,mode:'insensitive'}:query.code}}}]},include:{variants:{where:{companyId}},category:true},orderBy:{id:'asc'}});
      let products=await find(false);
      if(!products.length){products=await find(true);mode='sku';}
      const support=await context(tx,products,current),matches=[];
      const equal=(v)=>typeof v==='string' && (mode==='sku'?v.toLowerCase()===query.code.toLowerCase():v===query.code);
      for(const p of products){
        if(equal(p[mode]))matches.push(parentDto(p,support));
        for(const v of p.variants)if(equal(v[mode]))matches.push(dto(p,v,support));
      }
      return {matches,ambiguous:matches.length>1};
    },{isolationLevel:'RepeatableRead'});
  }

  async function snapshot(tx,value,product,variant) {
    const current=await scope(tx,value.companyId,value.outletId);
    current.settings={...current.settings,currency:value.currency,defaultTaxRate:value.taxSnapshot?.rate,pricesIncludeTax:value.taxSnapshot?.included};
    const support=await context(tx,[product],current),result=dto(product,variant,support);
    // Carts do not reserve units: payment rechecks the grouped quantities under locks.
    if(result.unavailableReason && result.unavailableReason!=='OUT_OF_STOCK_AT_OUTLET')fail(result.unavailableReason,result.unavailableMessage);
    return result;
  }

  return {list,variants,categories,scan,snapshot};
}
