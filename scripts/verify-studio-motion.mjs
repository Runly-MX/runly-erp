// Studio Next phase 2 verification (object animations) on a disposable stack.
// Usage: node scripts/verify-studio-motion.mjs --build-api-image | --api-image=<tag> [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { validateDocument } from '../apps/shared/studio/document.js'
import { sceneAt } from '../apps/shared/studio/motion.js'
import { apiImageFromArgs, createReport, startPresentStack, ui, until } from './fixtures/studio/present-stack.mjs'

const report = createReport(), { ok, step } = report
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: resolve('.artifacts/studio/motion') })
const { users, api, stored, uploadPhoto, createDesign, openEditor, shot, pageErrors } = ctx
const sleep = ms => new Promise(done => setTimeout(done, ms))
const near = (actual, expected, label, tolerance = 8) => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance), `${label}: ${actual} vs ${expected}`)
const RED = [239, 68, 68], WHITE = [255, 255, 255], BLUE = [59, 130, 246]
const W = 1920, H = 1080
const rect = { id: 'caja', type: 'rectangle', x: 200, y: 300, width: 600, height: 400, rotation: 0, fill: '#ef4444' }
const title = { id: 'titulo', type: 'text', x: 200, y: 100, width: 900, height: 100, rotation: 0, fill: '#111827', text: 'Título', fontSize: 80 }
const circles = [{ id: 'c1', type: 'ellipse', x: 1100, y: 300, width: 300, height: 300, rotation: 0, fill: '#3b82f6', groupId: 'g1' }, { id: 'c2', type: 'ellipse', x: 1450, y: 300, width: 300, height: 300, rotation: 0, fill: '#3b82f6', groupId: 'g1' }]
const page = (id, objects, slide = { duration: 4000 }) => ({ page: { id, width: W, height: H, background: '#ffffff', slide }, objects })
const fadeIn = { preset: 'fade', duration: 500, delay: 0, easing: 'linear' }

