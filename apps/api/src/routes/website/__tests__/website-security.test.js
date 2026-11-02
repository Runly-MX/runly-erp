import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWebsiteService } from '../website-service.js'
import { createFormsService } from '../../../services/forms-service.js'
import { WEBSITE_METHOD_PERMISSIONS } from '../../../services/website-resource-policy.js'
import { createWebsiteAdapter } from '../../../mcp/adapters/website.js'
import { createGrowthFormRoutes } from '../../growth/growth-form-routes.js'
import { Hono } from 'hono'
import { websiteAccessFromRequest } from '../../../services/website-authorization-service.js'
import { A, B, A1, A2, B1, USER, PROPERTY, id, ALL, accessFor, memoryPrisma, testPermission, websiteApp, request } from './security-fixtures.js'

globalThis.fetch = async () => { throw new Error('Network forbidden in security tests') }
const rejected = (status, code) => error => error.status === status && (!code || error.code === code)

for (const name of Object.keys(WEBSITE_METHOD_PERMISSIONS)) {
  test(`service ${name} denies absent, forged and foreign tenant context before touching storage`, async () => {
    const service = createWebsiteService({ prisma: {} })
    await assert.rejects(service[name]({ companyId: A }), rejected(401))
    await assert.rejects(service[name]({ companyId: A, access: { companyId: A, actorId: USER, can: () => true } }), rejected(401))
    await assert.rejects(service[name]({ companyId: B, access: accessFor(ALL) }), rejected(404))
    await assert.rejects(service[name]({ companyId: A, access: accessFor([]) }), rejected(403))
  })
}

for (const ownerDomain of ['website', 'growth']) {
  for (const name of Object.keys(createFormsService({ prisma: {}, ownerDomain }))) {
    test(`${ownerDomain} forms service ${name} checks identity, tenant and operation before storage`, async () => {
      const service = createFormsService({ prisma: {}, ownerDomain })
      await assert.rejects(service[name]({ companyId: A }), rejected(401))
      await assert.rejects(service[name]({ companyId: A, access: { companyId: A, actorId: USER, can: () => true } }), rejected(401))
      await assert.rejects(service[name]({ companyId: B, access: accessFor(ALL) }), rejected(404))
      await assert.rejects(service[name]({ companyId: A, access: accessFor([]) }), rejected(403))
    })
  }
}

test('server authority ignores stale global permissions and body-provided identities', async () => {
  const context = { tenantContext: { companyId: A, isAdmin: false, permissionSet: new Set(['website.pages.read']) }, userId: USER, companyId: B, userContext: { isAdmin: true, permissionSet: new Set(ALL) } }
  const access = websiteAccessFromRequest({ get: key => context[key] })
  assert.equal(access.companyId, A)
  assert.equal(access.actorId, USER)
  assert.equal(access.isAdmin, false)
  assert.equal(access.can('website.pages.publish'), false)
})

const foreignRequests = [
  ['/website/sites/' + B1], ['/website/sites/' + B1, 'PATCH', { sourceType: 'builder' }],
  ['/website/pages?siteId=' + B1], ['/website/pages/by-path?siteId=' + B1 + '&routePath=/'], ['/website/pages/' + id(201)],
  ['/website/themes?siteId=' + B1], ['/website/themes/' + id(211)], ['/website/menus?siteId=' + B1],
  ['/website/blog/categories?siteId=' + B1], ['/website/blog/posts?siteId=' + B1], ['/website/blog/posts/' + id(251)],
  ['/website/forms?siteId=' + B1], ['/website/forms/' + id(261)], ['/website/forms/' + id(261) + '/submissions'],
  ['/website/site/' + B1, 'PATCH', { name: 'attack' }],
  ['/website/pages/' + id(201), 'PATCH', { title: 'attack' }],
  ['/website/pages/' + id(201) + '/draft', 'POST', { builderData: {} }],
  ['/website/pages/' + id(201) + '/publish', 'POST'],
  ['/website/themes/' + id(211), 'PATCH', { name: 'attack' }],
  ['/website/menus/' + id(221), 'PATCH', { name: 'attack' }],
  ['/website/menu-items/' + id(231), 'PATCH', { label: 'attack' }],
  ['/website/blog/categories/' + id(241), 'PATCH', { name: 'attack' }],
  ['/website/forms/' + id(261), 'PATCH', { name: 'attack' }],
  ['/website/form-fields/' + id(271), 'PATCH', { label: 'attack' }],
]
for (const [path, method, body] of foreignRequests) {
  test(`company A cannot ${method ?? 'GET'} private B resource ${path.split('?')[0]}`, async () => {
    const prisma = memoryPrisma(), snapshot = structuredClone(prisma._tables)
    const response = await request(websiteApp(prisma), path, method, body)
    assert.equal(response.status, 404)
    assert.doesNotMatch(await response.text(), /Private B|Private category|Private form|private fixture/)
    assert.deepEqual(prisma._tables, snapshot)
    assert.equal(prisma._writes.length, 0)
  })
}

