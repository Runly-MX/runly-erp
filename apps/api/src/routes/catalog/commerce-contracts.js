import { z } from 'zod';
export const id = z.string().uuid();
const reason = z.string().trim().min(1).max(500);
export const sellablesQuery = z.object({ outletId:id,categoryId:id.optional(),search:z.string().trim().max(200).optional(),
  page:z.coerce.number().int().positive().default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50) }).strict();
export const outletQuery = z.object({outletId:id}).strict();
export const scanQuery = z.object({outletId:id,code:z.string().trim().min(1).max(200)}).strict();
export const stockAdjustment = z.object({variantId:id.nullable().optional(),outletId:id.nullable(),quantityDelta:z.number().int().min(-2147483647).max(2147483647).refine((n)=>n!==0),reason,note:z.string().max(500).optional()}).strict();
export const stockAllocation = z.object({variantId:id.nullable().optional(),outletId:id,quantity:z.number().int().positive().max(2147483647),reason}).strict();
export const availabilityBody = z.object({outletId:id.nullable().optional(),enabled:z.boolean().nullable()}).strict().refine((v)=>v.outletId || v.enabled!==null,'La configuración general requiere enabled.');
export const taxBody = z.object({rate:z.union([z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/),z.number().finite()]).nullable(),included:z.boolean().nullable()}).strict()
  .refine((v)=>(v.rate===null)===(v.included===null),'Restablece ambos campos para heredar.')
  .refine((v)=>v.rate===null || (Number(v.rate)>=0 && Number(v.rate)<=100),'Tasa fuera de rango.');
