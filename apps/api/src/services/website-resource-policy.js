import { WebsiteServiceError, notFound } from '../routes/website/service-helpers.js'
import * as schemas from '../routes/website/validators.js'
import { assertWebsiteAccess } from './website-authorization-service.js'
import { createFileAccess } from './files/access.js'

export const WEBSITE_METHOD_PERMISSIONS = Object.freeze({
  listSites: 'website.site.read', saveSiteDraft: 'website.site.update',
  getSite: 'website.site.read', getDefaultPageSite: 'website.pages.read', createSite: 'website.site.update', updateSite: 'website.site.update', deleteSite: 'website.site.update',
  listPages: 'website.pages.read', getPage: 'website.pages.read', getPageByPath: 'website.pages.read',
  createPage: 'website.pages.create', updatePage: 'website.pages.update', saveDraft: 'website.pages.update',
  publishPage: 'website.pages.publish', softDeletePage: 'website.pages.delete',
  listThemes: 'website.theme.read', getTheme: 'website.theme.read', getActiveTheme: 'website.theme.read',
  createTheme: 'website.theme.update', updateTheme: 'website.theme.update', upsertTheme: 'website.theme.update',
  listMenus: 'website.menus.read', createMenu: 'website.menus.update', updateMenu: 'website.menus.update',
  softDeleteMenu: 'website.menus.update', createMenuItem: 'website.menus.update', updateMenuItem: 'website.menus.update',
  softDeleteMenuItem: 'website.menus.update', reorderMenuItems: 'website.menus.update',
  listBlogCategories: 'website.pages.read', createBlogCategory: 'website.pages.create', updateBlogCategory: 'website.pages.update', softDeleteBlogCategory: 'website.pages.delete',
  listBlogPosts: 'website.pages.read', getBlogPost: 'website.pages.read', createBlogPost: 'website.pages.create', updateBlogPost: 'website.pages.update',
  saveBlogDraft: 'website.pages.update', publishBlogPost: 'website.pages.publish', softDeleteBlogPost: 'website.pages.delete',
})

