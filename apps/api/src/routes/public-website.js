import { createWebsitePublicationContext } from '../services/website-publication-context.js'
import { createPublicReleaseRoutes } from './website/public-release-routes.js'
import { websiteErrorHandler } from '../services/website-authorization-service.js'
import { Hono } from 'hono'
import { createCatalogPublicService } from './catalog/catalog-public-service.js'
import { createDistServeService } from '../services/dist-serve-service.js'
import { resolvePublicSupabaseUrl } from '../lib/supabase-public-url.js'
import { getCompanySlugHeader } from '../lib/public-request-headers.js'

const ERP_PREFIXES = ['runly.', 'atlas.', 'website.', 'contacts.', 'hr.', 'finance.', 'fleet.']

export function createPublicWebsiteRouter({ prisma, supabaseAdmin, publicationContext }) {
  const app = new Hono()
  const publication=publicationContext??createWebsitePublicationContext({prisma,supabaseAdmin})
  const siteResolver = createDistServeService({ prisma, supabaseAdmin, publicationContext:publication })
  app.route('/',createPublicReleaseRoutes(publication))
  app.get('/admin-origin-check',async c=>{
    const host=await publication.gateway.authority(c)
    const configured=process.env.RUNLY_APP_URL?new URL(process.env.RUNLY_APP_URL).hostname:null
    return c.body(null, host===configured||host==='localhost'||host==='127.0.0.1'?204:403)
  })

  app.get('/desktop/config', async (c) => {
    return c.json({
      data: {
        // Browser-facing — must be the public Supabase domain, never the
        // internal Docker hostname the API/worker use to reach Kong.
        supabaseUrl: resolvePublicSupabaseUrl(process.env) || null,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
      },
    })
  })

  app.get('/resolve', async (c) => {
    try {
      const snapshot=await publication.gateway.resolve(c)
      const instanceConfig = await prisma.instanceConfig.findUnique({
        where: { key: 'initialized' },
      })
      if (!instanceConfig || instanceConfig.value !== 'true') {
        return c.json({ initialized: false })
      }

      c.header('Cache-Control','no-store')
      const routePath = c.req.query('path') || '/'
      if(snapshot.release)return c.json(publication.gateway.response(snapshot,routePath))

      const resolvedSite = await siteResolver.resolveSiteForRequest(c)
      const company = resolvedSite ? { id: resolvedSite.company_id, slug: resolvedSite.company_slug } : null
      if (!company) {
        return c.json({ initialized: true, site: null, page: null, theme: null, menus: [] })
      }

      const sites = await prisma.$queryRaw`
        SELECT id, name, domain, status, theme_id, source_type,
               analytics_mode, turnstile_site_key
        FROM website_site
        WHERE company_id = ${company.id}
          AND id = ${resolvedSite.id}::uuid
          AND enabled = true
        ORDER BY created_at ASC
        LIMIT 1
      `
      const site = sites[0] ?? null
      if (!site) {
        return c.json({ initialized: true, site: null, page: null, theme: null, menus: [] })
      }

      const pages = await prisma.$queryRaw`
        SELECT id, title, slug, route_path, status, published_builder_data, seo
        FROM website_page
        WHERE company_id = ${company.id}
          AND site_id = ${site.id}
          AND route_path = ${routePath}
          AND status = 'published'
          AND visibility = 'public'
          AND enabled = true
        LIMIT 1
      `
      const page = pages[0] ?? null

      let theme = null
      if (site.theme_id) {
        const themes = await prisma.$queryRaw`
          SELECT tokens, typography, layout, custom_css
          FROM website_theme
          WHERE id = ${site.theme_id} AND company_id = ${company.id} AND enabled = true
          LIMIT 1
        `
        theme = themes[0] ?? null
      }

      const menus = await prisma.$queryRaw`
        SELECT
          m.id, m.name, m.location,
          COALESCE(
            json_agg(
              json_build_object(
                'id',         mi.id,
                'label',      mi.label,
                'url',        mi.url,
                'page_id',    mi.page_id,
                'target',     mi.target,
                'sort_order', mi.sort_order,
                'parent_id',  mi.parent_id
              ) ORDER BY mi.sort_order
            ) FILTER (WHERE mi.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM website_menu m
        LEFT JOIN website_menu_item mi
          ON mi.menu_id = m.id AND mi.company_id = m.company_id AND mi.enabled = true
        WHERE m.company_id = ${company.id}
          AND m.site_id = ${site.id}
          AND m.enabled = true
        GROUP BY m.id, m.name, m.location
      `

      return c.json({
        initialized: true,
        integrityMode: 'legacy-reference',
        site: {
          id: site.id,
          name: site.name,
          domain: site.domain,
          sourceType: site.source_type ?? 'builder',
          company: company.slug,
          analyticsMode: site.analytics_mode ?? 'off',
          turnstileSiteKey: site.turnstile_site_key ?? null,
        },
        page: page
          ? {
              id:                   page.id,
              title:                page.title,
              slug:                 page.slug,
              routePath:            page.route_path,
              status:               page.status,
              publishedBuilderData: page.published_builder_data ?? {},
              seo:                  page.seo ?? {},
            }
          : null,
        theme,
        menus,
      })
    } catch (err) {
      if(err.status)return websiteErrorHandler(err,c)
      return c.json({error:'Servicio temporalmente no disponible.',code:'dependency_unavailable'},503)
    }
  })

  app.get('/blog', async (c) => {
    try {
      const { siteId, limit = '10', offset = '0' } = c.req.query()
      const snapshot=await publication.gateway.resolve(c)
      if(siteId&&siteId!==snapshot.site.id)return c.json({error:'Recurso no encontrado.'},404)
      if(snapshot.release) { c.header('Cache-Control','no-store');return c.json({data:snapshot.release.manifest.routes.filter(r=>r.sourceKind==='blog').map(r=>({id:r.sourceId,title:r.title,slug:r.slug,seo:r.seo}))}) }
      if (!siteId) return c.json({ data: [] })
      const limitNum  = Math.min(parseInt(limit)  || 10, 50)
      const offsetNum = Math.max(parseInt(offset) || 0, 0)
      const rows = await prisma.$queryRaw`
        SELECT id, title, slug, excerpt, cover_asset_id, updated_at
        FROM website_page
        WHERE site_id   = ${snapshot.site.id}::uuid
          AND company_id = ${snapshot.site.companyId}::uuid
          AND visibility = 'public'
          AND EXISTS (SELECT 1 FROM website_site ws JOIN company co ON co.id = ws.company_id
                      WHERE ws.id = website_page.site_id AND ws.company_id = website_page.company_id
                        AND ws.enabled = true AND co.enabled = true)
          AND page_type = 'blog_post'
          AND status    = 'published'
          AND enabled   = true
        ORDER BY updated_at DESC
        LIMIT ${limitNum} OFFSET ${offsetNum}
      `
      return c.json({ data: rows })
    } catch (err) {
      if(err.status)return websiteErrorHandler(err,c)
      if (err?.message?.includes('does not exist') || err?.code === '42P01') return c.json({ data: [] })
      return c.json({ data: [] }, 500)
    }
  })

  app.get('/auth-check', async (c) => {
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return c.json({ error: 'Token requerido' }, 401)

    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token)
      if (error || !data?.user) return c.json({ error: 'Token invalido o expirado' }, 401)

      const authUserId = data.user.id
      const profile = await prisma.userProfile.findUnique({ where: { authUserId } })
      if (!profile) return c.json({ canAccessErp: false })

      const memberships = await prisma.membership.findMany({
        where: { userId: profile.id, enabled: true },
        include: {
          role: {
            include: {
              permissions: {
                where: { permission: { active: true } },
                include: { permission: { select: { key: true } } },
              },
            },
          },
        },
      })

      const hasErpAccess = memberships.some((m) =>
        m.role?.permissions?.some((rp) =>
          ERP_PREFIXES.some((prefix) => rp.permission?.key?.startsWith(prefix))
        )
      )

      return c.json({ canAccessErp: hasErpAccess })
    } catch (err) {
      console.error('[public/website/auth-check]', err?.message)
      return c.json({ error: 'Error interno' }, 500)
    }
  })

  return app
}

