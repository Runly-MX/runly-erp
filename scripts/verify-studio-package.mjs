// Studio Next phase 6 verification: the portable .runlystudio v2 package on a disposable stack.
// Create → animate → export (real Descargar dialog) → import (real import dialog) → open → edit →
// present, with the phase 4/5 acceptance project plus a group, an emphasis effect and a second photo.
// Static pages (PNG export) and every animated frame (GIF export, the sceneAt frame loop) of the
// original and the imported design are compared. Also: v7 → package v1, legacy packages, newer and
// hostile packages, a missing resource, cancellation, permissions and company isolation.
// With --hub-feed=<dir> (written by runly-developer-hub tests/integration/studio-package-v2.test.js) it
// also installs the Hub-validated, lab-signed v2 template through the real Marketplace import services
// (in process: the API image pins the production feed key, the lab key is trusted only here), then
// opens, edits and presents it and compares its frames with the same document created directly.
// Usage: node scripts/verify-studio-package.mjs --build-api-image | --api-image=<tag> [--hub-feed=<dir>] [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { appendObject, blankDocument, validateDocument } from '../apps/shared/studio/document.js'
import { documentPages } from '../apps/shared/studio/pages.js'
import { readPackageZip } from '../packages/studio-interchange/src/inspect.js'
import { writePackageZip } from '../packages/studio-interchange/src/write.js'
import { acceptanceDocument } from './fixtures/studio/acceptance-project.mjs'
import { pathToFileURL } from 'node:url'
import prismaPackage from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createFilesService } from '../apps/api/src/services/files-service.js'
import { createStudioService } from '../apps/api/src/routes/studio/studio-service.js'
import { createStudioTemplatesService } from '../apps/api/src/routes/studio/studio-templates-service.js'
import { createStudioInterchange } from '../apps/api/src/routes/studio/interchange/service.js'
import { createResourceCatalogService, RESOURCE_CONFIG_KEYS } from '../apps/api/src/services/catalog/resource-catalog-service.js'
import { createMarketplaceImportGate } from '../apps/api/src/services/marketplace/marketplace-import-gate.js'
import { apiImageFromArgs, createReport, startPresentStack, ui, until } from './fixtures/studio/present-stack.mjs'

const sharp = createRequire(resolve('apps/api/package.json'))('sharp')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const report = createReport(), { ok, step } = report
const OUT = resolve('.artifacts/studio/package'), CORPUS = resolve('packages/studio-interchange/corpus/studio')
await mkdir(OUT, { recursive: true })
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: join(OUT, 'shots') })
const { stack, scenario, company, users, api, json, stored, uploadPhoto, createDesign, openEditor, pageErrors } = ctx

// Same bytes as uploadPhoto() produces (deterministic sharp encoder): proves originals, not thumbnails.
const photoBytes = color => sharp({ create: { width: 800, height: 600, channels: 4, background: color } }).png().toBuffer()
// The acceptance project plus what it lacks for this phase: a group, an emphasis and a second photo
// (the first photo is used twice, so the package must hold it once).
function animatedProject(photoA, photoB) {
  const doc = structuredClone(acceptanceDocument(photoA))
  const [, title, box] = doc.objects
  title.groupId = 'grupo-1'; box.groupId = 'grupo-1'
  const [square, last] = doc.additionalPages
  square.objects[1].emphasis = { preset: 'pulse', duration: 600, delay: 900, easing: 'ease-in-out', repeat: 2 }
  square.objects.push({ id: 'foto-2', type: 'image', fileAssetId: photoA, x: 60, y: 60, width: 240, height: 180, rotation: 0, fill: '#000000' })
  last.objects[0].fileAssetId = photoB
  return validateDocument(doc)
}
// Ids are renamed on import (i-<job>-p1, -o1, -g1): compare everything else, in order.
function anonymous(doc) {
  const groups = new Map()
  return documentPages(doc).map(({ page, objects }) => ({ page: { ...page, id: null }, objects: objects.map(({ id, groupId, fileAssetId, ...rest }) => ({ ...rest, ...(groupId ? { groupId: groups.get(groupId) ?? groups.set(groupId, `g${groups.size + 1}`).get(groupId) } : {}), ...(fileAssetId ? { image: true } : {}) })) }))
}
const assetIds = doc => documentPages(doc).flatMap(s => s.objects.map(o => o.fileAssetId).filter(Boolean))