test('all affected REST resource paths require their operation permission before lookup', async () => {
  const prisma = memoryPrisma(), app = websiteApp(prisma, [])
  for (const [path, method, body] of foreignRequests) assert.equal((await request(app, path, method, body)).status, 403, `${method ?? 'GET'} ${path}`)
  for (const path of ['/website/site', '/website/pages', '/website/themes', '/website/menus', '/website/blog/categories', '/website/blog/posts', '/website/forms']) assert.equal((await request(app, path, 'POST', {})).status, 403, path)
  assert.equal(prisma._writes.length, 0)
})

test('storage errors never expose private database details through the API', async () => {
  const prisma = memoryPrisma()
  prisma.websitePage.findFirst = async () => { throw new Error('Private B database credential fixture') }
  const response = await request(websiteApp(prisma), `/website/pages/${id(101)}`)
  assert.equal(response.status, 500)
  assert.doesNotMatch(await response.text(), /Private B|database|credential/)
})

test('existing archived route cannot reset an historical page or its responses', async () => {
  const prisma = memoryPrisma()
  prisma._tables.websitePage[0].enabled = false
  const before = structuredClone(prisma._tables)
  await assert.rejects(createWebsiteService({ prisma }).createPage({ access: accessFor(ALL), companyId: A, siteId: A1, data: { title: 'Replacement', slug: 'home', routePath: '/' } }), rejected(409))
  assert.deepEqual(prisma._tables, before)
  assert.equal(prisma._writes.length, 0)
})

test('archive rolls back when its audit cannot be persisted', async () => {
  const prisma = memoryPrisma(), before = structuredClone(prisma._tables)
  prisma.auditLog.create = async () => { throw new Error('Synthetic audit failure') }
  await assert.rejects(createWebsiteService({ prisma }).deleteSite({ access: accessFor(ALL), companyId: A, siteId: A1 }), /Synthetic audit failure/)
  assert.deepEqual(prisma._tables, before)
})

test('shared live site, theme and menu mutations require publication authority', async () => {
  const prisma = memoryPrisma()
  prisma._tables.websitePage[0].status = 'published'
  const service = createWebsiteService({ prisma }), access = accessFor(['website.site.update', 'website.theme.update', 'website.menus.update'])
  await assert.rejects(service.updateSite({ access, companyId: A, siteId: A1, data: { name: 'Live' } }), rejected(403))
  await assert.rejects(service.updateTheme({ access, companyId: A, themeId: id(111), data: { name: 'Live' } }), rejected(403))
  await assert.rejects(service.updateMenuItem({ access, companyId: A, itemId: id(131), data: { label: 'Live' } }), rejected(403))
  assert.equal(prisma._writes.length, 0)
})

