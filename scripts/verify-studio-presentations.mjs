// Studio Next phase 1 verification (presentations, v8 protocol, collaborative undo)
// on a disposable stack. Usage:
//   node scripts/verify-studio-presentations.mjs --build-api-image   (API image from HEAD)
//   node scripts/verify-studio-presentations.mjs --api-image=<local tag> [--keep]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { appendObject, blankDocument, validateDocument } from '../apps/shared/studio/document.js'
import { apiImageFromArgs, createReport, startPresentStack, ui, until } from './fixtures/studio/present-stack.mjs'

const report = createReport(), { ok, step } = report
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: resolve('.artifacts/studio/presentations') })
const { users, api, stored, uploadPhoto, createDesign, openEditor, shot, pageErrors } = ctx
const sleep = ms => new Promise(done => setTimeout(done, ms))
const v4 = { 'X-Runly-Studio-Protocol': '4' }
const near = (actual, expected, label) => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= 6), `${label}: ${actual} vs ${expected}`)
const scene = (id, background, objects = [], extra = {}) => ({ page: { id, width: 1920, height: 1080, background, ...extra }, objects })

try {
  const migrated = await ctx.stack.pool.query("SELECT 1 FROM _prisma_migrations WHERE migration_name='20270107000000_studio_v8_protocol' AND finished_at IS NOT NULL")
  assert.equal(migrated.rowCount, 1); ok('disposable database migrated, including 20270107000000_studio_v8_protocol')
  const photo = await uploadPhoto('#14b8a6')
  let doc = appendObject(blankDocument(1920, 1080), 'text', { text: 'Primera diapositiva', fontSize: 96, width: 1200, height: 120, fill: '#0f172a' })
  doc = validateDocument({ ...doc, additionalPages: [
    scene('page-2', '#1e293b', [{ id: 'photo-1', type: 'image', fileAssetId: photo.id, x: 560, y: 240, width: 800, height: 600, rotation: 0, fill: '#000000' }]),
    { page: { id: 'page-3', width: 1080, height: 1080, background: '#fde68a' }, objects: [{ id: 'shape-1', type: 'ellipse', x: 290, y: 290, width: 500, height: 500, rotation: 0, fill: '#7c3aed' }] },
  ] })
  const design = await createDesign('Presentación E2E', doc, [[users.viewer, 'VIEWER'], [users.editor, 'EDITOR']])
  assert.equal((await stored(design.id)).document.schemaVersion, 7)
  ok('3-page design (text, private photo, square page) created as v7 and shared')

  await step('protocol 3/4 contract and the v8 package on the real API', async () => {
    const legacy = await createDesign('Cliente antiguo', blankDocument())
    const change = (protocol, batchId, set) => api(`/studio/designs/${legacy.id}/changes`, { data: { clientId: 'legacy-client', batchId, ops: [{ type: 'patchPage', pageId: 'page-1', set }] }, headers: { 'X-Runly-Studio-Protocol': protocol } })
    assert.equal((await change('3', 1, { background: '#eeeeee' })).status, 200)
    assert.equal((await change('3', 2, { slide: { duration: 2000 } })).status, 426)
    assert.equal((await stored(legacy.id)).document.schemaVersion, 7)
    assert.equal((await change('4', 3, { slide: { duration: 2000 } })).status, 200)
    assert.equal((await stored(legacy.id)).document.schemaVersion, 8)
    assert.equal((await change('3', 4, { background: '#ffffff' })).status, 426)
    assert.equal((await change('2', 5, { background: '#ffffff' })).status, 426)
    const current = await stored(legacy.id)
    const put = await api(`/studio/designs/${legacy.id}`, { method: 'PUT', data: { name: 'x', revision: current.revision, document: { ...current.document, schemaVersion: 7, page: { ...current.document.page, slide: undefined } } }, headers: v4 })
    assert.equal(put.status, 409, 'downgrade by a protocol 4 PUT is denied')
    assert.equal((await stored(legacy.id)).document.page.slide.duration, 2000)
    ok('protocol 3 edits v7 (200), cannot upgrade or touch v8 (426); protocol 2 refused; a v8→v7 PUT is denied (409)')
    const exportPackage = data => api(`/studio/interchange/designs/${legacy.id}/export`, { data, headers: v4 })
    // Package v2 (phase 6) keeps the v8 document: no motion-loss acknowledgement; older clients may still send it.
    const v2 = await exportPackage({ acknowledgeImageCopies: true })
    assert.equal(v2.status, 200)
    assert.match(Buffer.from(await v2.arrayBuffer()).toString('latin1'), /"formatVersion":2,"minReaderVersion":2,"documentSchemaVersion":8/)
    assert.equal((await exportPackage({ acknowledgeImageCopies: true, acknowledgeMotionLoss: true })).status, 200)
    const legacyClient = await api(`/studio/interchange/designs/${legacy.id}/export`, { data: { acknowledgeImageCopies: true, acknowledgeMotionLoss: true }, headers: { 'X-Runly-Studio-Protocol': '3' } })
    assert.equal(legacyClient.status, 200, 'package routes accept protocol 3 clients')
    ok('.runlystudio of a v8 design is package v2 with document v8 (no loss to acknowledge); package routes accept protocol 3 and 4')
  })

  const { page } = await openEditor(users.owner, design.id), second = await openEditor(users.editor, design.id)
  const pixel = async (target, fx, fy) => {
    const expected = `Diapositiva ${(await ui.counter(target).innerText()).split(' ')[0]}`
    await until(async () => (await ui.player(target).locator('img').count()) === 1 && (await ui.player(target).locator('img').getAttribute('alt')) === expected, `${expected} shown alone`, 15000)
    return ui.player(target).locator('img').evaluate((img, [fx, fy]) => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [...x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data].slice(0, 3) }, [fx, fy])
  }

  await step('slide settings persist, sync live and undo in one step', async () => {
    await ui.formatPanel(page)
    const duration = ui.durationInput(page); await duration.waitFor()
    await duration.fill('2'); await duration.press('Enter')
    await until(async () => (await stored(design.id)).document.page.slide?.duration === 2000, 'duration saved')
    assert.equal((await stored(design.id)).document.schemaVersion, 8)
    await ui.slideSection(page).getByText('Ninguna', { exact: true }).click()
    await page.getByRole('option', { name: 'Fundido' }).or(page.getByText('Fundido', { exact: true })).first().click()
    await until(async () => (await stored(design.id)).document.page.slide?.transition?.type === 'fade', 'transition saved')
    await ui.slideSection(page).getByRole('button', { name: 'Aplicar a todas las páginas' }).click()
    await until(async () => (await stored(design.id)).document.additionalPages.every(s => s.page.slide?.transition?.type === 'fade'), 'apply to all')
    await ui.formatPanel(second.page)
    await until(async () => (await ui.durationInput(second.page).inputValue()) === '2', 'second session sees 2 s')
    ok('duration and fade saved, applied to all pages, received live by an editor collaborator; design is v8')
    await ui.undo(page).click()
    await until(async () => (await stored(design.id)).document.additionalPages.every(s => s.page.slide?.transition === undefined), 'undo apply-all')
    await ui.redo(page).click()
    await until(async () => (await stored(design.id)).document.additionalPages.every(s => s.page.slide?.transition?.type === 'fade'), 'redo apply-all')
    ok('apply-to-all (inactive pages) is one undo step that reaches the server; redo restores it')
    await shot(page, 'slide-settings-desktop')
  })

  await step('collaborative undo: selective, conflicts and reconnection', async () => {
    const collab = await createDesign('Deshacer colaborativo', validateDocument({ ...appendObject(appendObject(blankDocument(1920, 1080), 'text', { text: 'Alfa', fontSize: 80, width: 600, height: 100, fill: '#111827' }), 'text', { text: 'Beta', x: 80, y: 400, fontSize: 80, width: 600, height: 100, fill: '#111827' }),
      additionalPages: [scene('page-2', '#ffffff'), scene('page-3', '#ffffff')] }), [[users.editor, 'EDITOR']])
    const a = await openEditor(users.owner, collab.id), b = await openEditor(users.editor, collab.id)
    const doc = async () => (await stored(collab.id)).document
    const hide = async (session, text) => { await ui.layersPanel(session.page); const row = ui.layer(session.page, text); await row.hover(); await row.getByRole('button', { name: 'Ocultar' }).click() }
    await hide(a, 'Alfa'); await until(async () => (await doc()).objects.find(o => o.text === 'Alfa').hidden, 'A hides Alfa')
    await hide(b, 'Beta'); await until(async () => (await doc()).objects.find(o => o.text === 'Beta').hidden, 'B hides Beta')
    await ui.undo(a.page).click()
    await until(async () => { const d = await doc(); return !d.objects.find(o => o.text === 'Alfa').hidden && d.objects.find(o => o.text === 'Beta').hidden }, 'A undo keeps B change')
    ok('two users: undo by A reverts only A\'s object change; B\'s change survives on the server')
    await ui.formatPanel(a.page); await ui.formatPanel(b.page)
    const setDuration = async (session, seconds) => { const input = ui.durationInput(session.page); await input.fill(String(seconds)); await input.press('Enter') }
    await setDuration(a, 3); await until(async () => (await doc()).page.slide?.duration === 3000, 'A 3 s')
    await until(async () => (await ui.durationInput(b.page).inputValue()) === '3', 'B sees 3 s')
    await setDuration(b, 4); await until(async () => (await doc()).page.slide?.duration === 4000, 'B 4 s wins')
    await until(async () => (await ui.durationInput(a.page).inputValue()) === '4', 'A sees 4 s')
    await ui.undo(a.page).click()
    await sleep(3000)
    assert.equal((await doc()).page.slide?.duration, 4000, 'A undo does not revert a value B changed afterwards')
    ok('same property: last writer wins (4 s) and A\'s undo never overwrites B\'s later value')
    await b.context.setOffline(true)
    const nextPage = b.page.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página siguiente/ })
    await nextPage.click(); await nextPage.click(); await sleep(500)
    await ui.formatPanel(b.page)
    await setDuration(b, 6); await sleep(1200)
    assert.equal((await doc()).additionalPages[1].page.slide, undefined, 'nothing reaches the server while offline')
    const queued = await b.page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('runly:studio:queue:')).map(k => JSON.parse(sessionStorage.getItem(k))))
    assert.ok(queued.some(q => [...(q.batch?.ops ?? []), ...q.outbox].some(op => op.pageId === 'page-3' && op.set?.slide?.duration === 6000)), 'the offline edit is queued locally')
    await ui.undo(b.page).click(); await sleep(800)
    assert.equal(await ui.durationInput(b.page).inputValue(), '5', 'offline undo reverts the offline change')
    await setDuration(b, 7)
    await b.context.setOffline(false)
    await until(async () => (await doc()).additionalPages[1].page.slide?.duration === 7000, 'offline queue delivered after reconnecting', 30000)
    assert.equal((await doc()).page.slide?.duration, 4000)
    ok('offline edits and undo are queued and delivered on reconnection without touching other pages')
    await a.context.close(); await b.context.close()
  })

  await step('present: keyboard, autoplay, pause, pixels, exit and focus', async () => {
    await ui.player(page).waitFor({ state: 'detached', timeout: 1000 }).catch(() => {})
    await page.getByRole('button', { name: 'Presentar' }).click()
    await ui.player(page).waitFor()
    near(await pixel(page, 0.9, 0.9), [255, 255, 255], 'page 1 background')
    assert.equal(await ui.counter(page).innerText(), '1 / 3')
    ok(`player opened on page 1 (native fullscreen: ${await page.evaluate(() => Boolean(document.fullscreenElement)) ? 'yes' : 'no, full-window fallback'})`)
    await page.keyboard.press('ArrowRight')
    near(await pixel(page, 0.02, 0.02), [30, 41, 59], 'page 2 background'); near(await pixel(page, 0.5, 0.5), [20, 184, 166], 'page 2 private photo')
    await shot(page, 'present-page2-photo')
    await page.keyboard.press('End'); await until(async () => (await ui.counter(page).innerText()) === '3 / 3', 'end')
    near(await pixel(page, 0.05, 0.05), [253, 230, 138], 'page 3 background'); near(await pixel(page, 0.5, 0.5), [124, 58, 237], 'page 3 circle')
    await shot(page, 'present-page3-square')
    ok('slide pixels match each page (white page 1, dark page 2 with the private photo, square page 3)')
    await page.keyboard.press('ArrowRight'); assert.equal(await ui.counter(page).innerText(), '3 / 3')
    await page.keyboard.press('Home'); await until(async () => (await ui.counter(page).innerText()) === '1 / 3', 'home')
    await page.keyboard.press('ArrowLeft'); assert.equal(await ui.counter(page).innerText(), '1 / 3')
    ok('arrows, Home and End navigate and clamp without loop')
    await page.keyboard.press('k')
    const started = Date.now()
    await until(async () => (await ui.counter(page).innerText()) === '2 / 3', 'autoplay advance', 8000)
    const elapsed = Date.now() - started
    assert.ok(elapsed >= 1700 && elapsed < 4500, `advanced after ${elapsed} ms`)
    ok(`autoplay advanced after ${elapsed} ms for a 2 s slide`)
    await page.keyboard.press('k'); await sleep(2600)
    assert.equal(await ui.counter(page).innerText(), '2 / 3'); ok('pause stops autoplay')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Escape')
    await ui.player(page).waitFor({ state: 'detached' })
    assert.equal((await stored(design.id)).document.page.slide?.duration, 2000, 'Ctrl+Z did not reach the editor')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Presentar')
    assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false)
    ok('Esc closes the player, leaves fullscreen and returns focus to Presentar; Ctrl+Z did not reach the editor')
  })

  await step('selection is restored after presenting, except removed objects', async () => {
    const selection = await createDesign('Selección', appendObject(appendObject(blankDocument(1920, 1080), 'text', { text: 'Alfa', fontSize: 80, width: 600, height: 100, fill: '#111827' }), 'text', { text: 'Beta', x: 80, y: 400, fontSize: 80, width: 600, height: 100, fill: '#111827' }))
    const s = await openEditor(users.owner, selection.id)
    await ui.layersPanel(s.page)
    await ui.layer(s.page, 'Alfa').getByRole('button', { name: /Alfa/ }).first().click()
    await ui.selectionBar(s.page).waitFor()
    await s.page.getByRole('button', { name: 'Presentar' }).click(); await ui.player(s.page).waitFor()
    await s.page.keyboard.press('Escape'); await ui.player(s.page).waitFor({ state: 'detached' })
    await ui.selectionBar(s.page).waitFor({ timeout: 5000 })
    ok('the selected object is selected again after leaving the presentation')
    await ui.layer(s.page, 'Beta').getByRole('button', { name: /Beta/ }).first().click()
    await s.page.getByRole('button', { name: 'Presentar' }).click(); await ui.player(s.page).waitFor()
    const beta = (await stored(selection.id)).document.objects.find(o => o.text === 'Beta')
    assert.equal((await api(`/studio/designs/${selection.id}/changes`, { data: { clientId: 'remover-client', batchId: 1, ops: [{ type: 'remove', pageId: 'page-1', id: beta.id }] }, headers: v4 })).status, 200)
    await sleep(1500)
    await s.page.keyboard.press('Escape'); await ui.player(s.page).waitFor({ state: 'detached' }); await sleep(500)
    assert.equal(await ui.selectionBar(s.page).count(), 0)
    ok('an object removed by a collaborator during the presentation is not reselected')
    await s.context.close()
  })

  await step('slide and zoom transitions animate on screen', async () => {
    const colors = ['#ef4444', '#22c55e', '#3b82f6']
    const transitions = await createDesign('Transiciones', validateDocument({ ...blankDocument(1920, 1080), page: { id: 'page-1', width: 1920, height: 1080, background: colors[0] },
      additionalPages: [scene('page-2', colors[1], [], { slide: { transition: { type: 'slide-left', duration: 1500, easing: 'linear' } } }), scene('page-3', colors[2], [], { slide: { transition: { type: 'zoom', duration: 1500, easing: 'linear' } } })] }))
    const t = await openEditor(users.owner, transitions.id)
    await t.page.getByRole('button', { name: 'Presentar' }).click(); await ui.player(t.page).waitFor()
    await until(async () => (await ui.player(t.page).locator('img').count()) === 1, 'first slide')
    const sample = async () => ui.player(t.page).locator('img').evaluateAll(images => images.map(img => ({ alt: img.alt, transform: img.style.transform, opacity: Number(img.style.opacity) })))
    const series = async () => { const out = []; for (let i = 0; i < 12; i++) { out.push(await sample()); await sleep(90) } return out }
    await t.page.keyboard.press('ArrowRight')
    await until(async () => (await ui.player(t.page).locator('img').count()) === 2, 'slide transition starts', 5000)
    await sleep(500); await ctx.shot(t.page, 'transition-slide-mid')
    const slides = (await series()).map(layers => layers.find(l => l.alt === 'Diapositiva 2')).filter(Boolean).map(l => Number(/translate\((-?[\d.]+)%/.exec(l.transform)?.[1]))
    assert.ok(slides.length >= 4 && slides[0] > 0 && slides[0] < 100, `incoming offsets ${slides}`)
    assert.ok(slides.every((v, i) => i === 0 || v <= slides[i - 1]), `offsets decrease ${slides}`)
    ok(`slide-left: incoming slide moves in from the right (${slides.slice(0, 4).map(Math.round).join('% → ')}%)`)
    await until(async () => (await ui.player(t.page).locator('img').count()) === 1, 'slide transition ends', 5000)
    await t.page.keyboard.press('ArrowRight')
    await until(async () => (await ui.player(t.page).locator('img').count()) === 2, 'zoom transition starts', 5000)
    await sleep(500); await ctx.shot(t.page, 'transition-zoom-mid')
    const zooms = (await series()).map(layers => layers.find(l => l.alt === 'Diapositiva 3')).filter(Boolean).map(l => ({ scale: Number(/scale\(([\d.]+)\)/.exec(l.transform)?.[1]), opacity: l.opacity }))
    assert.ok(zooms.length >= 4 && zooms[0].scale > 0.85 && zooms[0].scale < 1 && zooms[0].opacity > 0 && zooms[0].opacity < 1, `zoom ${JSON.stringify(zooms[0])}`)
    assert.ok(zooms.every((z, i) => i === 0 || (z.scale >= zooms[i - 1].scale && z.opacity >= zooms[i - 1].opacity)), 'scale and opacity grow')
    ok(`zoom: incoming slide grows and fades in (scale ${zooms[0].scale.toFixed(3)} → ${zooms.at(-1).scale.toFixed(3)})`)
    await t.page.keyboard.press('Escape'); await t.context.close()
  })

  await step('mouse halves, F5 and visible controls', async () => {
    await page.keyboard.press('F5')
    await ui.player(page).waitFor(); await until(async () => (await ui.player(page).locator('img').count()) === 1, 'rendered')
    const box = await ui.player(page).boundingBox()
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2)
    await until(async () => (await ui.counter(page).innerText()) === '2 / 3', 'click right')
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2)
    await until(async () => (await ui.counter(page).innerText()) === '1 / 3', 'click left')
    await ui.player(page).getByRole('button', { name: 'Diapositiva siguiente' }).click()
    await until(async () => (await ui.counter(page).innerText()) === '2 / 3', 'next button')
    await ui.player(page).getByRole('button', { name: 'Salir de la presentación' }).click()
    await ui.player(page).waitFor({ state: 'detached' })
    ok('F5 opens the player; click halves and buttons navigate; Salir closes')
  })

  await step('read-only viewer presents; slide settings disabled', async () => {
    const { page: viewer, context } = await openEditor(users.viewer, design.id)
    await ui.formatPanel(viewer)
    assert.equal(await ui.durationInput(viewer).isDisabled(), true)
    await viewer.getByRole('button', { name: 'Presentar' }).click(); await ui.player(viewer).waitFor()
    await viewer.keyboard.press('ArrowRight'); await until(async () => (await ui.counter(viewer).innerText()) === '2 / 3', 'viewer next')
    near(await pixel(viewer, 0.5, 0.5), [20, 184, 166], 'viewer sees the private photo')
    await shot(viewer, 'present-viewer')
    await viewer.keyboard.press('Escape'); await context.close()
    ok('VIEWER collaborator presents (private photo authorized) and cannot edit slide settings')
  })

  await step('phone: menu entry, swipe and tap', async () => {
    const { page: phone, context } = await openEditor(users.owner, design.id, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await phone.getByRole('button', { name: 'Más opciones' }).click()
    await phone.getByRole('menuitem', { name: 'Presentar' }).click()
    await ui.player(phone).waitFor(); await until(async () => (await ui.player(phone).locator('img').count()) === 1, 'phone slide')
    const box = await ui.player(phone).boundingBox(), y = box.y + box.height / 2, stage = ui.player(phone).locator('div.touch-none')
    const swipe = async (from, to) => {
      await stage.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: from, clientY: y, button: 0 })
      await stage.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, clientX: to, clientY: y, button: 0 })
    }
    await swipe(box.x + 300, box.x + 80); await until(async () => (await ui.counter(phone).innerText()) === '2 / 3', 'swipe left')
    await swipe(box.x + 80, box.x + 300); await until(async () => (await ui.counter(phone).innerText()) === '1 / 3', 'swipe right')
    await swipe(box.x + 200, box.x + 205); assert.equal(await ui.counter(phone).innerText(), '1 / 3')
    await shot(phone, 'present-phone')
    await ui.player(phone).getByRole('button', { name: 'Salir de la presentación' }).click()
    await context.close()
    ok('phone: Presentar in the menu, swipe navigates both ways, tap does not navigate')
  })

  await step('reduced motion: fade becomes a cut', async () => {
    const { page: calm, context } = await openEditor(users.owner, design.id, { reducedMotion: 'reduce' })
    await calm.getByRole('button', { name: 'Presentar' }).click(); await ui.player(calm).waitFor()
    await until(async () => (await ui.player(calm).locator('img').count()) === 1, 'rendered')
    await calm.keyboard.press('ArrowRight'); await until(async () => (await ui.counter(calm).innerText()) === '2 / 3', 'next')
    const layers = []
    for (let i = 0; i < 20; i++) { layers.push(await ui.player(calm).locator('img').count()); await sleep(30) }
    assert.ok(layers.every(count => count === 1), `layers ${layers}`)
    await context.close()
    ok('reduced motion shows a single layer (cut)')
  })

  await step('static exports unchanged and the package dialog no longer asks for a motion loss', async () => {
    await page.getByRole('button', { name: 'Descargar' }).click()
    const dialog = page.getByRole('dialog').last()
    await dialog.getByText('Proyecto Studio').click()
    await dialog.getByText(/^Entiendo que el paquete incluye/).waitFor()
    assert.equal(await dialog.getByText('no conserva las duraciones').count(), 0)
    await dialog.getByRole('radio', { name: /^PNG/ }).click()
    const download = page.waitForEvent('download', { timeout: 30000 })
    await dialog.getByRole('button', { name: 'Descargar', exact: true }).click()
    await page.getByRole('button', { name: 'Exportar PNG' }).click()
    assert.match((await download).suggestedFilename(), /\.png$/)
    ok('package export asks only for the image-copies acknowledgement (no motion loss); PNG export still downloads')
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`)
  ok('no uncaught page errors')
} catch (error) {
  report.fatal(error)
} finally {
  await ctx.close()
  report.finish()
}
