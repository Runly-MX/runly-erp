import { z } from 'zod'

export const createPageSchema = z.object({
  siteId:    z.string().uuid(),
  title:     z.string().min(1).max(255),
  slug:      z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  routePath: z.string().min(1).max(512).startsWith('/'),
  pageType:  z.enum(['page', 'landing', 'system']).default('page'),
  visibility:z.enum(['public', 'authenticated', 'private']).default('public'),
  seo:       z.record(z.unknown()).optional(),
}).strict()

export const updatePageSchema = z.object({
  title:      z.string().min(1).max(255).optional(),
  slug:       z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  routePath:  z.string().min(1).max(512).startsWith('/').optional(),
  visibility: z.enum(['public', 'authenticated', 'private']).optional(),
  status:     z.enum(['draft', 'published', 'archived']).optional(),
  seo:        z.record(z.unknown()).optional(),
}).strict()

export const saveDraftSchema = z.object({
  builderData: z.union([z.record(z.unknown()), z.string()]),
  seo:         z.record(z.unknown()).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict()

export const siteDraftIdentitySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  siteType: z.enum(['website', 'ecommerce', 'blog', 'landing']).optional(),
  settings: z.record(z.unknown()).optional(), seoDefaults: z.record(z.unknown()).optional(),
  themeId: z.string().uuid().nullable().optional(), homepagePageId: z.string().uuid().nullable().optional(),
}).strict()
export const pageDraftMetadataSchema = updatePageSchema.omit({ status: true, seo: true }).strict()
export const revisionedDraftSchema = z.object({
  document: z.record(z.unknown()), seo: z.record(z.unknown()).optional(),
  metadata: pageDraftMetadataSchema.optional(), expectedRevision: z.number().int().nonnegative(),
}).strict()
export const revisionedSiteSchema = z.object({
  identity: siteDraftIdentitySchema, expectedRevision: z.number().int().nonnegative(),
}).strict()

export const createSiteSchema = z.object({
  name:          z.string().min(1).max(255),
  domain:        z.string().optional(),
  defaultLocale: z.string().default('es'),
  siteType:      z.enum(['website', 'ecommerce', 'blog', 'landing']).default('website'),
  analyticsMode: z.enum(['off', 'anonymous', 'consent_required']).default('off'),
  turnstileSiteKey: z.string().max(500).optional().nullable(),
  turnstileSecretKey: z.string().max(500).optional().nullable(),
}).strict()

export const updateSiteSchema = z.object({
  name:                  z.string().min(1).max(255).optional(),
  domain:                z.string().optional(),
  status:                z.enum(['draft', 'published', 'maintenance']).optional(),
  siteType:              z.enum(['website', 'ecommerce', 'blog', 'landing']).optional(),
  homepagePageId:        z.string().uuid().optional().nullable(),
  themeId:               z.string().uuid().optional().nullable(),
  settings:              z.record(z.unknown()).optional(),
  seoDefaults:           z.record(z.unknown()).optional(),
  stripePublishableKey:  z.string().optional().nullable(),
  stripeSecretKey:       z.string().optional().nullable(),
  stripeSuccessMessage:  z.string().optional().nullable(),
  analyticsMode:         z.enum(['off', 'anonymous', 'consent_required']).optional(),
  turnstileSiteKey:      z.string().max(500).optional().nullable(),
  turnstileSecretKey:    z.string().max(500).optional().nullable(),
}).strict()

export const createMenuSchema = z.object({
  siteId:   z.string().uuid(),
  name:     z.string().min(1).max(255),
  location: z.string().default('header'),
}).strict()

export const updateMenuSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  location: z.string().optional(),
}).strict()

export const createMenuItemSchema = z.object({
  label:     z.string().min(1).max(255),
  url:       z.string().optional().nullable(),
  pageId:    z.string().uuid().optional().nullable(),
  parentId:  z.string().uuid().optional().nullable(),
  target:    z.enum(['_self', '_blank']).default('_self'),
  icon:      z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
}).strict()

export const updateMenuItemSchema = z.object({
  label:     z.string().min(1).max(255).optional(),
  url:       z.string().optional().nullable(),
  pageId:    z.string().uuid().optional().nullable(),
  parentId:  z.string().uuid().optional().nullable(),
  target:    z.enum(['_self', '_blank']).optional(),
  icon:      z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
}).strict()

export const reorderItemsSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })),
}).strict()

export const createThemeSchema = z.object({
  siteId:     z.string().uuid(),
  name:       z.string().min(1).max(255),
  tokens:     z.record(z.unknown()).optional(),
  typography: z.record(z.unknown()).optional(),
  layout:     z.record(z.unknown()).optional(),
  customCss:  z.string().optional().nullable(),
  isDefault:  z.boolean().default(false),
}).strict()

export const updateThemeSchema = z.object({
  name:       z.string().min(1).max(255).optional(),
  tokens:     z.record(z.unknown()).optional(),
  typography: z.record(z.unknown()).optional(),
  layout:     z.record(z.unknown()).optional(),
  customCss:  z.string().optional().nullable(),
  isDefault:  z.boolean().optional(),
}).strict()

export const createBlogCategorySchema = z.object({
  siteId:      z.string().uuid(),
  name:        z.string().min(1).max(255),
  slug:        z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
}).strict()

export const createBlogPostSchema = z.object({
  siteId:        z.string().uuid(),
  categoryId:    z.string().uuid().optional().nullable(),
  title:         z.string().min(1).max(255),
  slug:          z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  excerpt:       z.string().optional(),
  featuredImage: z.string().optional().nullable(),
  seo:           z.record(z.unknown()).optional(),
}).strict()

export const updateBlogCategorySchema = createBlogCategorySchema.omit({ siteId: true }).partial().strict()

export const updateBlogPostSchema = z.object({
  categoryId:    z.string().uuid().optional().nullable(),
  title:         z.string().min(1).max(255).optional(),
  slug:          z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  excerpt:       z.string().optional(),
  featuredImage: z.string().optional().nullable(),
  seo:           z.record(z.unknown()).optional(),
}).strict()

export const saveBlogDraftSchema = z.object({
  builderData: z.union([z.record(z.unknown()), z.string()]),
  seo:         z.record(z.unknown()).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
}).strict()

import * as formValidators from '@runly/validators'
export const createFormSchema = formValidators.createFormSchema.strict()
export const updateFormSchema = formValidators.updateFormSchema.strict()
export const createFormFieldSchema = formValidators.createFormFieldSchema.strict()
export const updateFormFieldSchema = formValidators.updateFormFieldSchema.strict()
export const reorderFieldsSchema = formValidators.reorderFieldsSchema.strict()