test('direct reorder validates values before any write', async () => {
  const prisma = memoryPrisma(), access = accessFor(ALL)
  await assert.rejects(createWebsiteService({ prisma }).reorderMenuItems({ access, companyId: A, menuId: id(121), items: [{ id: id(131), sortOrder: 'bad' }] }), rejected(422))
  await assert.rejects(createFormsService({ prisma }).reorderFormFields({ access, companyId: A, formId: id(161), items: [{ id: id(171), sortOrder: 'bad' }] }), rejected(422))
  assert.equal(prisma._writes.length, 0)
})

test('missing resource selectors cannot broaden private queries and explicit parents must match', async () => {
  const prisma = memoryPrisma(), access = accessFor(ALL), website = createWebsiteService({ prisma }), forms = createFormsService({ prisma })
  for (const name of ['getPage', 'getTheme', 'getBlogPost', 'getPageByPath', 'updateMenuItem']) await assert.rejects(website[name]({ access, companyId: A }), rejected(404))
  for (const name of ['getForm', 'listSubmissions', 'updateFormField']) await assert.rejects(forms[name]({ access, companyId: A }), rejected(404))
  await assert.rejects(website.updateMenuItem({ access, companyId: A, menuId: id(122), itemId: id(131), data: { label: 'bad parent' } }), rejected(404))
  await assert.rejects(forms.updateFormField({ access, companyId: A, formId: id(162), fieldId: id(171), data: { label: 'bad parent' } }), rejected(404))
  assert.equal(prisma._writes.length, 0)
})

test('legitimate reader and editor retain reads, creation and drafts; actorId is server owned', async () => {
  const prisma = memoryPrisma(), app = websiteApp(prisma)
  for (const path of ['/website/site', '/website/pages', `/website/pages/${id(101)}`, `/website/themes?siteId=${A1}`, `/website/forms/${id(161)}/submissions`]) assert.equal((await request(app, path)).status, 200, path)
  const created = await request(app, '/website/pages', 'POST', { siteId: A1, title: 'New', slug: 'new', routePath: '/new' })
  assert.equal(created.status, 201)
  const service = createWebsiteService({ prisma })
  await service.saveDraft({ access: accessFor(['website.pages.update']), companyId: A, pageId: id(101), actorId: id(999), builderData: { fixture: true } })
  assert.equal(prisma._tables.websitePage[0].updatedById, USER)
  assert.equal(prisma._tables.auditLog.at(-1).actorId, USER)
})

test('legitimate typed changes retain all related site, menu, theme, blog and form identities', async () => {
  const prisma = memoryPrisma(), service = createWebsiteService({ prisma }), forms = createFormsService({ prisma }), access = accessFor(ALL)
  await service.updateSite({ access, companyId: A, siteId: A1, data: { name: 'Renamed', themeId: id(111), homepagePageId: id(101), settings: { logoFileId: id(301) } } })
  await service.updateTheme({ access, companyId: A, themeId: id(111), data: { name: 'Own theme' } })
  await service.updateMenu({ access, companyId: A, menuId: id(121), data: { name: 'Own menu' } })
  await service.updateMenuItem({ access, companyId: A, itemId: id(131), data: { pageId: id(101), label: 'Own page' } })
  await service.updateBlogCategory({ access, companyId: A, categoryId: id(141), data: { name: 'Updated' } })
  await service.updateBlogPost({ access, companyId: A, postId: id(151), data: { title: 'Updated', categoryId: id(141) } })
  await forms.updateForm({ access, companyId: A, formId: id(161), data: { name: 'Updated' } })
  await forms.updateFormField({ access, companyId: A, fieldId: id(171), data: { label: 'Updated' } })
  assert.equal(prisma._tables.websiteSite[0].themeId, id(111))
  assert.equal(prisma._tables.websiteMenuItem[0].pageId, id(101))
  assert.equal(prisma._tables.websiteBlogPost[0].categoryId, id(141))
  assert.equal(prisma._tables.websiteForm[0].siteId, A1)
  for (const write of prisma._writes.filter(write => write.action === 'update')) assert.equal(write.where.companyId, A)
})