async function exportPackage(target, name) {
  await target.getByRole('button', { name: 'Descargar' }).click()
  const dialog = target.getByRole('dialog').last()
  await dialog.getByRole('radio', { name: /^Proyecto Studio/ }).click()
  assert.equal(await dialog.getByText('no conserva las duraciones').count(), 0, 'no motion-loss acknowledgement any more')
  await dialog.getByText(/^Entiendo que el paquete incluye/).click()
  const started = Date.now(), download = target.waitForEvent('download', { timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Descargar', exact: true }).click()
  const confirm = target.getByRole('button', { name: /^Exportar/ })
  if (await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false)) await confirm.click()
  const file = await download, path = join(OUT, name)
  await file.saveAs(path)
  return { bytes: await readFile(path), elapsed: Date.now() - started, path, suggested: file.suggestedFilename() }
}
// Studio home → Importar archivo → review → prepare → confirm; returns the new design id.
async function importFile(target, path, { name = null, expectError = false, cancel = false } = {}) {
  await target.goto(`${stack.urls.web}/app/m/runly.studio`)
  await target.getByRole('button', { name: 'Importar archivo' }).click()
  const dialog = target.getByRole('dialog', { name: 'Importar diseño o plantilla' })
  await dialog.locator('input[type=file]').setInputFiles(path)
  // Blocking problems appear either as the error alert or as the report's blocking list.
  if (expectError) { await dialog.getByText(expectError).first().waitFor({ timeout: 60000 }); assert.equal(await dialog.getByRole('button', { name: 'Revisar e importar' }).count(), 0, 'cannot continue'); const text = await dialog.innerText(); await target.keyboard.press('Escape'); return text }
  const prepare = dialog.getByRole('button', { name: 'Revisar e importar' })
  await prepare.waitFor({ timeout: 60000 })
  if (name) await dialog.getByLabel('Nombre').fill(name)
  const started = Date.now()
  // Acceptances (unverified licenses) are real checkboxes with a visually hidden input.
  const acceptAll = async () => { for (const box of await dialog.getByRole('checkbox').all()) if (!(await box.isChecked())) await box.evaluate(input => input.click()) }
  await acceptAll(); await prepare.click()
  const confirm = dialog.getByRole('button', { name: 'Importar', exact: true })
  // Without warnings to accept, the dialog confirms by itself and opens the design.
  const opened = () => Boolean(new URL(target.url()).searchParams.get('design'))
  try { await until(async () => { if (opened()) return true; await acceptAll(); return (await confirm.count()) > 0 && await confirm.isEnabled() }, 'import prepared', 60000) }
  catch (error) { await target.screenshot({ path: join(OUT, 'shots', 'import-stuck.png') }); throw Error(`${error.message}: ${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 500)}`) }
  if (cancel) { await target.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' }); return null }
  if (!opened()) await confirm.click()
  await target.waitForURL(url => url.searchParams.get('design'), { timeout: 60000 })
  await target.getByRole('button', { name: /Deshacer/ }).first().waitFor({ timeout: 60000 })
  return { id: new URL(target.url()).searchParams.get('design'), elapsed: Date.now() - started }
}
async function exportImage(target, type, path) {
  await target.getByRole('button', { name: 'Descargar' }).click()
  const dialog = target.getByRole('dialog').last()
  await dialog.getByRole('radio', { name: type === 'png' ? /^PNG/ : /^GIF animado/ }).click()
  const download = target.waitForEvent('download', { timeout: 300_000 })
  await dialog.getByRole('button', { name: 'Descargar', exact: true }).click(); await target.getByRole('button', { name: `Exportar ${type.toUpperCase()}` }).click()
  await (await download).saveAs(path)
  return readFile(path)
}
async function pngPages(target, prefix) {
  const pages = []
  for (let n = 1; n <= 3; n++) {
    if (n > 1) { await target.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página siguiente/ }).click(); await target.waitForTimeout(500) }
    pages.push(await exportImage(target, 'png', join(OUT, `${prefix}-pagina-${n}.png`)))
  }
  await target.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página anterior/ }).click()
  await target.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página anterior/ }).click()
  return pages
}
// Max channel difference and share of differing pixels between two images of the same size.
async function compare(a, b, options = {}) {
  const [x, y] = await Promise.all([a, b].map(bytes => sharp(bytes, options).raw().toBuffer({ resolveWithObject: true })))
  assert.deepEqual([x.info.width, x.info.height], [y.info.width, y.info.height])
  let max = 0, differing = 0
  for (let i = 0; i < x.data.length; i++) { const d = Math.abs(x.data[i] - y.data[i]); if (d) { differing++; max = Math.max(max, d) } }
  return { max, share: differing / x.data.length, frames: x.info.pages ?? 1 }
}

