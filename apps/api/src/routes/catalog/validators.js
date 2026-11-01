// apps/api/src/routes/catalog/validators.js
import { z } from 'zod'

export const createCategorySchema = z.object({
  name:           z.string().min(1).max(120),
  slug:           z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  description:    z.string().max(500).optional(),
  parent_id:      z.string().uuid().optional().nullable(),
  cover_asset_id: z.string().uuid().optional().nullable(),
  position:       z.number().int().min(0).default(0),
})

export const updateCategorySchema = z.object({
  ...createCategorySchema.shape,
  position: z.number().int().min(0),
}).partial().strict()

export const createProductSchema = z.object({
  name:             z.string().min(1).max(200),
  slug:             z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description:      z.string().max(5000).optional(),
  product_type:     z.enum(['SIMPLE', 'VARIABLE']).default('SIMPLE'),
  sku:              z.string().max(100).optional().nullable(),
  barcode:          z.string().max(100).optional().nullable(),
  price:            z.number().min(0).default(0),
  compare_price:    z.number().min(0).optional().nullable(),
  currency:         z.string().length(3).default('USD'),
  weight:           z.number().min(0).optional().nullable(),
  stock:            z.number().int().min(0).default(0),
  track_stock:      z.boolean().default(false),
  attributes:       z.array(z.object({ key: z.string().min(1), value: z.string() })).default([]),
  cover_asset_id:   z.string().uuid().optional().nullable(),
  images:           z.array(z.string().uuid()).default([]),
  category_id:      z.string().uuid().optional().nullable(),
  meta_title:       z.string().max(160).optional().nullable(),
  meta_description: z.string().max(320).optional().nullable(),
  published:        z.boolean().default(false),
})

export const updateProductSchema = z.object({
  name:             z.string().min(1).max(200),
  slug:             z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description:      z.string().max(5000).optional().nullable(),
  product_type:     z.enum(['SIMPLE', 'VARIABLE']),
  sku:              z.string().max(100).optional().nullable(),
  barcode:          z.string().max(100).optional().nullable(),
  price:            z.number().min(0),
  compare_price:    z.number().min(0).optional().nullable(),
  currency:         z.string().length(3),
  weight:           z.number().min(0).optional().nullable(),
  track_stock:      z.boolean(),
  attributes:       z.array(z.object({ key: z.string().min(1), value: z.string() })),
  cover_asset_id:   z.string().uuid().optional().nullable(),
  images:           z.array(z.string().uuid()),
  category_id:      z.string().uuid().optional().nullable(),
  meta_title:       z.string().max(160).optional().nullable(),
  meta_description: z.string().max(320).optional().nullable(),
  published:        z.boolean(),
  expectedVersion:  z.number().int().positive().optional(),
}).partial().strict()

export const createOptionSchema = z.object({
  name:     z.string().min(1).max(60),
  position: z.number().int().min(0).default(0),
  values:   z.array(z.string().min(1).max(60)).min(1),
})

export const updateOptionSchema = z.object({
  name:     z.string().min(1).max(60).optional(),
  position: z.number().int().min(0).optional(),
  values:   z.array(z.string().min(1).max(60)).min(1).optional(),
})

export const createVariantSchema = z.object({
  option_values:  z.record(z.string(), z.string()).default({}),
  sku:            z.string().max(100).optional().nullable(),
  barcode:        z.string().max(100).optional().nullable(),
  price:          z.number().min(0).nullable().default(0),
  compare_price:  z.number().min(0).optional().nullable(),
  stock:          z.number().int().min(0).default(0),
  cover_asset_id: z.string().uuid().optional().nullable(),
})

// PATCH must never inherit creation defaults: Zod 4 evaluates defaults even
// inside optional properties. An absent field must stay absent.
export const updateVariantSchema = z.object({
  option_values: z.record(z.string(), z.string()),
  sku: z.string().max(100).nullable(),
  barcode: z.string().max(100).nullable(),
  price: z.number().min(0).nullable(),
  compare_price: z.number().min(0).nullable(),
  cover_asset_id: z.string().uuid().nullable(),
  expectedVersion: z.number().int().positive(),
}).partial().strict()

export const createStockMovementSchema = z.object({
  variant_id:     z.string().uuid().optional().nullable(),
  quantity_delta: z.number().int().refine(n => n !== 0, { message: 'quantity_delta cannot be zero' }),
  reason:         z.string().max(200).optional(),
  note:           z.string().max(500).optional(),
})

export const reorderCategoriesSchema = z.object({
  items: z.array(z.object({
    id:       z.string().uuid(),
    position: z.number().int().min(0),
  })).min(1),
})
