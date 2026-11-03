import test from 'node:test'
import assert from 'node:assert/strict'
import { describeError, describeFailure, isRevisionConflict } from '../websiteErrors.js'
import { deriveEditorStatus, deriveSiteState } from '../siteState.js'
import { analyzeDocument, blockingIssues } from '../publishability.js'
import { buildCapabilities } from '../capabilities.js'
import { slugify, validateHostSlug, validateRoute } from '../pageRoute.js'
import { parseSitesPath } from '../sitesPath.js'

test('error copy: known code, status fallback, unknown fallback', () => {
  assert.equal(describeError({ status: 409, code: 'revision_conflict' }).reload, true)
  assert.equal(isRevisionConflict({ status: 409, code: 'revision_conflict' }), true)
  assert.equal(isRevisionConflict({ status: 409, code: 'draft_changed' }), false)
  assert.equal(describeError({ status: 403 }).title, 'No tienes permiso')
  assert.equal(describeError({ status: 0, code: 'network' }).retry, true)
  assert.equal(describeError({ status: 418, code: 'nope' }).title, 'Algo salió mal')
  assert.equal(describeFailure('form_scope_unresolved').blocker, true)
  assert.equal(describeFailure(undefined).title, 'No se pudo preparar la versión')
})

test('site state: uses authoritative C-2 instead of comparing unrelated revisions', () => {
  assert.equal(deriveSiteState({ lifecycle: 'draft' }, null).key, 'draft')
  const published = { lifecycle: 'published', activeReleaseId: 'r1', draftRevision: 5 }
  assert.equal(deriveSiteState(published, { draftRevision: 5 }).key, 'published')
  const pending = deriveSiteState({ ...published, hasUnpublishedChanges: true }, { draftRevision: 3 })
  assert.equal(pending.key, 'published_pending')
  assert.equal(pending.hasPending, true)
  assert.equal(pending.approximate, false)
  assert.equal(deriveSiteState({...published, hasUnpublishedChanges: false}, {draftRevision: 1}).hasPending, false)
  assert.equal(deriveSiteState({...published, lifecycle: 'archived', hasUnpublishedChanges: true}).key, 'archived')
  assert.equal(deriveSiteState(published, null).hasPending, null)
  assert.equal(deriveSiteState({ lifecycle: 'unpublished' }, null).key, 'unpublished')
  assert.equal(deriveSiteState({ lifecycle: 'archived' }, null).key, 'archived')
  assert.equal(deriveSiteState({ lifecycle: 'draft', releaseManaged: false, status: 'published' }, null).key, 'legacy_published')
})

test('editor status never reports unsaved local edits', () => {
  const state = deriveSiteState({ lifecycle: 'published', activeReleaseId: 'r1', hasUnpublishedChanges: true }, { draftRevision: 4 })
  const status = deriveEditorStatus({ saveState: 'idle', siteState: state })
  assert.equal(status.draft.label, 'Guardado · pendiente de publicar')
  assert.equal(status.published.label, 'Publicado')
  assert.ok(!Object.values(status).some((level) => /sin guardar/i.test(level.label)))
  assert.equal(deriveEditorStatus({ saveState: 'saving', siteState: null }).save.label, 'Guardando…')
})

test('publishability scan is informational and only flags configured references', () => {
  const doc = { blocks: {
    a: { id: 'a', type: 'ContactFormBlock', props: { formId: 'f1' } },
    b: { id: 'b', type: 'ContactFormBlock', props: { formId: '' } },
    c: { id: 'c', type: 'BookingFormBlock', props: { calendarId: 'cal' } },
    d: { id: 'd', type: 'HeroBlock', props: {} },
  } }
  const all = analyzeDocument(doc)
  assert.equal(all.length, 3)
  const blocking = blockingIssues(all)
  assert.deepEqual(blocking.map((issue) => issue.code).sort(), ['dynamic_binding_unavailable', 'form_scope_unresolved'])
  assert.ok(blocking.every((issue) => issue.source === 'local'))
  assert.deepEqual(analyzeDocument(null), [])
})

test('capabilities derive from permissions with reasons; closed features stay closed', () => {
  const caps = buildCapabilities((key) => ['website.pages.read', 'website.pages.update', 'website.site.read'].includes(key))
  assert.equal(caps.pagesUpdate.allowed, true)
  assert.equal(caps.publish.allowed, false)
  assert.equal(caps.publish.reason.requiredPermission, 'website.pages.publish')
  assert.equal(caps.previewDraft.allowed, true)
  assert.equal(caps.archive.allowed, false)
  assert.equal(caps.formsPublish.allowed, false)
  assert.equal(caps.formsPublish.reason.code, 'form_scope_unresolved')
  assert.equal(caps.customDomain.reason.code, 'feature_unavailable')
  const all = buildCapabilities(() => true)
  assert.equal(all.publish.allowed, true)
  assert.equal(all.formsPublish.allowed, false)
})

test('route and hostname helpers mirror the server rules', () => {
  assert.equal(slugify('Contáctanos Ahora!'), 'contactanos-ahora')
  assert.equal(validateRoute('/ok/path'), null)
  assert.ok(validateRoute('no-slash'))
  assert.ok(validateRoute('/a/../b'))
  assert.ok(validateRoute('/a//b'))
  assert.equal(validateHostSlug('mi-negocio'), null)
  assert.ok(validateHostSlug('ab'))
  assert.ok(validateHostSlug('-mal'))
  assert.ok(validateHostSlug('MAL'))
})

test('sites path parser', () => {
  assert.equal(parseSitesPath('/app/m/runly.website').view, 'list')
  assert.equal(parseSitesPath('/app/m/runly.website/sites').view, 'list')
  assert.equal(parseSitesPath('/app/m/runly.website/sites/new').view, 'new')
  assert.deepEqual(parseSitesPath('/app/m/runly.website/sites/s1'), { view: 'workspace', siteId: 's1', section: 'overview' })
  assert.deepEqual(parseSitesPath('/app/m/runly.website/sites/s1/pages'), { view: 'workspace', siteId: 's1', section: 'pages' })
  assert.deepEqual(parseSitesPath('/app/m/runly.website/sites/s1/pages/p9/editor'), { view: 'editor', siteId: 's1', pageId: 'p9' })
})
