import { createWebsiteDraftService } from '../../services/website-draft-service.js'
import { secureWebsiteMethods } from '../../services/website-authorization-service.js'
import { createWebsiteResourcePolicy, WEBSITE_METHOD_PERMISSIONS } from '../../services/website-resource-policy.js'
import { WebsiteServiceError, notFound, conflict } from './service-helpers.js'
import { encryptPassword } from '../../services/smtp-service.js'
import { invalidateCache, invalidatePrimaryCache } from '../../services/dist-serve-service.js'

export { WebsiteServiceError }

export function createWebsiteService({ prisma }) {
  const drafts = createWebsiteDraftService({ prisma })
  function publicSite(site) {
    if (!site) return null
    const { stripeSecretKey, turnstileSecretKey, ...rest } = site
    return {
      ...rest,
      stripeSecretKeySet: Boolean(stripeSecretKey),
      turnstileSecretKeySet: Boolean(turnstileSecretKey),
    }
  }

  function encryptedSecret(value) {
    if (value === null || value === '') return null
    return encryptPassword(value)
  }


  async function getSite({ companyId, siteId }) {
    const site = await prisma.websiteSite.findFirst({
      where: { companyId, enabled: true, ...(siteId ? { id: siteId } : { defaultForCompany: true }) },
      orderBy: { createdAt: 'asc' },
    })
    if (!site) return null
    // Never expose the encrypted secret key — return a boolean flag instead
    return publicSite(site)
  }

  async function getDefaultPageSite({ companyId }) {
    const site = await prisma.websiteSite.findFirst({ where: { companyId, enabled: true, defaultForCompany: true }, select: { id: true } })
    return site ? { id: site.id } : null
  }

  async function createSite(args) {
    const { companyId, data, actorId } = args
    return drafts.createSite(args, async (prisma, defaultForCompany) => {
      const created = await prisma.websiteSite.create({
        data: {
          companyId,
          defaultForCompany,
          draftIdentity: { name: data.name, siteType: data.siteType ?? 'website', settings: {}, seoDefaults: {} },
          name:          data.name,
          domain:        data.domain ?? null,
          defaultLocale: data.defaultLocale ?? 'es',
          siteType:      data.siteType ?? 'website',
          analyticsMode: data.analyticsMode ?? 'off',
          turnstileSiteKey: data.turnstileSiteKey ?? null,
          turnstileSecretKey: data.turnstileSecretKey
            ? encryptedSecret(data.turnstileSecretKey)
            : null,
          status:        'draft',
          enabled:       true,
        },
      })
      await prisma.auditLog.create({
        data: {
          actorId: actorId ?? null,
          moduleKey: 'runly.website',
          entityType: 'website.site',
          entityId: created.id,
          action: 'site.create',
          before: null,
          after: JSON.stringify(publicSite(created)),
        },
      })
      return publicSite(created)
    })
  }

  async function updateSite({ companyId, siteId, data, actorId }) {
    const before = await prisma.websiteSite.findFirst({
      where: { id: siteId, companyId },
    })
    if (!before) throw notFound('Sitio')

    const after = await prisma.websiteSite.update({
      where: { id: siteId, companyId },
      data: {
        ...(data.name                !== undefined && { name:                 data.name }),
        ...(data.domain              !== undefined && { domain:               data.domain }),
        ...(data.status              !== undefined && { status:               data.status }),
        ...(data.siteType            !== undefined && { siteType:             data.siteType }),
        ...(data.homepagePageId      !== undefined && { homepagePageId:       data.homepagePageId }),
        ...(data.themeId             !== undefined && { themeId:              data.themeId }),
        ...(data.settings            !== undefined && { settings:             data.settings }),
        ...(data.seoDefaults         !== undefined && { seoDefaults:          data.seoDefaults }),
        ...(data.stripePublishableKey  !== undefined && { stripePublishableKey:  data.stripePublishableKey }),
        ...(data.stripeSecretKey      !== undefined && { stripeSecretKey:       encryptedSecret(data.stripeSecretKey) }),
        ...(data.stripeSuccessMessage !== undefined && { stripeSuccessMessage:  data.stripeSuccessMessage }),
        ...(data.analyticsMode        !== undefined && { analyticsMode:         data.analyticsMode }),
        ...(data.turnstileSiteKey     !== undefined && { turnstileSiteKey:      data.turnstileSiteKey }),
        ...(data.turnstileSecretKey   !== undefined && { turnstileSecretKey:    encryptedSecret(data.turnstileSecretKey) }),
      },
    })
    const beforePublic = publicSite(before)
    const afterPublic = publicSite(after)
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        moduleKey: 'runly.website',
        entityType: 'website.site',
        entityId: siteId,
        action: 'site.update',
        before: JSON.stringify(beforePublic),
        after: JSON.stringify(afterPublic),
      },
    })
    invalidateCache(companyId)
    invalidatePrimaryCache()
    return afterPublic
  }

  async function deleteSite({ companyId, siteId, actorId }) {
    const site = await prisma.websiteSite.findFirst({
      where: { id: siteId, companyId },
      select: { id: true, name: true },
    })
    if (!site) throw notFound('Sitio')

    // Archive atomically; never cascade into versions, forms or responses.
    await prisma.$transaction(async (tx) => {
      await tx.websiteSite.update({ where: { id: siteId, companyId }, data: { enabled: false, status: 'maintenance' } })
      await tx.auditLog.create({ data: {
        actorId, moduleKey: 'runly.website', entityType: 'website.site', entityId: siteId,
        action: 'site.archive', before: JSON.stringify(site), after: JSON.stringify({ enabled: false }),
      } })
    })
    invalidateCache(companyId)
    invalidatePrimaryCache()
  }

  async function listPages({ companyId, siteId, page = 1, pageSize = 30, pageType = null, status = null }) {
    const skip = (page - 1) * pageSize
    const where = { companyId, siteId, enabled: true }
    if (pageType) where.pageType = pageType
    if (status) where.status = status
    const [data, total] = await Promise.all([
      prisma.websitePage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          slug: true,
          routePath: true,
          status: true,
          pageType: true,
          visibility: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          revision: true, draftMetadata: true,
        },
      }),
      prisma.websitePage.count({ where }),
    ])
    return { data, total, page, pageSize }
  }

  async function getPage({ companyId, pageId }) {
    const page = await prisma.websitePage.findFirst({
      where: { id: pageId, companyId, enabled: true },
    })
    if (!page) throw notFound('Pagina')
    return page
  }

  async function createPage(args) {
    const { companyId, siteId, data, actorId } = args
    return prisma.$transaction(async (prisma) => {
      await drafts.lockSite(prisma, companyId, siteId)
      return drafts.receipt(prisma, args, `page.create:${siteId}`, data, async () => {
        const existing = await prisma.websitePage.findFirst({
          where: { companyId, siteId, routePath: data.routePath },
        })

        if (existing) throw conflict('La ruta ya existe o conserva un historial archivado.')
        const reserved = await prisma.websitePage.findMany({ where: { companyId, siteId }, select: { draftMetadata: true } })
        if (reserved.some(row => row.draftMetadata?.routePath === data.routePath)) throw conflict('La ruta está reservada por otro borrador.')

        const created = await prisma.websitePage.create({
          data: {
            companyId,
            siteId,
            draftMetadata: { title: data.title, slug: data.slug, routePath: data.routePath, visibility: data.visibility ?? 'public' },
            draftSeo: data.seo ?? {},
            title: data.title,
            slug: data.slug,
            routePath: data.routePath,
            status: 'draft',
            pageType: data.pageType ?? 'page',
            visibility: data.visibility ?? 'public',
            draftBuilderData: {},
            seo: data.seo ?? {},
            createdById: actorId ?? null,
            updatedById: actorId ?? null,
            enabled: true,
          },
        })
        await prisma.auditLog.create({
          data: {
            actorId: actorId ?? null,
            moduleKey: 'runly.website',
            entityType: 'website.page',
            entityId: created.id,
            action: 'page.create',
            before: null,
            after: JSON.stringify(created),
          },
        })
        return created
      })
    })
  }

  async function updatePage({ companyId, pageId, data, actorId }) {
    const before = await getPage({ companyId, pageId })
    const after = await prisma.websitePage.update({
      where: { id: pageId, companyId, siteId: before.siteId },
      data: {
        ...(data.title      !== undefined && { title:      data.title }),
        ...(data.slug       !== undefined && { slug:       data.slug }),
        ...(data.routePath  !== undefined && { routePath:  data.routePath }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.status     !== undefined && { status:     data.status }),
        ...(data.seo        !== undefined && { seo:        data.seo }),
        updatedById: actorId ?? null,
      },
    })
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        moduleKey: 'runly.website',
        entityType: 'website.page',
        entityId: pageId,
        action: 'page.update',
        before: JSON.stringify(before),
        after: JSON.stringify(after),
      },
    })
    return after
  }

  async function saveDraft(args) { return drafts.save(args) }

  async function publishPage({ companyId, pageId, actorId }) {
    const before = await getPage({ companyId, pageId })

    const maxVersion = await prisma.websitePageVersion.aggregate({
      where: { pageId, companyId },
      _max: { versionNumber: true },
    })
    const nextVersion = (maxVersion._max.versionNumber ?? 0) + 1

    await prisma.websitePageVersion.create({
      data: {
        companyId,
        pageId,
        versionNumber: nextVersion,
        builderData: before.draftBuilderData ?? {},
        seo: before.seo ?? {},
        status: 'published',
        createdById: actorId ?? null,
      },
    })

    const after = await prisma.websitePage.update({
      where: { id: pageId, companyId, siteId: before.siteId },
      data: {
        publishedBuilderData: before.draftBuilderData,
        status: 'published',
        publishedAt: new Date(),
        updatedById: actorId ?? null,
      },
    })

    await prisma.websitePublishedRender.upsert({
      where: { siteId_path: { siteId: after.siteId, path: after.routePath } },
      create: {
        companyId,
        siteId: after.siteId,
        sourceType: 'page',
        sourceId: pageId,
        path: after.routePath,
        statusCode: 200,
        publishedAt: new Date(),
      },
      update: {
        sourceId: pageId,
        sourceType: 'page',
        statusCode: 200,
        publishedAt: new Date(),
      },
    })

    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        moduleKey: 'runly.website',
        entityType: 'website.page',
        entityId: pageId,
        action: 'page.publish',
        before: JSON.stringify({ status: before.status }),
        after:  JSON.stringify({ status: 'published', publishedAt: after.publishedAt }),
      },
    })
    return after
  }

  async function softDeletePage({ companyId, pageId, actorId }) {
    const before = await getPage({ companyId, pageId })
    await prisma.websitePage.update({
      where: { id: pageId, companyId, siteId: before.siteId },
      data: { enabled: false },
    })
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        moduleKey: 'runly.website',
        entityType: 'website.page',
        entityId: pageId,
        action: 'page.delete',
        before: JSON.stringify(before),
        after: null,
      },
    })
  }

  async function listThemes({ companyId, siteId }) {
    return prisma.websiteTheme.findMany({
      where: { companyId, siteId, enabled: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isDefault: true, tokens: true, typography: true, layout: true, customCss: true },
    })
  }

  async function listMenus({ companyId, siteId }) {
    return prisma.$queryRaw`
      SELECT m.id, m.name, m.location,
        COALESCE(
          json_agg(
            json_build_object(
              'id', mi.id, 'label', mi.label, 'url', mi.url,
              'page_id', mi.page_id, 'target', mi.target,
              'sort_order', mi.sort_order, 'parent_id', mi.parent_id,
              'icon', mi.icon
            ) ORDER BY mi.sort_order
          ) FILTER (WHERE mi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM website_menu m
      LEFT JOIN website_menu_item mi ON mi.menu_id = m.id AND mi.company_id = m.company_id AND mi.enabled = true
      WHERE m.company_id = ${companyId} AND m.site_id = ${siteId} AND m.enabled = true
      GROUP BY m.id, m.name, m.location
    `
  }

  async function createMenu({ companyId, siteId, data }) {
    return prisma.websiteMenu.create({
      data: { companyId, siteId, name: data.name, location: data.location ?? 'header' },
    })
  }

  async function updateMenu({ companyId, menuId, data }) {
    const menu = await prisma.websiteMenu.findFirst({ where: { id: menuId, companyId } })
    if (!menu) throw notFound('Menu')
    return prisma.websiteMenu.update({ where: { id: menuId, companyId, siteId: menu.siteId }, data })
  }

  async function softDeleteMenu({ companyId, menuId }) {
    const menu = await prisma.websiteMenu.findFirst({ where: { id: menuId, companyId } })
    if (!menu) throw notFound('Menu')
    return prisma.websiteMenu.update({ where: { id: menuId, companyId, siteId: menu.siteId }, data: { enabled: false } })
  }

  async function createMenuItem({ companyId, menuId, data }) {
    const menu = await prisma.websiteMenu.findFirst({ where: { id: menuId, companyId } })
    if (!menu) throw notFound('Menu')
    return prisma.websiteMenuItem.create({
      data: {
        companyId,
        menuId,
        label:     data.label,
        url:       data.url ?? null,
        pageId:    data.pageId ?? null,
        parentId:  data.parentId ?? null,
        target:    data.target ?? '_self',
        icon:      data.icon ?? null,
        sortOrder: data.sortOrder ?? 0,
      },
    })
  }

  async function updateMenuItem({ companyId, itemId, data }) {
    const item = await prisma.websiteMenuItem.findFirst({ where: { id: itemId, companyId } })
    if (!item) throw notFound('Elemento de menu')
    return prisma.websiteMenuItem.update({ where: { id: itemId, companyId, menuId: item.menuId }, data })
  }

  async function softDeleteMenuItem({ companyId, itemId }) {
    const item = await prisma.websiteMenuItem.findFirst({ where: { id: itemId, companyId } })
    if (!item) throw notFound('Elemento de menu')
    return prisma.websiteMenuItem.update({ where: { id: itemId, companyId, menuId: item.menuId }, data: { enabled: false } })
  }

  async function reorderMenuItems({ companyId, menuId, items }) {
    return prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        prisma.websiteMenuItem.update({ where: { id, companyId, menuId }, data: { sortOrder } })
      )
    )
  }

  async function getTheme({ companyId, themeId }) {
    return prisma.websiteTheme.findFirst({ where: { id: themeId, companyId, enabled: true } })
  }

  async function createTheme({ companyId, siteId, data }) {
    if (data.isDefault) {
      await prisma.websiteTheme.updateMany({
        where: { companyId, siteId },
        data: { isDefault: false },
      })
    }
    return prisma.websiteTheme.create({
      data: {
        companyId,
        siteId,
        name:      data.name,
        tokens:    data.tokens    ?? {},
        typography:data.typography ?? {},
        layout:    data.layout    ?? {},
        customCss: data.customCss ?? null,
        isDefault: data.isDefault ?? false,
      },
    })
  }

  async function updateTheme({ companyId, themeId, data }) {
    const theme = await prisma.websiteTheme.findFirst({ where: { id: themeId, companyId } })
    if (!theme) throw notFound('Tema')
    if (data.isDefault) {
      await prisma.websiteTheme.updateMany({
        where: { companyId, siteId: theme.siteId, id: { not: themeId } },
        data: { isDefault: false },
      })
    }
    return prisma.websiteTheme.update({ where: { id: themeId, companyId, siteId: theme.siteId }, data })
  }

  async function getActiveTheme({ companyId, siteId }) {
    const parent = await getSite({ companyId, siteId })
    if (!parent) return null
    const themeId = parent.draftIdentity?.themeId ?? parent.themeId
    return prisma.websiteTheme.findFirst({
      where: { companyId, siteId: parent.id, enabled: true, ...(themeId && { id: themeId }) },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async function upsertTheme({ companyId, siteId, tokens, typography }) {
    const existing = await prisma.websiteTheme.findFirst({
      where: { companyId, siteId, enabled: true },
      select: { id: true },
    })
    if (existing) {
      return prisma.websiteTheme.update({
        where: { id: existing.id, companyId, siteId: siteId },
        data: {
          ...(tokens     !== undefined && { tokens }),
          ...(typography !== undefined && { typography }),
        },
      })
    }
    return prisma.websiteTheme.create({
      data: {
        companyId,
        siteId,
        name: 'Default',
        tokens:     tokens     ?? {},
        typography: typography ?? {},
        layout:     {},
        isDefault:  true,
      },
    })
  }

  async function getPageByPath({ companyId, siteId, routePath }) {
    return prisma.websitePage.findFirst({
      where: { companyId, siteId, routePath, enabled: true },
    })
  }

  async function listBlogCategories({ companyId, siteId }) {
    return prisma.websiteBlogCategory.findMany({
      where: { companyId, siteId, enabled: true },
      orderBy: { name: 'asc' },
    })
  }

  async function createBlogCategory({ companyId, siteId, data }) {
    return prisma.websiteBlogCategory.create({
      data: { companyId, siteId, name: data.name, slug: data.slug, description: data.description ?? null },
    })
  }

  async function updateBlogCategory({ companyId, categoryId, data }) {
    const cat = await prisma.websiteBlogCategory.findFirst({ where: { id: categoryId, companyId } })
    if (!cat) throw notFound('Categoria')
    return prisma.websiteBlogCategory.update({ where: { id: categoryId, companyId, siteId: cat.siteId }, data })
  }

  async function softDeleteBlogCategory({ companyId, categoryId }) {
    const cat = await prisma.websiteBlogCategory.findFirst({ where: { id: categoryId, companyId } })
    if (!cat) throw notFound('Categoria')
    return prisma.websiteBlogCategory.update({ where: { id: categoryId, companyId, siteId: cat.siteId }, data: { enabled: false } })
  }

  async function listBlogPosts({ companyId, siteId, status, categoryId, page = 1, pageSize = 20 }) {
    const skip = (page - 1) * pageSize
    const where = {
      companyId,
      siteId,
      enabled: true,
      ...(status     && { status }),
      ...(categoryId && { categoryId }),
    }
    const [data, total] = await Promise.all([
      prisma.websiteBlogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.websiteBlogPost.count({ where }),
    ])
    for (const post of data) {
      post.category = post.categoryId ? await prisma.websiteBlogCategory.findFirst({ where: { id: post.categoryId, companyId, siteId, enabled: true }, select: { id: true, name: true } }) : null
    }
    return { data, total, page, pageSize }
  }

  async function getBlogPost({ companyId, postId }) {
    const post = await prisma.websiteBlogPost.findFirst({
      where: { id: postId, companyId, enabled: true },
    })
    if (!post) throw notFound('Entrada de blog')
    post.category = post.categoryId ? await prisma.websiteBlogCategory.findFirst({ where: { id: post.categoryId, companyId, siteId: post.siteId, enabled: true } }) : null
    return post
  }

  async function createBlogPost({ companyId, siteId, data, actorId }) {
    return prisma.websiteBlogPost.create({
      data: {
        companyId, siteId,
        title:        data.title,
        slug:         data.slug,
        categoryId:   data.categoryId ?? null,
        excerpt:      data.excerpt ?? null,
        featuredImage:data.featuredImage ?? null,
        seo:          data.seo ?? null,
        createdById:  actorId ?? null,
      },
    })
  }

  async function updateBlogPost({ companyId, postId, data, actorId }) {
    const post = await prisma.websiteBlogPost.findFirst({ where: { id: postId, companyId } })
    if (!post) throw notFound('Entrada de blog')
    return prisma.websiteBlogPost.update({
      where: { id: postId, companyId, siteId: post.siteId },
      data: { ...data, updatedById: actorId ?? null },
    })
  }

  async function saveBlogDraft(args) { return drafts.save(args, 'post') }

  async function publishBlogPost({ companyId, postId, actorId }) {
    const post = await prisma.websiteBlogPost.findFirst({ where: { id: postId, companyId } })
    if (!post) throw notFound('Entrada de blog')
    const updated = await prisma.websiteBlogPost.update({
      where: { id: postId, companyId, siteId: post.siteId },
      data: {
        status:              'published',
        publishedBuilderData: post.draftBuilderData,
        publishedAt:         new Date(),
        updatedById:         actorId ?? null,
      },
    })
    const site = await prisma.websiteSite.findFirst({ where: { id: post.siteId, companyId, enabled: true } })
    if (site) {
      await prisma.websitePublishedRender.upsert({
        where:  { siteId_path: { siteId: site.id, path: `/blog/${post.slug}` } },
        update: { updatedAt: new Date() },
        create: { companyId, siteId: site.id, sourceType: 'blog_post', sourceId: postId, path: `/blog/${post.slug}` },
      })
    }
    return updated
  }

  async function softDeleteBlogPost({ companyId, postId }) {
    const post = await prisma.websiteBlogPost.findFirst({ where: { id: postId, companyId } })
    if (!post) throw notFound('Entrada de blog')
    return prisma.websiteBlogPost.update({ where: { id: postId, companyId, siteId: post.siteId }, data: { enabled: false } })
  }

  async function listSites({ companyId }) {
    const rows = await prisma.websiteSite.findMany({ where: { companyId, enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    return rows.map(publicSite)
  }
  async function saveSiteDraft(args) { return publicSite(await drafts.saveSite(args)) }

  return secureWebsiteMethods({
    listSites, saveSiteDraft,
    getSite,
    getDefaultPageSite,
    createSite,
    updateSite,
    deleteSite,
    listPages,
    getPage,
    getPageByPath,
    createPage,
    updatePage,
    saveDraft,
    publishPage,
    softDeletePage,
    listThemes,
    listMenus,
    createMenu,
    updateMenu,
    softDeleteMenu,
    createMenuItem,
    updateMenuItem,
    softDeleteMenuItem,
    reorderMenuItems,
    getTheme,
    getActiveTheme,
    createTheme,
    updateTheme,
    upsertTheme,
    listBlogCategories,
    createBlogCategory,
    updateBlogCategory,
    softDeleteBlogCategory,
    listBlogPosts,
    getBlogPost,
    createBlogPost,
    updateBlogPost,
    saveBlogDraft,
    publishBlogPost,
    softDeleteBlogPost,
  }, WEBSITE_METHOD_PERMISSIONS, createWebsiteResourcePolicy({ prisma }).before)
}
