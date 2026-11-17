// Studio Next: Studio → Website on a disposable stack, with the real dialogs and the real Atlas
// editor. Acceptance project → Enviar a Website → draft pages → Atlas (desktop, tablet, phone) →
// edit a text → save → reopen. Also: private photos copied to the site, effects, warnings,
// existing Website pages, idempotent replay, recovery after a failure, permissions and company isolation.
// Usage: node scripts/verify-studio-website.mjs --build-api-image | --api-image=<tag> [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { validateDocument } from '../apps/shared/studio/document.js'
import { acceptanceDocument } from './fixtures/studio/acceptance-project.mjs'
import { apiImageFromArgs, createReport, startPresentStack, until } from './fixtures/studio/present-stack.mjs'

const report = createReport(), { ok, step } = report
const OUT = resolve('.artifacts/studio/website'); await mkdir(OUT, { recursive: true })
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: join(OUT, 'shots') })
const { stack, scenario, company, users, api, json, stored, uploadPhoto, createDesign, openEditor, pageErrors } = ctx
const q = async (sql, params) => (await stack.pool.query(sql, params)).rows
const key = () => randomBytes(16).toString('hex')
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) })
const blocksOf = doc => Object.values(doc.blocks)
const STUDIO = { 'X-Runly-Studio-Protocol': '4' }

// The acceptance project plus a group, an emphasis and a line (no Website equivalent: one image).
function project(photo) {
  const doc = structuredClone(acceptanceDocument(photo))
  doc.objects[1].groupId = 'grupo-1'; doc.objects[2].groupId = 'grupo-1'
  doc.additionalPages[0].objects[1].emphasis = { preset: 'pulse', duration: 600, delay: 900, easing: 'ease-in-out', repeat: 2 }
  doc.additionalPages[1].objects.push({ id: 'linea-3', type: 'line', x: 160, y: 900, width: 1600, height: 40, rotation: 0, fill: '#16a34a', points: [[0, 0.5], [1, 0.5]], strokeWidth: 8 })
  return validateDocument(doc)
}