try {
  const photo = await uploadPhoto('#14b8a6')
  // Page 4: 100 objects (texts, shapes, lines, two private photos, a group) with 40 effects.
  const heavy = Array.from({ length: 100 }, (_, i) => {
    const x = 40 + (i % 10) * 185, y = 40 + Math.floor(i / 10) * 100, kind = i % 10
    const base = kind < 4 ? { type: 'rectangle', width: 160, height: 80 } : kind < 7 ? { type: 'ellipse', width: 80, height: 80 } : kind < 9 ? { type: 'text', width: 160, height: 40, text: `Texto ${i}`, fontSize: 28 } : { type: 'line', width: 160, height: 20, points: [[0, 0.5], [1, 0.5]], strokeWidth: 6 }
    const item = { id: `h${i}`, x, y, rotation: 0, fill: ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b'][i % 4], ...base, ...(i < 2 ? { type: 'image', fileAssetId: photo.id, width: 160, height: 80 } : {}), ...(i >= 10 && i < 14 ? { groupId: 'hg' } : {}) }
    if (i % 5 === 0) item.enter = { preset: ['fade', 'slide-up', 'zoom-in', 'rotate', 'pop'][i % 25 / 5], duration: 800, delay: (i % 7) * 150, easing: 'ease-out' }
    if (i % 5 === 1) item.emphasis = { preset: ['pulse', 'spin', 'shake', 'bounce'][i % 4], duration: 1200, delay: 500, easing: 'ease-in-out', repeat: 3 }
    return item
  })
  // Object IDs are unique in the whole document: page copies get a suffix.
  const copy = (objects, suffix, extra = {}) => objects.map(({ groupId, ...object }) => ({ ...object, id: `${object.id}-${suffix}`, ...extra }))
  const document = validateDocument({ schemaVersion: 8, unit: 'px', page: page('page-1', []).page, objects: [title, rect, ...circles],
    additionalPages: [page('page-2', copy([rect, circles[0], title], 'static')), page('page-3', copy([rect, circles[0], title], 'twin', { enter: fadeIn })), page('page-4', heavy, { duration: 6000 })] })
  const design = await createDesign('Animaciones E2E', document, [[users.editor, 'EDITOR']])
  assert.equal((await stored(design.id)).document.schemaVersion, 8)
  ok('design with a static page, its animated twin and a 100-object page (40 effects) created')
  const doc = async () => (await stored(design.id)).document
  const find = async id => (await doc()).objects.find(o => o.id === id)

  const { page: a } = await openEditor(users.owner, design.id)
  const selectLayer = async (target, name) => { await ui.layersPanel(target); await ui.layer(target, name).getByRole('button', { name: new RegExp(name) }).first().click() }
  const openAnimation = async target => { await target.getByRole('button', { name: 'Animar', exact: true }).click(); await target.getByRole('region', { name: 'Entrada' }).waitFor() }
  const choose = async (target, section, current, option) => {
    await target.getByRole('region', { name: section }).getByText(current, { exact: true }).first().click()
    await target.getByRole('option', { name: option, exact: true }).click()
  }

  await step('animate an element from the panel; undo, redo and reopen', async () => {
    await selectLayer(a, 'Rectángulo'); await openAnimation(a)
    await choose(a, 'Entrada', 'Ninguna', 'Deslizar hacia arriba')
    await until(async () => (await find('caja')).enter?.preset === 'slide-up', 'enter saved')
    const duration = a.locator('input[aria-label="Entrada: duración en segundos"]'); await duration.fill('1'); await duration.press('Enter')
    await until(async () => (await find('caja')).enter?.duration === 1000, 'duration saved')
    await choose(a, 'Entrada', 'Desacelerar', 'Lineal')
    await until(async () => (await find('caja')).enter?.easing === 'linear', 'easing saved')
    await choose(a, 'Salida', 'Ninguna', 'Desvanecer')
    await until(async () => (await find('caja')).exit?.preset === 'fade', 'exit saved')
    assert.deepEqual((await find('caja')).exit, { preset: 'fade', duration: 600, delay: 3200, easing: 'ease-in' })
    ok('enter (slide-up 1 s linear) and exit (fade at 3.2 s) saved from the Animación panel')
    await shot(a, 'animation-panel')
    await ui.undo(a).click(); await until(async () => !(await find('caja')).exit, 'undo exit')
    await ui.redo(a).click(); await until(async () => (await find('caja')).exit?.preset === 'fade', 'redo exit')
    ok('undo removes the exit and redo restores it on the server')
    const again = await openEditor(users.owner, design.id)
    await selectLayer(again.page, 'Rectángulo'); await openAnimation(again.page)
    await again.page.getByRole('region', { name: 'Entrada' }).getByText('Deslizar hacia arriba', { exact: true }).waitFor()
    await again.context.close()
    ok('reopening the design shows the saved animation')
    await ui.layersPanel(a); await ui.layer(a, 'Grupo 1').getByRole('button', { name: /Grupo 1/ }).first().click()
    await openAnimation(a)
    await a.getByText('Se aplica a los 2 elementos del grupo').waitFor()
    await choose(a, 'Entrada', 'Ninguna', 'Girar')
    await until(async () => { const d = await doc(); return ['c1', 'c2'].every(id => d.objects.find(o => o.id === id).enter?.preset === 'rotate') }, 'group enter')
    ok('a group gets the same effect on every member in one step')
  })

  await step('two users edit different animation properties of the same element', async () => {
    const b = await openEditor(users.editor, design.id)
    await selectLayer(a, 'Título'); await openAnimation(a)
    await selectLayer(b.page, 'Título'); await openAnimation(b.page)
    await Promise.all([choose(a, 'Énfasis', 'Ninguno', 'Pulso'), choose(b.page, 'Entrada', 'Ninguna', 'Desvanecer')])
    await until(async () => { const t = await find('titulo'); return t.emphasis?.preset === 'pulse' && t.enter?.preset === 'fade' }, 'both effects kept')
    await sleep(1500)
    const t = await find('titulo'); assert.equal(t.emphasis?.preset, 'pulse'); assert.equal(t.enter?.preset, 'fade')
    ok('emphasis by one user and enter by another on the same element both survive')
    const legacy = await api(`/studio/designs/${design.id}/changes`, { data: { clientId: 'legacy-client', batchId: 1, ops: [{ type: 'upsert', pageId: 'page-1', object: { ...title, id: 'titulo' } }] }, headers: { 'X-Runly-Studio-Protocol': '3' } })
    assert.equal(legacy.status, 426); assert.equal((await find('titulo')).enter?.preset, 'fade')
    ok('a protocol 3 client cannot overwrite the element without its v8 fields (426)')
    await b.context.close()
  })

  await step('preview: frames at known instants match sceneAt', async () => {
    await selectLayer(a, 'Rectángulo'); await openAnimation(a)
    await a.getByRole('button', { name: 'Previsualizar página' }).click()
    const dialog = a.getByRole('dialog', { name: 'Previsualizar animaciones' }); await dialog.waitFor()
    const canvas = dialog.locator('[data-motion-stage] canvas').first(); await canvas.waitFor()
    await sleep(600)
    const pixel = (x, y) => canvas.evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y])
    const slider = dialog.getByRole('slider', { name: 'Tiempo' })
    const seek = async ms => { await slider.focus(); await slider.press('Home'); for (let i = 0; i < ms / 50; i++) await slider.press('ArrowRight'); await sleep(150) }
    const expected = sceneAt(await doc(), 'page-1', 500).objects.find(o => o.id === 'caja')
    assert.equal(expected.y, 408, 'engine: slide-up halfway is 108 px below')
    await seek(0); near(await pixel(500, 320), WHITE, 't=0 hidden before the enter')
    await seek(500); near(await pixel(500, 320), WHITE, 't=500 top still below'); near(await pixel(500, 760), RED, 't=500 rect moved 108 px down')
    await shot(a, 'preview-500ms')
    await seek(1500); near(await pixel(500, 320), RED, 't=1500 at rest'); near(await pixel(500, 760), WHITE, 't=1500 back in place')
    await seek(3500); const fading = await pixel(500, 500); assert.ok(fading[1] > 68 && fading[1] < 255, `exit fade halfway ${fading}`)
    await seek(4000); near(await pixel(500, 500), WHITE, 'after the exit')
    ok('preview frames at 0, 500, 1500, 3500 and 4000 ms match the engine (hidden, moving, rest, fading, gone)')
    await dialog.getByRole('button', { name: 'Cerrar' }).first().click(); await dialog.waitFor({ state: 'detached' })
  })

  await step('presentation plays the animation live; pause freezes it', async () => {
    await a.getByRole('button', { name: 'Presentar' }).click(); await ui.player(a).waitFor()
    const stage = ui.player(a).locator('[data-motion-stage]'), canvas = stage.locator('canvas').first()
    await canvas.waitFor()
    const pixel = (x, y) => canvas.evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y])
    const seen = []
    const started = Date.now()
    while (Date.now() - started < 4600) { seen.push([Date.now() - started, (await pixel(500, 320))[1]]); await sleep(60) }
    const redAt = seen.find(([, g]) => g < 120)?.[0], whiteAgain = seen.find(([t, g]) => t > (redAt ?? 0) && g > 240)?.[0]
    assert.ok(seen[0][1] > 240, 'starts hidden'); assert.ok(redAt > 300 && redAt < 1600, `reaches rest at ${redAt} ms`); assert.ok(whiteAgain > 3000, `fades out at ${whiteAgain} ms`)
    ok(`live slide: hidden at start, at rest after ${redAt} ms, gone after ${whiteAgain} ms (slide 4 s)`)
    await a.keyboard.press('Home'); await sleep(700); await a.keyboard.press('k'); await a.keyboard.press('k')
    const frozen = await pixel(500, 760); await sleep(800)
    assert.deepEqual(await pixel(500, 760), frozen, 'paused frame does not change')
    ok('pause freezes the animation')
    const stats = await stage.evaluate(element => ({ ...element.dataset }))
    assert.ok(Number(stats.frames) > 30, `frames drawn ${stats.frames}`)
    await a.keyboard.press('Escape'); await ui.player(a).waitFor({ state: 'detached' })
  })

  await step('an animated page at rest matches the same static page pixel for pixel', async () => {
    await a.getByRole('button', { name: 'Presentar' }).click(); await ui.player(a).waitFor()
    await a.keyboard.press('ArrowRight')
    const img = ui.player(a).locator('img[alt="Diapositiva 2"]')
    await until(async () => (await ui.player(a).locator('img').count()) === 1 && await img.count() === 1, 'static page shown', 15000)
    const points = [[500, 500], [300, 400], [1250, 450], [1150, 350], [100, 900], [1700, 200], [960, 1000], [230, 150]]
    const fromImage = await img.evaluate((image, points) => { const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight; const x = c.getContext('2d'); x.drawImage(image, 0, 0); return points.map(([px, py]) => [...x.getImageData(Math.floor(px * c.width / 1920), Math.floor(py * c.height / 1080), 1, 1).data].slice(0, 3)) }, points)
    await a.keyboard.press('ArrowRight')
    const canvas = ui.player(a).locator('[data-motion-stage] canvas').first(); await canvas.waitFor(); await sleep(1500)
    const fromLive = await canvas.evaluate((c, points) => points.map(([x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3)), points)
    fromImage.forEach((value, i) => near(fromLive[i], value, `point ${points[i]}`, 10))
    near(fromLive[0], RED, 'rect'); near(fromLive[2], BLUE, 'circle')
    await shot(a, 'animated-twin-at-rest')
    ok('static page (image path) and its animated twin at rest render the same pixels at 8 sample points')
    await a.keyboard.press('Escape'); await ui.player(a).waitFor({ state: 'detached' })
  })

  await step('reduced motion: elements appear without moving', async () => {
    const calm = await openEditor(users.owner, design.id, { reducedMotion: 'reduce' })
    await calm.page.getByRole('button', { name: 'Presentar' }).click(); await ui.player(calm.page).waitFor()
    const canvas = ui.player(calm.page).locator('[data-motion-stage] canvas').first(); await canvas.waitFor()
    await until(async () => (await canvas.evaluate(c => [...c.getContext('2d').getImageData(500, 320, 1, 1).data]))[1] < 120, 'visible at rest', 3000)
    const lower = await canvas.evaluate(c => [...c.getContext('2d').getImageData(500, 760, 1, 1).data].slice(0, 3))
    near(lower, WHITE, 'never drawn 108 px lower')
    ok('with reduced motion the slide-up enter shows the element directly at its place')
    await calm.context.close()
  })

  await step('performance and memory on a 100-object page with 40 effects', async () => {
    const heap = () => a.evaluate(() => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? 0 })
    const canvases = () => a.evaluate(() => document.querySelectorAll('canvas').length)
    const before = await heap(), canvasesBefore = await canvases()
    await a.getByRole('button', { name: 'Presentar' }).click(); await ui.player(a).waitFor()
    await a.keyboard.press('End')
    const stage = ui.player(a).locator('[data-motion-stage]')
    await until(async () => (await stage.locator('canvas').count()) > 0 && Number((await stage.evaluate(e => e.dataset.frames)) ?? 0) > 0, 'heavy page live', 20000)
    const fps = await a.evaluate(() => new Promise(done => { let frames = 0, long = 0, last = performance.now(); const start = last
      const tick = now => { frames++; if (now - last > 34) long++; last = now; if (now - start < 3000) requestAnimationFrame(tick); else done({ fps: frames / ((now - start) / 1000), long }) }
      requestAnimationFrame(tick) }))
    const stats = await stage.evaluate(element => ({ frames: element.dataset.frames, avg: element.dataset.frameAvg, max: element.dataset.frameMax }))
    await shot(a, 'heavy-page')
    await a.keyboard.press('Escape'); await ui.player(a).waitFor({ state: 'detached' })
    for (let i = 0; i < 4; i++) {
      await a.getByRole('button', { name: 'Presentar' }).click(); await ui.player(a).waitFor()
      await a.keyboard.press('End'); await sleep(1500); await a.keyboard.press('Escape'); await ui.player(a).waitFor({ state: 'detached' })
    }
    await sleep(500)
    const after = await heap(), canvasesAfter = await canvases()
    assert.equal(canvasesAfter, canvasesBefore, 'every player canvas is released')
    const growth = (after - before) / 2 ** 20
    assert.ok(fps.fps > 20, `fps ${fps.fps}`); assert.ok(growth < 40, `heap grew ${growth.toFixed(1)} MiB`)
    ok(`heavy page: ${fps.fps.toFixed(1)} rAF/s over 3 s (${fps.long} frames > 34 ms); renderFrame avg ${stats.avg} ms, max ${stats.max} ms over ${stats.frames} frames; heap ${growth >= 0 ? '+' : ''}${growth.toFixed(1)} MiB after 5 open/close cycles; canvases released`)
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`)
  ok('no uncaught page errors')
} catch (error) {
  report.fatal(error)
} finally {
  await ctx.close()
  report.finish()
}