test('file references reject another company and private files without ACL access', async () => {
  const prisma = memoryPrisma(), service = createWebsiteService({ prisma }), access = accessFor(ALL)
  for (const fileId of [id(302), id(303)]) await assert.rejects(service.updateSite({ access, companyId: A, siteId: A1, data: { settings: { logoFileId: fileId } } }), rejected(404))
  assert.equal(prisma._writes.length, 0)
})

test('public source switch requires publish and unsafe ZIP publication remains held without touching storage', async () => {
  const prisma = memoryPrisma()
  assert.equal((await request(websiteApp(prisma, ['website.site.update']), `/website/sites/${A1}`, 'PATCH', { sourceType: 'builder' })).status, 403)
  assert.equal((await request(websiteApp(prisma), `/website/sites/${A1}`, 'PATCH', { sourceType: 'dist' })).status, 409)
  assert.equal((await request(websiteApp(prisma, ['website.dist.upload']), `/website/sites/${A1}/dist/upload`, 'POST')).status, 403)
  const held = await request(websiteApp(prisma), `/website/sites/${A1}/dist/upload`, 'POST')
  assert.equal(held.status, 409)
  assert.equal((await held.json()).code, 'isolation_required')
  assert.equal((await request(websiteApp(prisma), `/website/sites/${B1}/dist/upload`, 'POST')).status, 404)
  for (const path of [`/website/sites/${A1}/dist`, `/website/sites/${A1}/dist/builds/fixture.zip`]) assert.equal((await request(websiteApp(prisma), path, 'DELETE')).status, 409)
  assert.equal(prisma._writes.length, 0)
})

test('render pointer belonging to another company cannot be overwritten by publish', async () => {
  const prisma = memoryPrisma()
  prisma._tables.websitePublishedRender.push({ id: id(800), companyId: B, siteId: A1, path: '/' })
  await assert.rejects(createWebsiteService({ prisma }).publishPage({ access: accessFor(ALL), companyId: A, pageId: id(101) }), rejected(404))
  assert.equal(prisma._writes.length, 0)
})

test('unauthenticated and insufficient permission requests are denied', async () => {
  const prisma = memoryPrisma(), app = websiteApp(prisma, ['website.pages.read'])
  assert.equal((await request(app, '/website/pages', 'GET', undefined, false)).status, 401)
  assert.equal((await request(app, `/website/pages/${id(101)}`, 'PATCH', { title: 'attack' })).status, 403)
  assert.equal((await request(app, '/website/pages')).status, 200, 'page reader does not need configuration permission for default site lookup')
  assert.equal(prisma._writes.length, 0)
})

test('page update cannot reactivate, unpublish or alter live metadata without publish', async () => {
  const prisma = memoryPrisma(), app = websiteApp(prisma, ['website.pages.update'])
  for (const status of ['published', 'draft', 'archived']) assert.equal((await request(app, `/website/pages/${id(101)}`, 'PATCH', { status })).status, 403)
  prisma._tables.websitePage[0].status = 'published'
  assert.equal((await request(app, `/website/pages/${id(101)}`, 'PATCH', { title: 'live edit' })).status, 403)
  assert.equal((await request(app, `/website/pages/${id(101)}/draft`, 'POST', { builderData: { local: true } })).status, 200)
  assert.equal(prisma._tables.websitePage[0].status, 'published')
  assert.equal(prisma._tables.websitePage[0].title, 'A')
})

test('valid publish permission retains the existing publication operation', async () => {
  const prisma = memoryPrisma(), app = websiteApp(prisma, ['website.pages.publish'])
  assert.equal((await request(app, `/website/pages/${id(101)}/publish`, 'POST')).status, 200)
  assert.equal(prisma._tables.websitePage[0].status, 'published')
  assert.equal(prisma._tables.websitePageVersion.length, 1)
})