export function createWebsiteResourcePolicy({ prisma }) {
  const files = createFileAccess({ prisma })
  async function site(companyId, siteId) {
    if (!siteId) throw notFound('Recurso')
    const row = await prisma.websiteSite.findFirst({ where: { id: siteId, companyId, enabled: true } })
    if (!row) throw notFound('Recurso')
    return row
  }
  async function resource(model, companyId, id, siteId) {
    if (!id) throw notFound('Recurso')
    const row = await prisma[model].findFirst({ where: { id, companyId, enabled: true, ...(siteId && { siteId }) } })
    if (!row) throw notFound('Recurso')
    await site(companyId, row.siteId)
    return row
  }
  function parse(schema, args, withSite = false) {
    const data = args.data ?? {}
    if (data.siteId !== undefined && data.siteId !== args.siteId) throw notFound('Recurso')
    const result = schema.strict().safeParse(withSite ? { ...data, siteId: args.siteId } : data)
    if (!result.success) throw new WebsiteServiceError('Datos inválidos.', 422, 'validation_failed')
    args.data = result.data
  }
  async function publicMutation(args, siteId) {
    const parent = await site(args.companyId, siteId)
    if(parent.releaseManaged)return // sealed snapshot; these edits affect the next draft only
    const page = await prisma.websitePage.findFirst({ where: { companyId: args.companyId, siteId, enabled: true, status: 'published', visibility: 'public' }, select: { id: true } })
    if (page || parent.sourceType === 'dist') assertWebsiteAccess(args.access, args.companyId, 'website.pages.publish')
  }
  async function menuReferences(args, menu, itemId) {
    if (args.data?.pageId) await resource('websitePage', args.companyId, args.data.pageId, menu.siteId)
    let id = args.data?.parentId
    const seen = new Set(itemId ? [itemId] : [])
    while (id) {
      if (seen.has(id) || seen.size > 1000) throw new WebsiteServiceError('La jerarquía no es válida.', 422, 'validation_failed')
      seen.add(id)
      const parent = await prisma.websiteMenuItem.findFirst({ where: { id, companyId: args.companyId, menuId: menu.id, enabled: true } })
      if (!parent) throw notFound('Recurso')
      id = parent.parentId
    }
  }
  async function fileReference(args, fileId, siteId) {
    const file = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: { in: [args.companyId, siteId] }, enabled: true } })
    if (!file) throw notFound('Recurso')
    try { await files.assertAccess(file, { profileId: args.access.actorId, admin: args.access.isAdmin }) }
    catch { throw notFound('Recurso') }
  }
  async function before(name, args) {
    const { companyId } = args
    const requiredIds = {
      saveSiteDraft: 'siteId',
      updateSite: 'siteId', deleteSite: 'siteId', getPage: 'pageId', updatePage: 'pageId', saveDraft: 'pageId', publishPage: 'pageId', softDeletePage: 'pageId',
      getTheme: 'themeId', updateTheme: 'themeId', updateMenu: 'menuId', softDeleteMenu: 'menuId', createMenuItem: 'menuId', reorderMenuItems: 'menuId',
      updateMenuItem: 'itemId', softDeleteMenuItem: 'itemId', updateBlogCategory: 'categoryId', softDeleteBlogCategory: 'categoryId',
      getBlogPost: 'postId', updateBlogPost: 'postId', saveBlogDraft: 'postId', publishBlogPost: 'postId', softDeleteBlogPost: 'postId',
    }
    if (requiredIds[name] && !args[requiredIds[name]]) throw notFound('Recurso')
    if (name === 'getPageByPath' && !args.routePath) throw notFound('Recurso')
    const createSchemas = { createSite: schemas.createSiteSchema, createPage: schemas.createPageSchema, createTheme: schemas.createThemeSchema, createMenu: schemas.createMenuSchema, createBlogCategory: schemas.createBlogCategorySchema, createBlogPost: schemas.createBlogPostSchema }
    const updateSchemas = { updateSite: schemas.updateSiteSchema, updatePage: schemas.updatePageSchema, updateTheme: schemas.updateThemeSchema, updateMenu: schemas.updateMenuSchema, updateMenuItem: schemas.updateMenuItemSchema, updateBlogCategory: schemas.updateBlogCategorySchema, updateBlogPost: schemas.updateBlogPostSchema }
    if (createSchemas[name]) parse(createSchemas[name], args, name !== 'createSite')
    if (updateSchemas[name]) parse(updateSchemas[name], args)

    if (args.siteId) await site(companyId, args.siteId)
    const requiresSite = ['listPages', 'createPage', 'getPageByPath', 'listThemes', 'createTheme', 'upsertTheme', 'listMenus', 'createMenu', 'listBlogCategories', 'createBlogCategory', 'listBlogPosts', 'createBlogPost']
    if (requiresSite.includes(name) && !args.siteId) throw notFound('Recurso')

    let page
    if (args.pageId) page = await resource('websitePage', companyId, args.pageId, args.siteId)
    const managedPage=page&&(await site(companyId,page.siteId)).releaseManaged
    if(managedPage&&(name==='softDeletePage'||args.data?.status!==undefined))throw new WebsiteServiceError('Usa un comando de publicación explícito.',409,'publication_requires_explicit_action')
    if (name === 'saveDraft' && args.metadata !== undefined) {
      const parsed = schemas.pageDraftMetadataSchema.safeParse(args.metadata)
      if (!parsed.success) throw new WebsiteServiceError('Datos inválidos.', 422, 'validation_failed')
      args.metadata = parsed.data
    }
    if (page && (args.data?.status !== undefined || (!managedPage&&page.status === 'published' && (name === 'updatePage' || name === 'softDeletePage')))) {
      assertWebsiteAccess(args.access, companyId, 'website.pages.publish')
    }
    if (name === 'updateSite') {
      const current=await site(companyId,args.siteId)
      if(current.releaseManaged&&args.data.status!==undefined)throw new WebsiteServiceError('Usa un comando de publicación explícito.',409,'publication_requires_explicit_action')
      if (args.data.status !== undefined || args.data.domain !== undefined) assertWebsiteAccess(args.access, companyId, 'website.pages.publish')
      if (args.data.homepagePageId) await resource('websitePage', companyId, args.data.homepagePageId, args.siteId)
      if (args.data.themeId) await resource('websiteTheme', companyId, args.data.themeId, args.siteId)
      if (args.data.settings?.logoFileId) await fileReference(args, args.data.settings.logoFileId, args.siteId)
      await publicMutation(args, args.siteId)
    }
    if (name === 'saveSiteDraft') {
      parse(schemas.siteDraftIdentitySchema, args)
      if (args.data.homepagePageId) await resource('websitePage', companyId, args.data.homepagePageId, args.siteId)
      if (args.data.themeId) await resource('websiteTheme', companyId, args.data.themeId, args.siteId)
      if (args.data.settings?.logoFileId) await fileReference(args, args.data.settings.logoFileId, args.siteId)
    }
    if (name === 'deleteSite') assertWebsiteAccess(args.access, companyId, 'website.pages.publish')

    const theme = args.themeId ? await resource('websiteTheme', companyId, args.themeId, args.siteId) : null
    if (['createTheme', 'upsertTheme', 'updateTheme'].includes(name)) await publicMutation(args, theme?.siteId ?? args.siteId)
    if (name === 'getActiveTheme') {
      const parent = args.siteId ? { id: args.siteId } : await prisma.websiteSite.findFirst({ where: { companyId, enabled: true, defaultForCompany: true } })
      const active = parent ? await prisma.websiteTheme.findFirst({ where: { companyId, siteId: parent.id, enabled: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }) : null
      if (active) await site(companyId, active.siteId)
    }

    let menu = args.menuId ? await resource('websiteMenu', companyId, args.menuId, args.siteId) : null
    if (args.itemId) {
      const item = await prisma.websiteMenuItem.findFirst({ where: { id: args.itemId, companyId, enabled: true } })
      if (!item) throw notFound('Recurso')
      if (args.menuId && item.menuId !== args.menuId) throw notFound('Recurso')
      menu = await resource('websiteMenu', companyId, item.menuId)
    }
    if (name === 'createMenuItem') { parse(schemas.createMenuItemSchema, args); await menuReferences(args, menu) }
    if (name === 'updateMenuItem') await menuReferences(args, menu, args.itemId)
    if (name === 'reorderMenuItems') {
      const parsed = schemas.reorderItemsSchema.safeParse({ items: args.items })
      if (!parsed.success) throw new WebsiteServiceError('Datos inválidos.', 422, 'validation_failed')
      args.items = parsed.data.items
      if (!menu || !Array.isArray(args.items) || new Set(args.items.map(item => item.id)).size !== args.items.length) throw notFound('Recurso')
      for (const item of args.items) {
        const row = await prisma.websiteMenuItem.findFirst({ where: { id: item.id, companyId, menuId: menu.id, enabled: true } })
        if (!row) throw notFound('Recurso')
      }
    }
    if (['createMenu', 'updateMenu', 'softDeleteMenu', 'createMenuItem', 'updateMenuItem', 'softDeleteMenuItem', 'reorderMenuItems'].includes(name)) await publicMutation(args, menu?.siteId ?? args.siteId)

    const category = args.categoryId ? await resource('websiteBlogCategory', companyId, args.categoryId, args.siteId) : null
    const post = args.postId ? await resource('websiteBlogPost', companyId, args.postId, args.siteId) : null
    if (args.data?.categoryId) await resource('websiteBlogCategory', companyId, args.data.categoryId, post?.siteId ?? args.siteId)
    if (typeof args.data?.featuredImage === 'string' && /^[0-9a-f-]{36}$/i.test(args.data.featuredImage)) await fileReference(args, args.data.featuredImage, post?.siteId ?? args.siteId)
    if (['publishPage', 'publishBlogPost'].includes(name)) {
      const entry = page ?? post
      const path = page?.routePath ?? `/blog/${post.slug}`
      const existing = await prisma.websitePublishedRender.findFirst({ where: { siteId: entry.siteId, path } })
      if (existing && existing.companyId !== companyId) throw notFound('Recurso')
    }
    const managedPost=post&&(await site(companyId,post.siteId)).releaseManaged
    if(managedPost&&name==='softDeleteBlogPost')throw new WebsiteServiceError('Usa un comando de publicación explícito.',409,'publication_requires_explicit_action')
    if (!managedPost&&post?.status === 'published' && ['updateBlogPost', 'softDeleteBlogPost'].includes(name)) assertWebsiteAccess(args.access, companyId, 'website.pages.publish')
    if (['createBlogCategory', 'updateBlogCategory', 'softDeleteBlogCategory'].includes(name)) await publicMutation(args, category?.siteId ?? args.siteId)
  }
  return { before, site, resource }
}
