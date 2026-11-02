import { createWebsitePublicationContext } from '../../../services/website-publication-context.js'
// Deterministic, in-memory database. No application bootstrap, env or sockets.
import { Hono } from 'hono'
import { createWebsiteRouter } from '../index.js'
import { createWebsiteAccess } from '../../../services/website-authorization-service.js'

export const id = n => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`
export const A = id(1), B = id(2), A1 = id(11), A2 = id(12), B1 = id(21), USER = id(91), PROPERTY = id(31)
export const accessFor = (permissions = [], companyId = A) => createWebsiteAccess({ companyId, actorId: USER, can: key => permissions.includes(key) })
export const ALL = [
  'website.site.read', 'website.site.update', 'website.pages.read', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete',
  'website.theme.read', 'website.theme.update', 'website.menus.read', 'website.menus.update', 'website.dist.upload',
  'website.forms.read', 'website.forms.create', 'website.forms.update', 'website.forms.delete', 'website.submissions.read', 'website.submissions.delete',
  'growth.forms.read', 'growth.forms.create', 'growth.forms.update', 'growth.forms.delete',
]

export function memoryPrisma() {
  const row = (n, companyId, siteId, extra = {}) => ({ id: id(n), companyId, siteId, enabled: true, revision: 0, draftRevision: 0, publicationRevision: 0, activeReleaseId: null, releaseManaged: false, lifecycle:'draft', defaultForCompany: [11, 21].includes(n), ...extra })
  const tables = {
    websiteSite: [row(11, A, undefined, { name: 'Site A1', sourceType: 'builder' }), row(12, A, undefined, { name: 'Site A2', sourceType: 'builder' }), row(21, B, undefined, { name: 'Private B', sourceType: 'builder' })],
    websitePage: [row(101, A, A1, { title: 'A', slug: 'a', routePath: '/', status: 'draft', visibility: 'public', draftBuilderData: {} }), row(102, A, A2, { title: 'A2', routePath: '/' }), row(201, B, B1, { title: 'Private B', routePath: '/' })],
    websiteTheme: [row(111, A, A1), row(112, A, A2), row(211, B, B1)],
    websiteMenu: [row(121, A, A1), row(122, A, A2), row(221, B, B1)],
    websiteMenuItem: [row(131, A, undefined, { menuId: id(121) }), row(132, A, undefined, { menuId: id(122) }), row(231, B, undefined, { menuId: id(221) })],
    websiteBlogCategory: [row(141, A, A1, { name: 'News', slug: 'news' }), row(142, A, A2), row(241, B, B1, { name: 'Private category' })],
    websiteBlogPost: [row(151, A, A1, { title: 'Post A', slug: 'a', status: 'draft' }), row(251, B, B1)],
    websiteForm: [row(161, A, A1, { name: 'Form A' }), row(162, A, A2), row(261, B, B1, { name: 'Private form' }), row(163, A, PROPERTY, { name: 'Growth external' })],
    websiteFormField: [row(171, A, undefined, { formId: id(161) }), row(172, A, undefined, { formId: id(162) }), row(271, B, undefined, { formId: id(261) })],
    websiteFormSubmission: [row(181, A, undefined, { formId: id(161), data: { email: 'fixture@example.com' } }), row(182, A, undefined, { formId: id(162) }), row(281, B, undefined, { formId: id(261), data: { private: 'private fixture' } })],
    growthProperty: [row(31, A, undefined, { kind: 'external_sdk', websiteSiteId: null })],
    fileAsset: [row(301, A, undefined, { entityId: A, uploadedById: USER, accessScope: 'COMPANY', visibility: 'PUBLIC' }), row(302, B, undefined, { entityId: B, uploadedById: id(92), accessScope: 'PRIVATE' }), row(303, A, undefined, { entityId: A, uploadedById: id(92), accessScope: 'PRIVATE' })],
    fileAssetShare: [],
    websiteDraftCommand: [], websiteRelease: [], websitePublicationEvent: [], websitePublicationOutbox: [], websiteDomain: [],
    websitePageVersion: [], websitePublishedRender: [], auditLog: [], membership: [],
  }
  const writes = []
  let nextId = 1000
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true
      if (value && typeof value === 'object') {
        if ('in' in value) return value.in.includes(row[key])
        if ('not' in value) return row[key] !== value.not
        return matches(row[key] ?? {}, value)
      }
      return row[key] === value
    })
  }
  const prisma = { _tables: tables, _writes: writes }
  for (const name of Object.keys(tables)) {
    prisma[name] = {
      findFirst: async ({ where } = {}) => structuredClone(tables[name].find(row => matches(row, where)) ?? null),
      findUnique: async ({ where } = {}) => structuredClone(tables[name].find(row => matches(row, where)) ?? null),
      findMany: async ({ where } = {}) => structuredClone(tables[name].filter(row => matches(row, where))),
      count: async ({ where } = {}) => tables[name].filter(row => matches(row, where)).length,
      create: async ({ data }) => { const created = { id: id(nextId++), enabled: true, state: 'preparing', ...structuredClone(data) }; tables[name].push(created); writes.push({ name, action: 'create', data }); return structuredClone(created) },
      update: async ({ where, data }) => {
        const found = tables[name].find(row => matches(row, where))
        if (!found) throw Object.assign(new Error('Missing synthetic row'), { code: 'P2025' })
        const values = Object.fromEntries(Object.entries(data).map(([key,value]) => [key, value && typeof value === 'object' && 'increment' in value ? (found[key] ?? 0) + value.increment : structuredClone(value)]))
        Object.assign(found, values); writes.push({ name, action: 'update', where, data }); return structuredClone(found)
      },
      updateMany: async ({ where, data }) => {
        const found = tables[name].filter(row => matches(row, where)); found.forEach(row => Object.assign(row, structuredClone(data)))
        writes.push({ name, action: 'updateMany', where, data }); return { count: found.length }
      },
      aggregate: async () => ({ _max: { versionNumber: null } }),
      upsert: async ({ create, update, where }) => {
        const compound = Object.values(where)[0]
        const found = tables[name].find(row => matches(row, compound))
        return found ? prisma[name].update({ where: { id: found.id }, data: update }) : prisma[name].create({ data: create })
      },
      delete: async () => { throw new Error('Physical delete forbidden in security fixture') },
      deleteMany: async () => { throw new Error('Physical delete forbidden in security fixture') },
    }
  }
  prisma.$transaction = async work => {
    const before = structuredClone(tables), count = writes.length
    try { return typeof work === 'function' ? await work(prisma) : await Promise.all(work) }
    catch (error) { for (const name of Object.keys(tables)) tables[name] = before[name]; writes.splice(count); throw error }
  }
  prisma.$queryRaw = async (strings, ...values) => {
    if(strings.join('').includes('pg_advisory_xact_lock'))return []
    if (strings.join('').includes('FROM website_page WHERE')) return prisma.websitePage.findMany({ where: { id: values[0], companyId: values[1] } })
    if (strings.join('').includes('FROM website_blog_post WHERE')) return prisma.websiteBlogPost.findMany({ where: { id: values[0], companyId: values[1] } })
    if (strings.join('').includes('FROM website_menu m')) return prisma.websiteMenu.findMany({ where: { companyId: values[0], siteId: values[1], enabled: true } })
    if (strings.join('').includes('FROM website_site')) {
      const found = await prisma.websiteSite.findFirst({ where: { id: values[0], companyId: values[1], enabled: true } })
      return found ? [{ ...found, source_type: found.sourceType }] : []
    }
    throw new Error('Unexpected query in isolated Website fixture')
  }
  return prisma
}

export function testPermission(permissions = ALL, companyId = A, actorId = USER) {
  return permission => async (c, next) => {
    if (c.req.header('Authorization') !== 'Bearer fixture') return c.json({ error: 'No autorizado.' }, 401)
    const permissionSet = new Set(permissions)
    c.set('companyId', companyId)
    c.set('userId', actorId)
    c.set('tenantContext', { companyId, isAdmin: false, permissionSet })
    c.set('userContext', { permissionSet })
    if (!permissionSet.has(permission)) return c.json({ error: 'Sin permiso.' }, 403)
    return next()
  }
}
export function websiteApp(prisma, permissions = ALL, companyId = A, actorId = USER) {
  const app = new Hono()
  const blobs=new Map()
  const publicationContext=createWebsitePublicationContext({prisma,storage:{put:async(key,bytes)=>blobs.set(key,bytes),get:async key=>blobs.get(key)},runtime:async()=>({'entry.js':{bytes:Buffer.from('trusted-test-runtime'),mime:'text/javascript'}})})
  app.route('/', createWebsiteRouter({ prisma, publicationContext, requirePermission: testPermission(permissions, companyId, actorId), supabaseAdmin: {} }))
  return app
}
export const request = (app, path, method = 'GET', body, auth = true) => app.request(`http://audit.test${path}`, {
  method, headers: { ...(auth && { Authorization: 'Bearer fixture' }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
  ...(body !== undefined && { body: JSON.stringify(body) }),
})