test('strict blog PATCH and direct service reject mass assignment without writes', async () => {
  const prisma = memoryPrisma(), app = websiteApp(prisma)
  const response = await request(app, `/website/blog/categories/${id(141)}`, 'PATCH', { name: 'attack', companyId: B, siteId: B1 })
  assert.equal(response.status, 400)
  const service = createWebsiteService({ prisma })
  await assert.rejects(service.updateBlogCategory({ access: accessFor(ALL), companyId: A, categoryId: id(141), data: { companyId: B, name: 'attack' } }), rejected(422))
  assert.equal(prisma._writes.length, 0)
})

test('cross-company or cross-site references are rejected before creating or resetting parents', async () => {
  const prisma = memoryPrisma(), service = createWebsiteService({ prisma }), access = accessFor(ALL)
  for (const siteId of [B1, id(999)]) await assert.rejects(service.createPage({ access, companyId: A, siteId, data: { title: 'New', slug: 'new', routePath: '/new' } }), rejected(404))
  await assert.rejects(service.updateSite({ access, companyId: A, siteId: A1, data: { themeId: id(112) } }), rejected(404))
  await assert.rejects(service.updateSite({ access, companyId: A, siteId: A1, data: { homepagePageId: id(201) } }), rejected(404))
  await assert.rejects(service.createBlogPost({ access, companyId: A, siteId: A1, data: { title: 'New', slug: 'new', categoryId: id(142) } }), rejected(404))
  await assert.rejects(service.createMenuItem({ access, companyId: A, menuId: id(121), data: { label: 'X', pageId: id(102) } }), rejected(404))
  await assert.rejects(service.createMenuItem({ access, companyId: A, menuId: id(121), data: { label: 'X', parentId: id(132) } }), rejected(404))
  assert.equal(prisma._writes.length, 0)
})

test('menu cycles and mixed-menu reorder never partially mutate rows', async () => {
  const prisma = memoryPrisma(), service = createWebsiteService({ prisma }), access = accessFor(ALL)
  await assert.rejects(service.updateMenuItem({ access, companyId: A, itemId: id(131), data: { parentId: id(131) } }), rejected(422))
  await assert.rejects(service.reorderMenuItems({ access, companyId: A, menuId: id(121), items: [{ id: id(131), sortOrder: 1 }, { id: id(132), sortOrder: 2 }] }), rejected(404))
  assert.equal(prisma._writes.length, 0)
  await service.reorderMenuItems({ access, companyId: A, menuId: id(121), items: [{ id: id(131), sortOrder: 4 }] })
  assert.equal(prisma._tables.websiteMenuItem[0].sortOrder, 4)
})

test('Website and Growth owners retain distinct historical IDs and cannot administer each other', async () => {
  const prisma = memoryPrisma(), website = createFormsService({ prisma }), growth = createFormsService({ prisma, ownerDomain: 'growth' }), access = accessFor(ALL)
  assert.equal((await website.getForm({ access, companyId: A, formId: id(161) })).siteId, A1)
  assert.equal((await growth.getForm({ access, companyId: A, formId: id(163) })).siteId, PROPERTY)
  await assert.rejects(website.getForm({ access, companyId: A, formId: id(163) }), rejected(404))
  await assert.rejects(growth.getForm({ access, companyId: A, formId: id(161) }), rejected(404))
  const created = await growth.createForm({ access, companyId: A, siteId: PROPERTY, data: { name: 'Growth new' } })
  assert.equal(created.siteId, PROPERTY)
  const history = structuredClone(prisma._tables.websiteFormSubmission)
  await assert.rejects(website.createForm({ access, companyId: A, siteId: B1, data: { name: 'bad' } }), rejected(404))
  assert.deepEqual(prisma._tables.websiteFormSubmission, history)
})

test('ambiguous historical form owner is explicit 409, never silently reassigned', async () => {
  const prisma = memoryPrisma()
  prisma._tables.growthProperty.push({ id: A1, companyId: A, enabled: true, websiteSiteId: A1 })
  const before = structuredClone(prisma._tables)
  await assert.rejects(createFormsService({ prisma }).getForm({ access: accessFor(ALL), companyId: A, formId: id(161) }), rejected(409, 'ambiguous_site_identifier'))
  assert.deepEqual(prisma._tables, before)
})