try {
  const photo = await uploadPhoto('#14b8a6', 'foto-privada.png')
  const design = await createDesign('Proyecto de aceptación', project(photo.id))
  const before = await stored(design.id)
  const site = (await json(await api('/website/sites', { data: { name: 'Sitio Studio' }, headers: { 'Idempotency-Key': key() } }))).id
  ok('acceptance project (3 pages: photo, texts, shapes, a group, entrances, emphasis, keyframes, a line) and an empty Website site')
  const { page: a } = await openEditor(users.owner, design.id)
  let pages, firstId

  await step('Studio → Enviar a Website: report, draft pages, opens Atlas; nothing published, design unchanged', async () => {
    await a.getByRole('button', { name: 'Más acciones' }).click()
    await a.getByRole('menuitem', { name: 'Enviar a Website' }).click()
    const dialog = a.getByRole('dialog', { name: 'Enviar a Website' })
    const summary = dialog.getByRole('region', { name: 'Resultado de la conversión' })
    await summary.waitFor({ timeout: 60000 })
    const text = await summary.innerText()
    assert.match(text, /Editables en Website: 2 textos, 2 fotos, 2 formas, 1 grupos/)
    assert.match(text, /1 por círculo de más de 400 px en escritorio; 1 por línea o flecha/)
    assert.match(text, /salida y énfasis y los keyframes/)
    await shot(a, '01-dialogo')
    const started = Date.now()
    await dialog.getByRole('button', { name: 'Crear borradores' }).click()
    await a.waitForURL(url => /\/sites\/[^/]+\/pages\/[^/]+\/editor/.test(url.pathname), { timeout: 120000 })
    firstId = /\/pages\/([^/]+)\/editor/.exec(new URL(a.url()).pathname)[1]
    pages = await q('SELECT id,title,route_path,status,draft_builder_data FROM website_page WHERE site_id=$1 AND enabled ORDER BY route_path', [site])
    assert.deepEqual(pages.map(p => [p.route_path, p.status]), [['/proyecto-de-aceptacion', 'draft'], ['/proyecto-de-aceptacion-2', 'draft'], ['/proyecto-de-aceptacion-3', 'draft']])
    assert.equal(pages[0].id, firstId)
    const [row] = await q('SELECT active_release_id FROM website_site WHERE id=$1', [site])
    assert.equal(row.active_release_id, null, 'nothing published')
    const after = await stored(design.id)
    assert.deepEqual([after.revision, JSON.stringify(after.document)], [before.revision, JSON.stringify(before.document)], 'Studio design untouched')
    ok(`3 draft pages created in ${((Date.now() - started) / 1000).toFixed(1)} s and Atlas opened on the first; the dialog reported the editable elements, the 444 px circle and the line as images and the motion losses; site unpublished; design unchanged`)
  })

  await step('stored draft pages: editable text, independent private photos, shapes, group, layers, effects, responsive props', async () => {
    const one = blocksOf(pages[0].draft_builder_data), three = blocksOf(pages[2].draft_builder_data)
    const title = one.find(b => b.type === 'TextElementBlock' && b.props.text === 'Studio Next')
    assert.ok(title, 'the title is a TextElementBlock with its text')
    assert.deepEqual([title.props.position, title.props.tabletPosition, title.props._animation?.preset], ['absolute', 'flow', 'fade-in'])
    const photos = [...one, ...three].filter(b => b.type === 'ImageElementBlock' && /^file:/.test(b.props.src) && b.props.fit === 'cover')
    assert.equal(photos.length, 2, 'two photo elements')
    const files = await q("SELECT id,entity_id,module_key,visibility,mime_type,metadata->>'companyId' AS company FROM file_asset WHERE id = ANY($1::uuid[])", [[...new Set([...one, ...three].filter(b => /^file:/.test(b.props.src ?? '')).map(b => b.props.src.slice(5)))]])
    assert.ok(files.length >= 2 && files.every(f => f.entity_id === site && f.module_key === 'runly.website' && f.visibility === 'PRIVATE' && f.company === company.id), 'site-scoped private copies')
    assert.ok(!files.some(f => f.id === photo.id), 'not the Studio file itself')
    // The Website editor resolves file:<id> through the site's private image list.
    const listed = await api(`/website/sites/${site}/template-assets`)
    const visible = (await listed.json()).data ?? []
    assert.ok(files.every(f => visible.some(v => v.id === f.id)), `editor image list: ${listed.status} ${JSON.stringify(visible).slice(0, 300)} vs ${JSON.stringify(files.map(f => f.id))} ${JSON.stringify(await q('SELECT id,size_bytes,checksum,mime_type,uploaded_by_id,module_key,visibility,metadata FROM file_asset WHERE entity_id=$1', [site]))}`)
    const box = one.find(b => b.type === 'BoxBlock' && b.props.backgroundColor === '#ef4444')
    assert.ok(box && box.props.layer === 2, 'red rectangle as an editable box on its layer')
    assert.ok(one.some(b => b.type === 'BoxBlock' && b.props.layout === 'free' && b.children?.children?.length === 2 && b.props.position === 'absolute'), 'group as a free container')
    assert.ok(three.some(b => b.type === 'ImageElementBlock' && b.props.fit === 'contain'), 'the line as one image of itself')
    assert.ok(blocksOf(pages[1].draft_builder_data).some(b => b.type === 'ImageElementBlock' && b.props._animation?.preset === 'zoom-in'), 'zoom-in entrance kept on the circle image')
    const json = JSON.stringify(pages.map(p => p.draft_builder_data))
    assert.ok(!/https?:\/\/[^"]*(token|sign|storage)/i.test(json) && !json.includes(photo.id), 'no signed URLs or Studio file ids')
    ok(`page 1: ${one.length} blocks (text, photo, box, group as free container, layers ${[...new Set(one.map(b => b.props.layer).filter(v => v !== undefined))].join('/')}); photos copied as private site files of this company; effects as _animation; no URLs or Studio ids`)
  })

  await step('Atlas: desktop composition, tablet and phone stacked without overflow; edit a text; save; reopen', async () => {
    await a.getByText('Studio Next', { exact: true }).first().waitFor({ timeout: 60000 })
    // The private photo must be drawn from the site's private image list, not left as a placeholder.
    const assetCalls = []
    a.on('response', response => { if (/template-assets/.test(response.url())) assetCalls.push(`${response.status()} ${new URL(response.url()).pathname.split('/').slice(-2).join('/')}`) })
    if (!await a.locator('img[src^="data:image"]').first().waitFor({ timeout: 20000 }).then(() => true, () => false)) {
      await a.reload(); await a.getByText('Studio Next', { exact: true }).first().waitFor({ timeout: 60000 })
      await a.locator('img[src^="data:image"]').first().waitFor({ timeout: 20000 }).catch(async () => { throw Error(`private photo not drawn; template-assets: ${assetCalls.join(', ')}; placeholders: ${await a.getByText('Selecciona una imagen').count()}`) })
    }
    await a.waitForTimeout(800); await shot(a, '02-atlas-escritorio')
    const measure = async () => (await a.getByText(/^Studio Next/).first().elementHandle()).evaluate(text => {
      // The page canvas: parent of the outermost block around the title (the section).
      let section = text.closest('[data-block-id]') ?? text
      while (section.parentElement?.closest('[data-block-id]')) section = section.parentElement.closest('[data-block-id]')
      const root = section.parentElement, r = root.getBoundingClientRect(), images = [...root.querySelectorAll('img')]
      return { width: r.width, overflow: root.scrollWidth - root.clientWidth, textTag: text.tagName, textIsImage: text.tagName === 'IMG' || Boolean(text.querySelector('img')), images: images.length, outside: images.filter(img => { const b = img.getBoundingClientRect(); return b.right > r.right + 1 || b.left < r.left - 1 }).length }
    })
    const desktop = await measure()
    assert.ok(desktop.textTag && !desktop.textIsImage, 'the title is DOM text, not an image')
    assert.ok(desktop.images >= 1)
    const one = label => a.getByRole('radio', { name: label, exact: true }).or(a.getByRole('button', { name: label, exact: true })).or(a.getByTitle(label, { exact: true }))
    const device = label => (label === 'Teléfono' ? one('Teléfono').or(one('Móvil')) : one(label)).first()
    for (const [label, name] of [['Tableta', 'tableta'], ['Teléfono', 'telefono']]) {
      await device(label).click(); await a.waitForTimeout(800)
      const view = await measure()
      assert.ok(view.overflow <= 1 && view.outside === 0, `${label}: no horizontal overflow (${JSON.stringify(view)})`)
      await shot(a, `03-atlas-${name}`)
    }
    await device('Escritorio').click(); await a.waitForTimeout(500)
    // Edit the title through the inspector: the real text element changes.
    // A click selects the outer group first; the next one reaches the text element.
    // The inspector's Texto field is the textarea holding the element's text.
    const textField = async () => { for (const area of await a.locator('textarea').all()) if (await area.isVisible() && (await area.inputValue()) === 'Studio Next') return area; return null }
    let field = null
    for (let attempt = 0; attempt < 3 && !(field = await textField()); attempt++) { await a.getByText('Studio Next', { exact: true }).first().click(); await a.waitForTimeout(600) }
    if (!field) { await shot(a, 'debug-seleccion'); throw Error('the inspector did not show the Texto field') }
    await shot(a, '03b-atlas-texto-seleccionado')
    await field.fill('Studio Next en Website')
    await a.getByRole('button', { name: 'Guardar borrador' }).click()
    await until(async () => JSON.stringify((await q('SELECT draft_builder_data FROM website_page WHERE id=$1', [firstId]))[0].draft_builder_data).includes('Studio Next en Website'), 'draft saved', 20000)
    const saved = blocksOf((await q('SELECT draft_builder_data FROM website_page WHERE id=$1', [firstId]))[0].draft_builder_data)
    assert.ok(saved.some(b => b.type === 'TextElementBlock' && b.props.text === 'Studio Next en Website'), 'the TextElementBlock changed')
    assert.ok(saved.filter(b => b.type === 'ImageElementBlock').every(b => /^file:/.test(b.props.src)), 'photos still stored as private site references')
    await a.reload(); await a.getByText('Studio Next en Website', { exact: true }).first().waitFor({ timeout: 60000 })
    await shot(a, '04-atlas-reabierto')
    ok(`desktop ${desktop.width.toFixed(0)} px with DOM text and ${desktop.images} images; tablet and phone stacked without horizontal overflow; title edited in the inspector → the TextElementBlock text changed; saved; reopened with the edit and the private photos`)
  })

  await step('idempotent replay, existing pages, failure recovery, permissions and company isolation', async () => {
    const convert = (body, { user = users.owner, id = design.id, idempotencyKey = key(), headers = {} } = {}) => api(`/studio/designs/${id}/website`, { user, data: body, headers: { ...STUDIO, 'Idempotency-Key': idempotencyKey, ...headers } })
    const state = async target => (await json(await api(`/website/sites/${target}`))).draftRevision
    // A second site with an existing page on the same route: refused without replace, kept intact.
    const other = (await json(await api('/website/sites', { data: { name: 'Sitio existente' }, headers: { 'Idempotency-Key': key() } }))).id
    await json(await api(`/website/sites/${other}/pages`, { data: { title: 'Inicio actual', routePath: '/portada', slug: 'portada' }, headers: { 'Idempotency-Key': key() } }))
    const simple = { siteId: other, designRevision: before.revision, pages: [{ pageId: 'page-1', routePath: '/portada', title: 'Portada' }], rasters: [], acceptWarnings: true }
    const clash = await convert({ ...simple, expectedRevision: await state(other) })
    assert.equal(clash.status, 409, await clash.text())
    assert.equal((await q("SELECT count(*)::int n FROM website_page WHERE site_id=$1 AND enabled", [other]))[0].n, 1, 'existing page untouched')
    const replayKey = key(), body = { ...simple, expectedRevision: await state(other), pages: [{ pageId: 'page-1', routePath: '/portada-studio', title: 'Portada Studio' }] }
    const first = await json(await convert(body, { idempotencyKey: replayKey })), again = await json(await convert(body, { idempotencyKey: replayKey }))
    assert.deepEqual(again.pages, first.pages, 'same key → same result, no duplicate')
    assert.equal((await q("SELECT count(*)::int n FROM website_page WHERE site_id=$1 AND enabled", [other]))[0].n, 2)
    // Failure after the photo upload: the page is rejected by the Website checks; nothing stays.
    const bad = await createDesign('Texto no permitido', validateDocument({ schemaVersion: 8, unit: 'px', page: { id: 'p', width: 800, height: 600, background: '#ffffff' },
      objects: [{ id: 'f', type: 'image', fileAssetId: photo.id, x: 0, y: 0, width: 400, height: 300, rotation: 0, fill: '#000000' }, { id: 't', type: 'text', x: 0, y: 400, width: 600, height: 80, rotation: 0, fill: '#000000', text: 'javascript:alert(1)', fontSize: 40 }], additionalPages: [] }))
    const filesBefore = (await q('SELECT count(*)::int n FROM file_asset WHERE entity_id=$1', [other]))[0].n
    const failed = await convert({ siteId: other, expectedRevision: await state(other), designRevision: 1, pages: [{ pageId: 'p', routePath: '/rechazada', title: 'x' }], rasters: [], acceptWarnings: true }, { id: bad.id })
    assert.equal(failed.status, 422)
    await until(async () => (await q("SELECT count(*)::int n FROM website_template_job WHERE site_id=$1 AND state IN ('preparing','cleanup')", [other]))[0].n === 0, 'staged upload compensated', 30000)
    assert.equal((await q('SELECT count(*)::int n FROM file_asset WHERE entity_id=$1', [other]))[0].n, filesBefore, 'no file left')
    assert.equal((await q("SELECT count(*)::int n FROM website_page WHERE site_id=$1 AND route_path='/rechazada'", [other]))[0].n, 0, 'no page left')
    // Permissions: a Studio viewer without Website permissions cannot convert.
    await json(await api(`/studio/designs/${design.id}/collaborators`, { method: 'PUT', data: { userId: users.viewer.id, role: 'VIEWER' } }))
    const denied = await convert({ ...body, expectedRevision: await state(other), pages: [{ pageId: 'page-1', routePath: '/visor', title: 'x' }] }, { user: users.viewer })
    assert.ok([401, 403].includes(denied.status), `viewer: ${denied.status}`)
    // Another company: neither its design nor a site of this company can be reached.
    const [, foreign] = scenario.companies, outsider = scenario.users[3]
    const login = await (await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: outsider.email, password: outsider.password }) })).json()
    const cross = await fetch(`${stack.urls.api}/studio/designs/${design.id}/website`, { method: 'POST', body: JSON.stringify({ ...body, expectedRevision: 0 }), headers: { Authorization: `Bearer ${login.data.access_token}`, 'Content-Type': 'application/json', 'X-Runly-Company-Id': foreign.id, 'Idempotency-Key': key(), ...STUDIO } })
    assert.ok([403, 404].includes(cross.status), `other company: ${cross.status}`)
    ok('a page on an existing route is refused (409) and the existing page stays; a replay with the same key returns the same pages; a rejected page after the photo upload leaves no page and no file (compensated); a viewer without Website permissions and another company are refused')
  })

  await step('no uncaught page errors', async () => { assert.deepEqual(pageErrors, []); ok('no uncaught page errors') })
} catch (error) { report.fatal(error) } finally { await ctx.close(); report.finish() }
