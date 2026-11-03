// Contract fixture for the Website admin API (S1-S4 shapes and error codes as
// documented in docs/superpowers/evidence/2026-11-02-website-recovery/*).
// It reproduces the CONTRACT (revision CAS, 409 codes, idempotency, release
// state machine) so the UI can be driven in a real browser. It is not the
// backend and proves nothing about it.
let seq = 0
const id = (p) => `${p}-${++seq}`
const now = () => new Date().toISOString()

export function createFixture(options = {}) {
  const state = {
    sites: [], pages: [], drafts: {}, releases: [], domains: [], idem: {}, log: [], imports: {},
    flags: { isolationRequired: false, failSecondPage: false, conflictOnNextSave: false, failPrepare: null, ...options },
  }
  const emptyDoc = (title) => ({ schemaVersion: 1, id: `page_${title}`, slug: '/', title, visibility: 'public', regions: { main: { id: 'region_main', children: [] } }, blocks: {}, seo: { title, description: '', canonical: null, ogImageAssetId: null }, updatedAt: now() })

  function addSite(data = {}) {
    const site = { id: id('site'), companyId: 'company-a', name: 'Sitio', siteType: 'website', lifecycle: 'draft', draftRevision: 0, publicationRevision: 0, activeReleaseId: null, lastPublishedReleaseId: null, defaultForCompany: state.sites.length === 0, releaseManaged: true, status: 'draft', draftIdentity: {}, createdAt: now(), ...data }
    state.sites.push(site); return site
  }
  function addPage(siteId, data = {}) {
    const page = { id: id('page'), siteId, title: 'Página', slug: 'pagina', routePath: '/pagina', status: 'draft', visibility: 'public', revision: 0, pageType: 'page', draftMetadata: {}, updatedAt: now(), ...data }
    state.pages.push(page); state.drafts[page.id] = emptyDoc(page.title); return page
  }
  const bump = (site) => { site.draftRevision += 1 }
  const err = (status, code, message) => ({ status, body: { error: { code, message: message ?? code, retryable: status >= 500 } } })
  const ok = (data, status = 200, extra = {}) => ({ status, body: { data, ...extra } })

  function handle(method, path, query, body, headers) {
    state.log.push(`${method} ${path}`)
    let m
    if (method === 'GET' && path === '/website/sites') return ok(state.sites)
    if (method === 'POST' && path === '/website/sites') {
      const key = headers['idempotency-key']
      if (!key || key.length < 16) return err(422, 'validation_failed', 'Idempotency-Key requerida.')
      if (state.idem[`site:${key}`]) return ok(state.idem[`site:${key}`], 201)
      const site = addSite({ name: body.name, siteType: body.siteType ?? 'website' })
      state.idem[`site:${key}`] = site; return ok(site, 201)
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)$/))) {
      const site = state.sites.find((s) => s.id === m[1]); if (!site) return err(404, 'resource_not_found')
      if (method === 'GET') return ok(site)
      if (method === 'PATCH') {
        if (Number(body.expectedRevision) !== site.draftRevision) return err(409, 'revision_conflict')
        site.draftIdentity = { ...site.draftIdentity, ...body.identity }; if (body.identity?.name) site.name = body.identity.name; bump(site); return ok(site)
      }
    }
    if ((m = path.match(/^\/website\/site\/([^/]+)$/)) && method === 'DELETE') {
      const site = state.sites.find((s) => s.id === m[1]); if (!site) return err(404, 'resource_not_found')
      site.lifecycle = 'archived'; return ok({ id: site.id })
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/pages$/))) {
      const site = state.sites.find((s) => s.id === m[1]); if (!site) return err(404, 'resource_not_found')
      if (method === 'GET') return ok(state.pages.filter((p) => p.siteId === site.id), 200, { total: state.pages.length })
      if (method === 'POST') {
        if (state.flags.failSecondPage && state.pages.filter((p) => p.siteId === site.id).length >= 1) { state.flags.failSecondPage = false; return err(503, 'dependency_unavailable') }
        const key = headers['idempotency-key']; if (state.idem[`page:${key}`]) return ok(state.idem[`page:${key}`], 201)
        if (state.pages.some((p) => p.siteId === site.id && p.routePath === body.routePath)) return err(409, 'route_conflict')
        const page = addPage(site.id, { title: body.title, slug: body.slug, routePath: body.routePath, visibility: body.visibility ?? 'public' }); state.idem[`page:${key}`] = page; bump(site); return ok(page, 201)
      }
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/pages\/([^/]+)\/draft$/))) {
      const site = state.sites.find((s) => s.id === m[1]); const page = state.pages.find((p) => p.id === m[2] && p.siteId === m[1])
      if (!site || !page) return err(404, 'resource_not_found')
      if (method === 'GET') return ok({ pageId: page.id, siteId: site.id, revision: page.revision, document: state.drafts[page.id], documentHash: `h${page.revision}`, metadata: page.draftMetadata, seo: {}, issues: [] })
      if (method === 'PUT') {
        if (state.flags.conflictOnNextSave) { state.flags.conflictOnNextSave = false; page.revision += 1; state.drafts[page.id] = { ...state.drafts[page.id], title: 'Versión de otra persona' }; return err(409, 'revision_conflict') }
        if (Number(body.expectedRevision) !== page.revision) return err(409, 'revision_conflict')
        state.drafts[page.id] = body.document; if (body.metadata) { page.draftMetadata = body.metadata; if (body.metadata.title) page.title = body.metadata.title }
        page.revision += 1; bump(site); return ok({ pageId: page.id, siteId: site.id, revision: page.revision, document: body.document, documentHash: `h${page.revision}`, metadata: page.draftMetadata, seo: {} })
      }
    }
    if ((m = path.match(/^\/website\/pages\/([^/]+)$/))) {
      const page = state.pages.find((p) => p.id === m[1]); if (!page) return err(404, 'resource_not_found')
      if (method === 'GET') return ok(page)
      if (method === 'DELETE') { state.pages = state.pages.filter((p) => p.id !== page.id); return ok({ id: page.id }) }
    }
    if (path === '/website/theme') return ok({ id: 'theme-1', tokens: {} })
    if (path === '/company/branding') return ok({ logoUrl: null })
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/releases$/))) {
      const site = state.sites.find((s) => s.id === m[1]); if (!site) return err(404, 'resource_not_found')
      if (method === 'GET') return { status: 200, body: { data: state.releases.filter((r) => r.siteId === site.id).slice().reverse(), meta: { nextCursor: null } } }
      if (method === 'POST') {
        const key = headers['idempotency-key']; if (state.idem[`rel:${key}`]) return ok(state.idem[`rel:${key}`], 202)
        if (Number(body.expectedDraftRevision) !== site.draftRevision) return err(409, 'draft_changed')
        if (Number(body.expectedPublicationRevision) !== site.publicationRevision) return err(409, 'publication_conflict')
        const blocked = state.flags.failPrepare ?? (body.kind === 'builder' && body.changes.publishPageIds.some((pid) => Object.values(state.drafts[pid]?.blocks ?? {}).some((b) => b.type === 'ContactFormBlock' && b.props?.formId)) ? 'form_scope_unresolved' : null)
        const rel = { id: id('rel'), siteId: site.id, baseReleaseId: body.baseReleaseId ?? null, draftRevision: site.draftRevision, publicationRevision: site.publicationRevision, state: 'preparing', manifest: null, manifestHash: null, failureCode: null, actorId: 'actor-1', createdAt: now(), _polls: 0, _fail: blocked, _kind: body.kind }
        state.releases.push(rel); state.idem[`rel:${key}`] = rel; return ok(strip(rel), 202)
      }
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/releases\/([^/]+)$/))) {
      const rel = state.releases.find((r) => r.id === m[2] && r.siteId === m[1]); if (!rel) return err(404, 'resource_not_found')
      if (rel.state === 'preparing' && ++rel._polls >= 1) { if (rel._fail) { rel.state = 'failed'; rel.failureCode = rel._fail } else { rel.state = 'ready'; rel.manifestHash = `hash-${rel.id}` ; rel.manifest = { integrityMode: 'sealed', kind: rel._kind } } }
      return ok(strip(rel))
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/publication\/(activate|rollback|unpublish)$/))) {
      const site = state.sites.find((s) => s.id === m[1]); if (!site) return err(404, 'resource_not_found')
      const key = headers['idempotency-key']; if (!key) return err(422, 'validation_failed')
      if (Number(body.expectedPublicationRevision) !== site.publicationRevision) return err(409, 'publication_conflict')
      if (m[2] === 'unpublish') { site.activeReleaseId = null; site.lifecycle = 'unpublished'; site.publicationRevision += 1; return ok({ lifecycle: site.lifecycle, publicationRevision: site.publicationRevision }) }
      const rel = state.releases.find((r) => r.id === body.releaseId && r.siteId === site.id)
      if (!rel || rel.state !== 'ready') return err(409, 'release_not_ready')
      if (m[2] === 'activate') {
        if (Number(body.expectedDraftRevision) !== site.draftRevision) return err(409, 'draft_changed')
        if (body.manifestHash !== rel.manifestHash) return err(409, 'release_not_ready')
        rel.published = true
      } else if (!rel.published) return err(409, 'rollback_not_published')
      site.activeReleaseId = rel.id; site.lastPublishedReleaseId = rel.id; site.lifecycle = 'published'; site.publicationRevision += 1
      for (const p of state.pages) if (p.siteId === site.id) p.status = 'published'
      return ok({ activeReleaseId: rel.id, lifecycle: site.lifecycle, publicationRevision: site.publicationRevision })
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/domains$/))) {
      if (method === 'GET') return ok(state.domains.filter((d) => d.siteId === m[1]))
      if (state.domains.some((d) => d.hostname.startsWith(`${body.slug}.`))) return err(409, 'hostname_taken')
      const d = { hostname: `${body.slug}.sitios.example.test`, siteId: m[1], kind: 'platform', state: 'pending', ready: false }; state.domains.push(d); return ok(d, 201)
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/previews$/)) && method === 'POST') return ok({ id: id('prev'), releaseId: 'x', url: `${headers.origin ?? ''}/__preview-fixture#token`, expiresAt: now(), readOnly: true }, 201)
    if (path.match(/\/previews\/[^/]+$/) && method === 'DELETE') return ok({ revoked: true })
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/imports$/)) && method === 'POST') {
      if (state.flags.isolationRequired) return err(409, 'isolation_required')
      const imp = { id: id('imp'), phase: 'validating', _polls: 0, errorCodes: [] }; state.imports[imp.id] = imp; return ok(imp, 202)
    }
    if ((m = path.match(/^\/website\/sites\/([^/]+)\/imports\/([^/]+)$/))) {
      const imp = state.imports[m[2]]; if (!imp) return err(404, 'resource_not_found'); imp.phase = state.flags.rejectImport ? 'rejected' : 'ready'; if (imp.phase === 'rejected') imp.errorCodes = ['unsafe_content']; return ok(imp)
    }
    return err(404, 'resource_not_found', `fixture: ${method} ${path}`)
  }
  const strip = ({ _polls, _fail, _kind, published, ...rest }) => rest
  return { state, handle, addSite, addPage }
}