test('new form permissions and explicit legacy equivalents allow only their intended actions', async () => {
  const prisma = memoryPrisma()
  for (const permission of ['website.forms.read', 'website.pages.read']) {
    const app = websiteApp(prisma, [permission])
    assert.equal((await request(app, `/website/forms/${id(161)}`)).status, 200)
    assert.equal((await request(app, `/website/forms/${id(161)}`, 'PATCH', { name: 'attack' })).status, 403)
  }
  for (const permission of ['website.submissions.read', 'website.pages.read']) assert.equal((await request(websiteApp(prisma, [permission]), `/website/forms/${id(161)}/submissions`)).status, 200)
  const service = createFormsService({ prisma })
  await assert.rejects(service.createForm({ access: accessFor(['website.forms.read']), companyId: A, siteId: A1, data: { name: 'bad' } }), rejected(403))
})

test('form fields and submission paths are bound to the specified parent, retention forbids physical deletion', async () => {
  const prisma = memoryPrisma(), service = createFormsService({ prisma }), access = accessFor(ALL), before = structuredClone(prisma._tables)
  await assert.rejects(service.reorderFormFields({ access, companyId: A, formId: id(161), items: [{ id: id(171), sortOrder: 1 }, { id: id(172), sortOrder: 2 }] }), rejected(404))
  await assert.rejects(service.deleteSubmission({ access, companyId: A, formId: id(161), submissionId: id(182) }), rejected(404))
  await assert.rejects(service.deleteSubmission({ access, companyId: A, formId: id(161), submissionId: id(181) }), rejected(409, 'retention_required'))
  assert.equal(prisma._writes.length, 0)
  assert.deepEqual(prisma._tables, before)
})

test('site deletion archives only its own site, preserving all history and records', async () => {
  const prisma = memoryPrisma(), service = createWebsiteService({ prisma }), before = structuredClone(prisma._tables)
  await service.deleteSite({ access: accessFor(ALL), companyId: A, siteId: A1 })
  assert.equal(prisma._tables.websiteSite[0].enabled, false)
  for (const name of Object.keys(before).filter(name => !['websiteSite', 'auditLog'].includes(name))) assert.deepEqual(prisma._tables[name], before[name], name)
  assert.deepEqual(prisma._tables.websiteSite[2], before.websiteSite[2])
})

test('MCP direct calls cannot skip action permission or switch public source with only site.update', async () => {
  const prisma = memoryPrisma(), adapter = createWebsiteAdapter({ prisma })
  const actor = perms => ({ companyId: A, actorProfileId: USER, can: key => perms.includes(key) })
  const setup = adapter.actions.find(x => x.key === 'website.site.setup')
  await assert.rejects(setup.execute({ useBuilder: true }, actor(['website.site.update'])), rejected(403))
  await assert.rejects(adapter.queries.find(x => x.name === 'website_page_detail').run({ pageId: id(201) }, actor([])), rejected(403))
  await assert.rejects(adapter.queries.find(x => x.name === 'website_page_detail').run({ pageId: id(201) }, actor(['website.pages.read'])), error => error.status === 404)
  assert.equal(prisma._writes.length, 0)
})

test('Growth REST receives server context and preserves legitimate external ownership', async () => {
  const prisma = memoryPrisma(), app = new Hono()
  app.route('/', createGrowthFormRoutes({ formsService: createFormsService({ prisma, ownerDomain: 'growth' }), growthPropertyService: { assertProperty: async () => {} }, requirePermission: testPermission(ALL) }))
  const response = await request(app, '/growth/forms', 'POST', { propertyId: PROPERTY, name: 'External fixture' })
  assert.equal(response.status, 201)
  assert.equal(prisma._tables.websiteForm.at(-1).siteId, PROPERTY)
  assert.equal((await request(app, `/growth/forms/${id(261)}`)).status, 404)
})
