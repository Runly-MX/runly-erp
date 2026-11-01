import { parse } from '../pos/pos-contracts.js';
import { id } from './commerce-contracts.js';
import { createProductSchema, updateProductSchema } from './validators.js';
import { createCatalogProductService } from './catalog-product-service.js';
import { createCatalogWriteService } from './catalog-write-service.js';

export function createCatalogSyncWriteService({prisma}) {
  const writes=createCatalogWriteService({prisma});
  const snake=(key)=>key.replace(/[A-Z]/g,(c)=>`_${c.toLowerCase()}`);
  async function apply(ctx,mutation) {
    const {operation,recordId,idempotencyKey,clientUpdatedAt}=mutation;
    const body=Object.fromEntries(Object.entries(mutation.payload??{}).map(([k,v])=>[snake(k),v]));
    // expectedVersion is protocol metadata, not a product column.
    if(Object.hasOwn(body,'expected_version')){body.expectedVersion=body.expected_version;delete body.expected_version;}
    const parsed=parse(operation==='CREATE'?createProductSchema:updateProductSchema,body);
    const {expectedVersion,...data}=parsed;
    if(recordId)parse(id,recordId);
    return writes.create(ctx,`catalog.product.sync.${operation.toLowerCase()}`,mutation,idempotencyKey,async(tx)=>{
      if(operation==='CREATE'){
        const row=await createCatalogProductService({prisma:tx}).createProduct({companyId:ctx.companyId,id:recordId??null,data});
        return tx.catalogProduct.findUnique({where:{id:row.id}});
      }
      return writes.patchTx(tx,ctx,{productId:recordId,data,expectedVersion,clientUpdatedAt},async()=>{
        await createCatalogProductService({prisma:tx}).updateProduct({companyId:ctx.companyId,id:recordId,data});
        return tx.catalogProduct.findUnique({where:{id:recordId}});
      });
    });
  }
  return {apply};
}