try {
  const photoA = await uploadPhoto('#14b8a6', 'foto-privada.png'), photoB = await uploadPhoto('#f97316', 'foto-segunda.png')
  const source = animatedProject(photoA.id, photoB.id)
  const design = await createDesign('Proyecto animado', source, [[users.viewer, 'VIEWER']])
  const original = await stored(design.id)
  assert.equal(original.document.schemaVersion, 8)
  ok('created: acceptance project (3 pages, 2 private photos, one used twice) with fade/slide transitions, enter/exit/emphasis effects, keyframes and a group')
  const { page: a } = await openEditor(users.owner, design.id)

  let pkg, files, manifest, portable
  await step('export .runlystudio v2 from the dialog: versions, original resources, no links', async () => {
    pkg = await exportPackage(a, 'proyecto-animado.runlystudio')
    files = await readPackageZip(pkg.bytes); manifest = JSON.parse(files.get('manifest.json')); portable = JSON.parse(files.get('document.json'))
    assert.match(pkg.suggested, /\.runlystudio$/)
    assert.deepEqual([manifest.format, manifest.formatVersion, manifest.minReaderVersion, manifest.documentSchemaVersion, manifest.pageCount, manifest.compatibility.losses], ['runly.studio', 2, 2, 8, 3, []])
    assert.equal(manifest.resources.length, 2, 'the photo used twice is stored once')
    const expected = new Map([[sha(await photoBytes('#14b8a6')), photoA.id], [sha(await photoBytes('#f97316')), photoB.id]])
    for (const resource of manifest.resources) {
      assert.ok(expected.has(resource.sha256), 'byte-identical original upload')
      assert.deepEqual([resource.mime, resource.width, resource.height, resource.id, sha(files.get(resource.path))], ['image/png', 800, 600, `asset-${resource.sha256}`, resource.sha256])
    }
    let mapped = JSON.stringify(portable)
    for (const resource of manifest.resources) mapped = mapped.replaceAll(resource.id, expected.get(resource.sha256))
    mapped = JSON.parse(mapped)
    assert.deepEqual(validateDocument(mapped), original.document, 'document.json is the stored v8 document with package-local references')
    const text = [...files.entries()].filter(([name]) => /\.json$/.test(name)).map(([, bytes]) => bytes.toString('utf8')).join('\n')
    for (const pattern of [/https?:\/\//, /token/i, /sign(ed)?url/i, /X-Amz|Signature=/i, new RegExp(photoA.id), new RegExp(company.id), /object_?key/i]) assert.ok(!pattern.test(text), `no ${pattern} in the package`)
    await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
    ok(`${pkg.suggested}: ${(pkg.bytes.length / 1024).toFixed(0)} kB in ${(pkg.elapsed / 1000).toFixed(1)} s; package v2 (reader ≥2) with document v8; 2 original PNG 800×600 (sha256 = uploaded bytes, 3 references → 2 files); document.json equals the stored design; no URLs, tokens, file ids or company ids`)
  })

  let imported, importedPage
  await step('import the package from the dialog and open it in Studio', async () => {
    const before = Number((await stack.pool.query('SELECT count(*) n FROM file_asset')).rows[0].n)
    imported = await importFile(a, pkg.path, { name: 'Proyecto animado (importado)' })
    importedPage = a
    const doc = (await stored(imported.id)).document
    assert.equal(doc.schemaVersion, 8)
    assert.deepEqual(anonymous(doc), anonymous(original.document), 'pages, order, geometry, effects, keyframes, slides and groups identical (ids renamed)')
    const newIds = [...new Set(assetIds(doc))], oldIds = [...new Set(assetIds(original.document))]
    assert.equal(newIds.length, 2); assert.ok(newIds.every(id => !oldIds.includes(id)), 'fresh company files, not links to the source')
    const rows = (await stack.pool.query('SELECT id, entity_id, enabled, mime_type, size_bytes FROM file_asset WHERE id = ANY($1::uuid[])', [newIds])).rows
    assert.equal(rows.length, 2, 'no broken reference'); assert.ok(rows.every(r => r.entity_id === company.id && r.enabled && r.mime_type === 'image/png'))
    assert.equal(Number((await stack.pool.query('SELECT count(*) n FROM file_asset')).rows[0].n) - before, 2)
    // Same photo → same new file at both places; a different photo → the other file.
    const placements = documentPages(doc).flatMap(s => s.objects.filter(o => o.fileAssetId).map(o => o.fileAssetId))
    assert.equal(placements[0], placements[1]); assert.notEqual(placements[0], placements[2])
    ok(`imported in ${(imported.elapsed / 1000).toFixed(1)} s and opened in the editor: v8, 3 pages, every object, effect, keyframe, transition and group identical; 2 new private files of the company, both references resolve`)
  })

  await step('static pages and animated frames match the original', async () => {
    const before = await pngPages(a, 'importado'), { page: o } = await openEditor(users.owner, design.id), reference = await pngPages(o, 'original')
    const statics = await Promise.all([0, 1, 2].map(i => compare(reference[i], before[i])))
    const gifA = await exportImage(o, 'gif', join(OUT, 'original.gif')), gifB = await exportImage(a, 'gif', join(OUT, 'importado.gif'))
    const motion = await compare(gifA, gifB, { animated: true })
    await o.context().close()
    assert.ok(statics.every(s => s.max <= 2), JSON.stringify(statics)); assert.ok(motion.max <= 2, JSON.stringify(motion))
    ok(`3 static pages (PNG): max channel difference ${Math.max(...statics.map(s => s.max))}; animated sequence (GIF of the sceneAt frame loop, ${motion.frames} frames incl. effects, keyframes and transitions): max difference ${motion.max}, ${(motion.share * 100).toFixed(3)} % differing samples${sha(gifA) === sha(gifB) ? ', byte-identical GIF' : ''}`)
  })

  await step('the imported design stays editable and presents', async () => {
    const before = (await stored(imported.id)).document, at = doc => doc.additionalPages[0].objects[1]
    await importedPage.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página siguiente/ }).click()
    await ui.layersPanel(importedPage); await ui.layer(importedPage, 'Página cuadrada').getByRole('button', { name: /Página cuadrada/ }).first().click()
    await ui.selectionBar(importedPage).waitFor()
    await ui.formatPanel(importedPage)
    const field = importedPage.getByLabel('Posición X', { exact: true }); await field.fill(String(at(before).x + 50)); await field.press('Tab')
    await until(async () => at((await stored(imported.id)).document).x !== at(before).x, 'edit saved', 20000)
    const after = (await stored(imported.id)).document, [title, prior] = [at(after), at(before)]
    assert.ok(title.x === prior.x + 50 && title.y === prior.y)
    assert.deepEqual([title.emphasis, title.groupId], [prior.emphasis, prior.groupId], 'the edited object keeps its emphasis effect')
    const others = doc => anonymous({ ...doc, additionalPages: doc.additionalPages.map((s, i) => (i ? s : { ...s, objects: s.objects.filter((_, j) => j !== 1) })) })
    assert.deepEqual(others(after), others(before), 'nothing else changed')
    await importedPage.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página anterior/ }).click()
    await importedPage.getByRole('button', { name: 'Presentar' }).click(); await ui.player(importedPage).waitFor()
    assert.equal(await ui.counter(importedPage).innerText(), '1 / 3')
    await importedPage.keyboard.press('ArrowRight'); await importedPage.keyboard.press('ArrowRight')
    await until(async () => (await ui.counter(importedPage).innerText()) === '3 / 3', 'last slide')
    await importedPage.keyboard.press('Escape'); await ui.player(importedPage).waitFor({ state: 'detached' })
    ok('edited in Studio (a text moved 50 px with the Formato panel, its emphasis intact, nothing else changed) and presented 1 → 3 / 3')
  })

  await step('v7 design ↔ package v1, and legacy, newer and hostile packages', async () => {
    const v7 = await createDesign('Diseño estático v7', appendObject(blankDocument(1080, 1350), 'text'))
    const response = await api(`/studio/interchange/designs/${v7.id}/export`, { data: { acknowledgeImageCopies: true }, headers: { 'X-Runly-Studio-Protocol': '4' } })
    assert.equal(response.status, 200)
    const v1 = Buffer.from(await response.arrayBuffer()), path = join(OUT, 'estatico-v7.runlystudio'); await writeFile(path, v1)
    const m = JSON.parse((await readPackageZip(v1)).get('manifest.json'))
    assert.deepEqual([m.formatVersion, m.minReaderVersion, m.documentSchemaVersion], [1, 1, 7], 'v7 keeps package v1 (older readers open it)')
    const back = await importFile(a, path)
    assert.equal((await stored(back.id)).document.schemaVersion, 7, 'not upgraded on import')
    const legacy = await importFile(a, join(CORPUS, 'valid.runlystudio'))
    assert.equal((await stored(legacy.id)).document.schemaVersion, 7)
    assert.match(await importFile(a, join(CORPUS, 'newer-format.runlystudio'), { expectError: /versión más nueva/ }), /versión más nueva/)
    for (const name of ['zip-bomb', 'path-traversal', 'symlink-entry', 'motion-declared-v7', 'version-pair-mismatch', 'tampered-document']) {
      const form = new FormData(); form.set('file', new File([await readFile(join(CORPUS, `${name}.runlystudio`))], `${name}.runlystudio`, { type: 'application/vnd.runly.studio+zip' }))
      const data = await json(await api('/studio/interchange/inspect', { method: 'POST', body: form, headers: { 'X-Runly-Studio-Protocol': '4' } }))
      assert.ok(data.blockingErrors?.length, `${name} is blocked`)
    }
    ok('v7 design → package v1/doc 7 → reimported as v7; the committed v1 corpus package imports; a newer format asks to update Runly; zip bomb, path traversal, symlink, v8-declared-as-v7, version mismatch and tampered packages are blocked before anything is stored')
  })

  await step('missing resource, cancellation, permissions and company isolation', async () => {
    const entries = [...(await readPackageZip(pkg.bytes)).entries()].filter(([name]) => name !== manifest.resources[0].path)
    const broken = join(OUT, 'falta-un-recurso.runlystudio'); await writeFile(broken, await writePackageZip(entries))
    assert.match(await importFile(a, broken, { expectError: /Falta un archivo o su checksum no coincide/ }), /Falta un archivo/)
    const count = async sql => Number((await stack.pool.query(sql)).rows[0].n)
    const [designs, assets] = [await count('SELECT count(*) n FROM studio_design'), await count('SELECT count(*) n FROM file_asset')]
    await importFile(a, pkg.path, { cancel: true })
    await until(async () => (await count("SELECT count(*) n FROM studio_interchange_job WHERE state IN ('preparing','ready','cleanup')")) === 0, 'prepared import released', 20000)
    assert.deepEqual([await count('SELECT count(*) n FROM studio_design'), await count('SELECT count(*) n FROM file_asset')], [designs, assets], 'cancelling leaves no design and no file')
    const { context, page: v } = await openEditor(users.viewer, design.id)
    await v.goto(`${stack.urls.web}/app/m/runly.studio`); await v.getByRole('button', { name: 'Importar archivo' }).click()
    await v.getByText('Sin permiso para importar').waitFor()
    await context.close()
    const form = new FormData(); form.set('file', new File([pkg.bytes], 'p.runlystudio', { type: 'application/vnd.runly.studio+zip' })); form.set('options', JSON.stringify({ target: 'design', name: 'x' }))
    assert.equal((await api('/studio/interchange/imports', { user: users.viewer, method: 'POST', body: form, headers: { 'X-Runly-Studio-Protocol': '4' } })).status, 403, 'viewer cannot import')
    // A member of another company cannot export this company's design or reach its files.
    const [, other] = scenario.companies, outsider = scenario.users[3]
    const login = await (await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: outsider.email, password: outsider.password }) })).json()
    const foreign = headers => fetch(`${stack.urls.api}/studio/interchange/designs/${design.id}/export`, { method: 'POST', body: JSON.stringify({ acknowledgeImageCopies: true }), headers: { Authorization: `Bearer ${login.data.access_token}`, 'Content-Type': 'application/json', 'X-Runly-Studio-Protocol': '4', ...headers } })
    assert.ok([403, 404].includes((await foreign({ 'X-Runly-Company-Id': other.id })).status), 'other company: not found')
    assert.ok([401, 403, 404].includes((await foreign({ 'X-Runly-Company-Id': company.id })).status), 'not a member of this company')
    ok('a missing asset is named ("Falta un archivo o su checksum no coincide") and nothing is stored; cancelling a prepared import leaves no design or file; a viewer sees "Sin permiso para importar" and the API refuses (403); another company cannot export the design')
  })

  const hubFeed = process.argv.find(value => value.startsWith('--hub-feed='))?.slice(11)
  if (hubFeed) await step('Hub-validated v2 template: install in Studio, open, edit, present', async () => {
    const lab = JSON.parse(await readFile(join(hubFeed, 'lab.json'), 'utf8'))
    await stack.pool.query('INSERT INTO instance_config(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [RESOURCE_CONFIG_KEYS.url, pathToFileURL(resolve(hubFeed, 'index.json')).href])
    const prisma = new prismaPackage.PrismaClient({ adapter: new PrismaPg(stack.pool) })
    const files = createFilesService({ prisma, supabaseAdmin: scenario.admin }), designs = createStudioService({ prisma, filesService: files })
    const templates = createStudioTemplatesService({ prisma, filesService: files, supabaseAdmin: scenario.admin, designService: designs })
    const gate = createMarketplaceImportGate({ catalog: createResourceCatalogService({ prisma, trust: { resource: [lab.publicKey] } }) })
    const interchange = createStudioInterchange({ prisma, filesService: files, supabaseAdmin: scenario.admin, designs, templates, verifySource: gate.recheck })
    const owner = (await stack.pool.query('SELECT id, auth_user_id FROM user_profile WHERE id=$1', [users.owner.id])).rows[0]
    const permissionSet = new Set((await stack.pool.query('SELECT p.key FROM membership m JOIN role_permission rp ON rp.role_id=m.role_id JOIN permission p ON p.id=rp.permission_id WHERE m.company_id=$1 AND m.user_id=$2', [company.id, owner.id])).rows.map(r => r.key))
    const context = { authUserId: owner.auth_user_id, activeContext: { profileId: owner.id, companyId: company.id, isAdmin: false, permissionSet } }
    const started = Date.now()
    const download = await gate.download(lab.resource, 'studio_template', { companyId: company.id, actorId: owner.id })
    const prepared = await interchange.prepare(company.id, owner.id, download.bytes, 'application/vnd.runly.studio+zip', { target: 'design', name: 'Plantilla del Hub' }, context, undefined, download.source)
    const installed = await interchange.confirm(company.id, owner.id, prepared.id, { digest: prepared.digest, acceptWarnings: true }, context)
    await prisma.$disconnect()
    const doc = (await stored(installed.id)).document
    // Reference: the same Hub document created directly in Studio with the same photo.
    const form = new FormData(); form.set('file', new File([Buffer.from(lab.photo, 'base64')], 'foto-hub.png', { type: 'image/png' })); form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile')
    const photo = await json(await api('/files/upload', { method: 'POST', body: form }))
    const reference = await createDesign('Plantilla del Hub (referencia)', JSON.parse(JSON.stringify(lab.document).replaceAll(lab.document.objects[0].fileAssetId, photo.id)))
    assert.equal(doc.schemaVersion, 8)
    assert.deepEqual(anonymous(doc), anonymous((await stored(reference.id)).document), 'installed template = the document authored in the Hub')
    const { page: h } = await openEditor(users.owner, installed.id), { page: r } = await openEditor(users.owner, reference.id)
    const motion = await compare(await exportImage(r, 'gif', join(OUT, 'hub-referencia.gif')), await exportImage(h, 'gif', join(OUT, 'hub-instalada.gif')), { animated: true })
    await r.context().close()
    assert.ok(motion.max <= 2, JSON.stringify(motion))
    await ui.layersPanel(h); await ui.layer(h, 'Plantilla animada editada').getByRole('button', { name: /Plantilla animada editada/ }).first().click()
    await ui.selectionBar(h).waitFor(); await ui.formatPanel(h)
    const field = h.getByLabel('Posición X', { exact: true }); await field.fill(String(doc.objects[1].x + 40)); await field.press('Tab')
    await until(async () => (await stored(installed.id)).document.objects[1].x === doc.objects[1].x + 40, 'edit saved', 20000)
    assert.deepEqual((await stored(installed.id)).document.objects[1].enter, doc.objects[1].enter)
    await h.getByRole('button', { name: 'Presentar' }).click(); await ui.player(h).waitFor()
    await h.keyboard.press('ArrowRight'); await h.keyboard.press('ArrowRight')
    await until(async () => (await ui.counter(h).innerText()) === '3 / 3', 'last slide')
    await h.keyboard.press('Escape')
    ok(`Hub release ${lab.resource.resourceKey}@${lab.resource.version} (format 2, lab-signed) verified, downloaded and installed in ${((Date.now() - started) / 1000).toFixed(1)} s; equals the Hub document; ${motion.frames} GIF frames vs a direct copy: max difference ${motion.max}; edited (text moved 40 px, effects intact) and presented 1 → 3 / 3`)
  })

  await step('no uncaught page errors', async () => { assert.deepEqual(pageErrors, []); ok('no uncaught page errors') })
} catch (error) { report.fatal(error) } finally { await ctx.close(); report.finish() }