export function createPublicCatalogRouter({ prisma, supabaseAdmin = null }) {
  const app = new Hono()
  const publicSvc = createCatalogPublicService({ prisma, supabaseAdmin })
  const siteResolver = createDistServeService({ prisma })

  // The npm storefront-sdk (packages/storefront-sdk) always sends
  // A public Website host (or its known Origin on the central API) binds the
  // site. Explicit SDK selectors cannot override it. Historical company-only
  // consumers on the central API retain company-wide eligibility semantics.
  async function scope(c) {
    const selected=c.req.header('X-Runly-Website-Site')
    if(selected&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selected))throw new Error('invalid_scope')
    const hostname=new URL(c.req.url).hostname
    const adminHosts=[process.env.RUNLY_APP_URL,(process.env.RUNLY_API_URL??process.env.ATLAS_API_URL)].filter(Boolean).map(url=>new URL(url).hostname)
    if(!['127.0.0.1','localhost',...adminHosts].includes(hostname)){
      const site=await siteResolver.resolveSiteForRequest(c)
      if(selected&&selected!==site.id)throw new Error('invalid_scope')
      return {companyId:site.company_id,siteId:site.id}
    }
    const origin=c.req.header('origin')
    if(origin){
      let host;try{host=new URL(origin).hostname}catch{throw new Error('invalid_scope')}
      const binding=await prisma.websiteDomain.findFirst({where:{hostname:host,ready:true,state:'assigned'}})
      if(binding){if(selected&&selected!==binding.siteId)throw new Error('invalid_scope');return {companyId:binding.companyId,siteId:binding.siteId}}
    }
    const slug=getCompanySlugHeader(c),company=slug?await prisma.company.findFirst({where:{slug,enabled:true}}):null
    return {companyId:company?.id??null,siteId:selected??null}
  }

  app.get('/categories', async (c) => {
    try {
      const {companyId,siteId} = await scope(c)
      if (!companyId) return c.json({ data: [] })
      const data = await publicSvc.listPublicCategories({ companyId,siteId })
      return c.json({ data })
    } catch (err) {
      // Return no infrastructure or provider details.
      return c.json({ data: [] }, err.message==='invalid_scope'||err.status===404?404:500)
    }
  })

  app.get('/products', async (c) => {
    try {
      const {companyId,siteId} = await scope(c)
      if (!companyId) return c.json({ data: [], total: 0 })
      const { categorySlug, search, limit, offset } = c.req.query()
      const result = await publicSvc.listPublicProducts({
        companyId,siteId,
        categorySlug: categorySlug || undefined,
        search:       search       || undefined,
        limit:        limit  ? Number(limit)  : 20,
        offset:       offset ? Number(offset) : 0,
      })
      return c.json(result)
    } catch (err) {
      // Fail closed.
      return c.json({ data: [], total: 0 }, err.message==='invalid_scope'||err.status===404?404:500)
    }
  })

  app.get('/products/:slug', async (c) => {
    try {
      const {companyId,siteId} = await scope(c)
      if (!companyId) return c.json({ error: 'Not found' }, 404)
      const data = await publicSvc.getPublicProductBySlug({ companyId,siteId, slug: c.req.param('slug') })
      if (!data) return c.json({ error: 'Not found' }, 404)
      return c.json({ data })
    } catch (err) {
      // Fail closed.
      return c.json({ error: 'Not available' }, err.message==='invalid_scope'||err.status===404?404:500)
    }
  })

  return app
}
