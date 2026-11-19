// Studio Next phase 3 verification (timeline, keyframes, visual effect editing) on a
// disposable stack. Usage: node scripts/verify-studio-timeline.mjs --build-api-image | --api-image=<tag> [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { validateDocument } from '../apps/shared/studio/document.js'
import { sceneAt } from '../apps/shared/studio/motion.js'
import { apiImageFromArgs, createReport, startPresentStack, ui, until } from './fixtures/studio/present-stack.mjs'

const report = createReport(), { ok, step } = report
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: resolve('.artifacts/studio/timeline') })
const { users, stored, createDesign, openEditor, shot, pageErrors } = ctx
const sleep = ms => new Promise(done => setTimeout(done, ms))
const near = (actual, expected, label, tolerance = 8) => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance), `${label}: ${actual} vs ${expected}`)
const RED = [239, 68, 68], WHITE = [255, 255, 255]
const W = 1920, H = 1080

try {
  const heavy = Array.from({ length: 100 }, (_, i) => {
    const kind = i % 4, item = { id: `h${i}`, x: 40 + (i % 10) * 185, y: 40 + Math.floor(i / 10) * 100, rotation: 0, fill: ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b'][i % 4],
      ...(kind === 3 ? { type: 'text', width: 160, height: 40, text: `Texto ${i}`, fontSize: 28 } : { type: kind === 2 ? 'ellipse' : 'rectangle', width: 160, height: 80 }) }
    if (i % 4 === 0) item.enter = { preset: 'fade', duration: 600, delay: (i % 9) * 120, easing: 'ease-out' }
    if (i % 4 === 1) item.keyframes = [{ at: 0, x: item.x, rotation: 0 }, { at: 3000, x: item.x + 60, rotation: 45, easing: 'ease-in-out' }]
    return item
  })
  const document = validateDocument({ schemaVersion: 8, unit: 'px', page: { id: 'page-1', width: W, height: H, background: '#ffffff', slide: { duration: 4000 } },
    objects: [
      { id: 'caja', type: 'rectangle', x: 200, y: 300, width: 600, height: 400, rotation: 0, fill: '#ef4444' },
      { id: 'c1', type: 'ellipse', x: 1100, y: 300, width: 300, height: 300, rotation: 0, fill: '#3b82f6', groupId: 'g1' },
      { id: 'c2', type: 'ellipse', x: 1450, y: 300, width: 300, height: 300, rotation: 0, fill: '#3b82f6', groupId: 'g1' },
      { id: 'titulo', type: 'text', x: 200, y: 100, width: 900, height: 100, rotation: 0, fill: '#111827', text: 'Título', fontSize: 80, enter: { preset: 'fade', duration: 600, delay: 0, easing: 'ease-out' } },
    ],
    additionalPages: [{ page: { id: 'page-2', width: W, height: H, background: '#ffffff', slide: { duration: 6000 } }, objects: heavy }] })
  const design = await createDesign('Línea de tiempo E2E', document, [[users.editor, 'EDITOR'], [users.viewer, 'VIEWER']])
  const doc = async () => (await stored(design.id)).document
  const object = async id => (await doc()).objects.find(o => o.id === id)
  ok('design created: rectangle, a group of two circles, a title with a fade and a 100-object page')

  const { page: a } = await openEditor(users.owner, design.id)
  const timeline = target => target.getByRole('region', { name: 'Línea de tiempo' })
  const readout = target => timeline(target).locator('output')
  const openTimeline = async target => {
    await target.getByRole('button', { name: 'Línea de tiempo', exact: true }).click(); await timeline(target).waitFor()
    const handle = timeline(target).getByRole('separator', { name: 'Alto de la línea de tiempo' })
    if (await handle.count()) { await handle.focus(); for (let i = 0; i < 4; i++) await target.keyboard.press('ArrowUp') }
  }
  const seek = async (target, ms) => { await timeline(target).focus(); await target.keyboard.press('Home'); for (let i = 0; i < Math.floor(ms / 1000); i++) await target.keyboard.press('Shift+ArrowRight'); for (let i = 0; i < (ms % 1000) / 100; i++) await target.keyboard.press('ArrowRight') }
  const diamond = (target, id, at) => timeline(target).locator(`[data-track="${id}"] [data-keyframe="${at}"]`)
  const overlay = target => target.locator('[data-animated-canvas]')
  const overlayPixel = (target, x, y) => overlay(target).locator('[data-motion-stage] canvas').first().evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y])
  async function pageToScreen(target, x, y) { const box = await overlay(target).boundingBox(); return [box.x + x * box.width / W, box.y + y * box.height / H] }
  async function dragBy(target, locator, dx, dy = 0, steps = 8) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
    await target.mouse.move(x, y); await target.mouse.down(); await target.mouse.move(x + dx, y + dy, { steps }); await target.mouse.up()
  }
  async function pxPerSecond(target) {
    const ticks = await timeline(target).getByText(/^\d+(,\d+)? s$/).evaluateAll(spans => spans.slice(0, 3).map(span => ({ text: span.textContent, left: span.parentElement.getBoundingClientRect().left })))
    const [first, second] = ticks, seconds = text => Number(text.replace(' s', '').replace(',', '.'))
    return (second.left - first.left) / (seconds(second.text) - seconds(first.text))
  }

  await step('timeline opens with tracks, ruler and selection synced with canvas and layers', async () => {
    await openTimeline(a)
    for (const id of ['caja', 'c1', 'c2', 'titulo']) await timeline(a).locator(`[data-track="${id}"]`).waitFor()
    await timeline(a).getByRole('button', { name: /Grupo 1/ }).waitFor()
    await timeline(a).locator('[data-track="titulo"] [data-effect="enter"]').waitFor()
    assert.equal(await readout(a).innerText(), '00:00,000 / 00:04,000')
    ok('tracks for every element (group header included), the title\'s enter segment and the ruler/readout')
    await timeline(a).locator('[data-track="caja"] > button').first().click()
    await ui.selectionBar(a).waitFor()
    assert.equal(await timeline(a).locator('[data-track="caja"] > button').first().getAttribute('aria-pressed'), 'true')
    await ui.layersPanel(a); await ui.layer(a, 'Título').getByRole('button', { name: /Título/ }).first().click()
    await until(async () => (await timeline(a).locator('[data-track="titulo"] > button').first().getAttribute('aria-pressed')) === 'true', 'layers → timeline')
    ok('selection syncs track → canvas selection bar and Capas → track')
    await shot(a, 'timeline-open')
  })

  await step('playhead: keyboard seek switches to Animación without writing', async () => {
    const revision = (await stored(design.id)).revision
    await seek(a, 1500)
    assert.equal(await readout(a).innerText(), '00:01,500 / 00:04,000')
    await a.getByText('Modo Animación', { exact: true }).waitFor()
    await timeline(a).getByText(/^Arrastra un elemento en el lienzo/).waitFor()
    assert.equal((await stored(design.id)).revision, revision, 'moving the playhead never writes')
    ok('seeking to 1,5 s shows the animated canvas and badge; no write, no history')
  })

  await step('drag in Animación at 1,5 s creates a keyframe; base geometry untouched; undo/redo', async () => {
    const [x, y] = await pageToScreen(a, 500, 500), scale = (await overlay(a).boundingBox()).width / W
    await a.mouse.move(x, y); await a.mouse.down(); await a.mouse.move(x + 300 * scale, y - 100 * scale, { steps: 10 }); await a.mouse.up()
    await until(async () => (await object('caja')).keyframes?.length === 2, 'keyframe saved')
    const caja = await object('caja')
    assert.deepEqual([caja.x, caja.y], [200, 300], 'base geometry unchanged')
    assert.equal(caja.keyframes[0].at, 0); assert.deepEqual([caja.keyframes[0].x, caja.keyframes[0].y], [200, 300])
    assert.equal(caja.keyframes[1].at, 1500); assert.ok(Math.abs(caja.keyframes[1].x - 500) < 6 && Math.abs(caja.keyframes[1].y - 200) < 6, `moved keyframe ${JSON.stringify(caja.keyframes[1])}`)
    await sleep(300)
    near(await overlayPixel(a, 1050, 450), RED, 'animated canvas shows the rect at its keyframe'); near(await overlayPixel(a, 300, 650), WHITE, 'not at its base place')
    ok(`drag created keyframes 0 s (200, 300) and 1,5 s (${Math.round(caja.keyframes[1].x)}, ${Math.round(caja.keyframes[1].y)}); x/y base stay 200, 300; canvas shows the moved state`)
    await shot(a, 'keyframe-drag')
    await diamond(a, 'caja', 1500).waitFor()
    await ui.undo(a).click(); await until(async () => !(await object('caja')).keyframes, 'undo')
    await ui.redo(a).click(); await until(async () => (await object('caja')).keyframes?.length === 2, 'redo')
    ok('the whole drag is one undo step; redo restores it')
  })

  await step('keyframe inspector, curve, drag with snapping, add, copy/paste, delete and navigation', async () => {
    await diamond(a, 'caja', 1500).click()
    const inspector = timeline(a).getByRole('region', { name: 'Keyframe en 1,5 s' }); await inspector.waitFor()
    const field = inspector.locator('input[aria-label="X del keyframe"]'); await field.fill('700'); await field.press('Enter')
    await until(async () => (await object('caja')).keyframes[1].x === 700, 'x from inspector')
    await inspector.getByText('Lineal', { exact: true }).click(); await a.getByRole('option', { name: 'Desacelerar', exact: true }).click()
    await until(async () => (await object('caja')).keyframes[1].easing === 'ease-out', 'easing')
    ok('inspector edits the keyframe value (x 700) and its curve (ease-out)')
    const pps = await pxPerSecond(a)
    await dragBy(a, diamond(a, 'caja', 1500), 0.52 * pps)
    await until(async () => (await object('caja')).keyframes.some(f => f.at === 2000), 'snapped to 2 s')
    ok(`dragging the keyframe ~520 ms snaps to 2 s (${pps.toFixed(0)} px/s)`)
    await ui.undo(a).click(); await until(async () => (await object('caja')).keyframes.some(f => f.at === 1500), 'undo move')
    await ui.redo(a).click(); await until(async () => (await object('caja')).keyframes.some(f => f.at === 2000), 'redo move')
    await timeline(a).getByRole('button', { name: 'Imán' }).click()
    await dragBy(a, diamond(a, 'caja', 2000), 0.137 * pps)
    await until(async () => (await object('caja')).keyframes.some(f => f.at !== 0 && f.at % 100 !== 0), 'free placement without snapping')
    const free = (await object('caja')).keyframes[1].at
    await ui.undo(a).click(); await until(async () => (await object('caja')).keyframes.some(f => f.at === 2000), 'undo free move')
    await timeline(a).getByRole('button', { name: 'Imán' }).click()
    ok(`without the magnet it lands at ${free} ms; each drag is one undo step`)
    await seek(a, 3000); await timeline(a).getByRole('button', { name: /^Añadir keyframe/ }).click()
    await until(async () => (await object('caja')).keyframes.some(f => f.at === 3000), 'added at 3 s')
    const added = (await object('caja')).keyframes.find(f => f.at === 3000)
    assert.deepEqual(Object.keys(added).sort(), ['at', 'opacity', 'rotation', 'scale', 'x', 'y'])
    await diamond(a, 'caja', 2000).click(); await timeline(a).getByRole('button', { name: 'Copiar' }).click()
    await seek(a, 3500); await timeline(a).locator('[data-track="caja"] > button').first().click(); await timeline(a).getByRole('button', { name: 'Pegar en el cabezal' }).click()
    await until(async () => (await object('caja')).keyframes.some(f => f.at === 3500 && f.x === 700), 'pasted at 3,5 s')
    await diamond(a, 'caja', 3500).focus(); await a.keyboard.press('Delete')
    await until(async () => !(await object('caja')).keyframes.some(f => f.at === 3500), 'deleted with Supr')
    await seek(a, 0); await timeline(a).focus(); await a.keyboard.press(']')
    assert.equal(await readout(a).innerText(), '00:02,000 / 00:04,000', '] jumps to the next keyframe')
    ok('add (all properties at 3 s), copy/paste (3,5 s), delete with Supr and ] navigation')
  })

  await step('effect segments: drag the delay, resize the duration, one undo step each', async () => {
    const pps = await pxPerSecond(a), segment = timeline(a).locator('[data-track="titulo"] [data-effect="enter"]')
    await dragBy(a, segment, 0.5 * pps)
    await until(async () => (await object('titulo')).enter.delay === 500, 'delay 500')
    await dragBy(a, timeline(a).locator('[data-track="titulo"] [data-handle="end"]'), 0.4 * pps)
    await until(async () => (await object('titulo')).enter.duration === 1000, 'duration 1 s')
    assert.match(await segment.getAttribute('aria-label'), /Entrada: Desvanecer, de 0,5 s a 1,5 s/)
    await ui.undo(a).click(); await until(async () => (await object('titulo')).enter.duration === 600, 'undo duration')
    await ui.redo(a).click(); await until(async () => (await object('titulo')).enter.duration === 1000, 'redo duration')
    await segment.focus(); await a.keyboard.press('ArrowRight')
    await until(async () => (await object('titulo')).enter.delay === 600, 'keyboard +100 ms')
    ok('segment body drag → delay 0,5 s, end handle → duration 1 s, arrow key → +100 ms; undo/redo per action')
    await shot(a, 'segments')
  })

  await step('zoom and fit change the scale without writing', async () => {
    const revision = (await stored(design.id)).revision, before = await pxPerSecond(a)
    await timeline(a).getByRole('button', { name: 'Acercar' }).click(); const zoomed = await pxPerSecond(a)
    await timeline(a).getByRole('button', { name: 'Ajustar a la diapositiva' }).click(); const fitted = await pxPerSecond(a)
    assert.ok(zoomed > before * 1.3, `zoom in ${before} → ${zoomed}`)
    const width = await timeline(a).locator('[data-timeline-scroll]').evaluate(e => e.clientWidth)
    assert.ok(fitted * 4 < width, 'fit shows the whole slide')
    assert.equal((await stored(design.id)).revision, revision)
    ok(`zoom ${before.toFixed(0)} → ${zoomed.toFixed(0)} px/s, fit ${fitted.toFixed(0)} px/s; no writes`)
  })

  await step('timeline frame equals the preview and Presentar at the same instant', async () => {
    await seek(a, 1000); await sleep(300)
    const points = [[600, 400], [900, 400], [1250, 450], [400, 150]]
    const fromTimeline = []
    for (const [x, y] of points) fromTimeline.push(await overlayPixel(a, x, y))
    const expected = sceneAt(await doc(), 'page-1', 1000).objects.find(o => o.id === 'caja')
    assert.ok(expected.x > 200 && expected.x < 700, 'engine: the rect is mid-way at 1 s')
    await timeline(a).locator('[data-track="caja"] > button').first().click()
    await a.getByRole('button', { name: 'Animar', exact: true }).click(); await a.getByRole('button', { name: 'Previsualizar página' }).click()
    const dialog = a.getByRole('dialog', { name: 'Previsualizar animaciones' }), canvas = dialog.locator('[data-motion-stage] canvas').first()
    await canvas.waitFor(); await sleep(500)
    const slider = dialog.getByRole('slider', { name: 'Tiempo' }); await slider.focus(); await slider.press('Home'); for (let i = 0; i < 20; i++) await slider.press('ArrowRight')
    await sleep(200)
    for (const [i, [x, y]] of points.entries()) near(await canvas.evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]), fromTimeline[i], `preview vs timeline at ${x},${y}`)
    await dialog.getByRole('button', { name: 'Cerrar' }).first().click()
    await a.getByRole('button', { name: 'Presentar' }).click(); await ui.player(a).waitFor()
    const live = ui.player(a).locator('[data-motion-stage] canvas').first(); await live.waitFor()
    const seen = []
    const started = Date.now()
    while (Date.now() - started < 2600) { seen.push((await live.evaluate(c => [...c.getContext('2d').getImageData(1050, 450, 1, 1).data])).slice(0, 3)); await sleep(80) }
    assert.ok(seen.some(color => color[1] < 120), 'the rect passes through its keyframe position while presenting')
    await a.keyboard.press('Escape'); await ui.player(a).waitFor({ state: 'detached' })
    ok('timeline, preview and Presentar draw the same frame (4 sample points at 1 s); the presentation follows the keyframes')
  })

  await step('two users: independent edits survive; same keyframes converge (last writer wins)', async () => {
    const b = await openEditor(users.editor, design.id); await openTimeline(b.page)
    const ppsA = await pxPerSecond(a), pps = await pxPerSecond(b.page)
    await Promise.all([dragBy(a, timeline(a).locator('[data-track="titulo"] [data-effect="enter"]'), -0.3 * ppsA), dragBy(b.page, diamond(b.page, 'caja', 3000), 0.5 * pps)])
    await until(async () => (await object('titulo')).enter.delay === 300 && (await object('caja')).keyframes.some(f => f.at === 3500), 'both survive')
    ok('A moves the title\'s effect while B moves a keyframe of the rect: both kept')
    await Promise.all([dragBy(a, diamond(a, 'caja', 2000), 0.2 * ppsA), dragBy(b.page, diamond(b.page, 'caja', 3500), 0.2 * pps)])
    // Eventual convergence: both screens must reach the server's keyframes.
    const view = async target => (await timeline(target).locator('[data-track="caja"] [data-keyframe]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.keyframe)))).sort((x, y) => x - y)
    let latest, server, started = Date.now()
    await until(async () => {
      latest = await doc(); server = latest.objects.find(o => o.id === 'caja').keyframes.map(f => f.at)
      return JSON.stringify(await view(a)) === JSON.stringify(server) && JSON.stringify(await view(b.page)) === JSON.stringify(server)
    }, 'both screens converge', 15000).catch(async error => { throw Error(`${error.message}: server ${server} A ${await view(a)} B ${await view(b.page)}`) })
    const convergence = Date.now() - started
    assert.doesNotThrow(() => validateDocument(latest), 'server document stays valid')
    ok(`concurrent edits of the same keyframes converge on both screens to the server value [${server.join(', ')}] within ${convergence} ms (last writer wins per element)`)
    await b.context.close()
  })

  await step('read-only viewer can scrub but not edit', async () => {
    const viewer = await openEditor(users.viewer, design.id); await openTimeline(viewer.page)
    const revision = (await stored(design.id)).revision
    await seek(viewer.page, 1000); assert.equal(await readout(viewer.page).innerText(), '00:01,000 / 00:04,000')
    assert.equal(await timeline(viewer.page).getByRole('button', { name: /^Añadir keyframe/ }).isDisabled(), true)
    await dragBy(viewer.page, timeline(viewer.page).locator('[data-track="caja"] [data-keyframe]').nth(1), 60)
    await sleep(800)
    assert.equal((await stored(design.id)).revision, revision)
    ok('viewer: playhead and Animación view work; add disabled; dragging writes nothing')
    await viewer.context.close()
  })

  await step('page resize with scaled content scales keyframes proportionally; one undo step', async () => {
    const before = await doc()
    await timeline(a).getByRole('radio', { name: 'Diseño' }).click()
    await ui.formatPanel(a)
    const width = a.locator('input[aria-label="Ancho (px)"]'), height = a.locator('input[aria-label="Alto (px)"]')
    await width.fill('960'); await width.press('Enter'); await height.fill('540'); await height.press('Enter')
    await a.getByText('Escalar contenido proporcionalmente').click()
    await a.getByRole('button', { name: 'Aplicar cambios' }).click()
    await until(async () => (await doc()).page.width === 960, 'resized')
    const after = await doc()
    for (const t of [0, 800, 1500, 2600]) {
      const b0 = sceneAt(before, 'page-1', t).objects.find(o => o.id === 'caja'), a0 = sceneAt(after, 'page-1', t).objects.find(o => o.id === 'caja')
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(a0[key] - b0[key] / 2) < 0.01, `${key} at ${t}`)
    }
    ok('960×540: the rect\'s animated trajectory is exactly half at 0, 0,8, 1,5 and 2,6 s')
    await ui.undo(a).click(); await until(async () => (await doc()).page.width === 1920, 'undo resize')
    assert.deepEqual((await object('caja')).keyframes, before.objects.find(o => o.id === 'caja').keyframes)
    ok('undo restores page size and keyframes in one step')
  })

  await step('reopen keeps everything', async () => {
    const again = await openEditor(users.owner, design.id); await openTimeline(again.page)
    const expected = (await object('caja')).keyframes.map(f => f.at)
    const shown = (await timeline(again.page).locator('[data-track="caja"] [data-keyframe]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.keyframe)))).sort((x, y) => x - y)
    assert.deepEqual(shown, expected)
    await again.context.close()
    ok('reopening shows the same keyframes and segments')
  })

  await step('phone: menu entry, collapse, horizontal scroll and touch drag', async () => {
    const phone = await openEditor(users.owner, design.id, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await phone.page.getByRole('button', { name: 'Más opciones' }).click(); await phone.page.getByRole('menuitem', { name: 'Línea de tiempo' }).click()
    await timeline(phone.page).waitFor()
    const scroll = timeline(phone.page).locator('[data-timeline-scroll]')
    assert.equal(await scroll.evaluate(e => getComputedStyle(e).touchAction), 'auto', 'native scroll in both directions')
    await timeline(phone.page).getByRole('button', { name: 'Acercar' }).click(); await timeline(phone.page).getByRole('button', { name: 'Acercar' }).click()
    assert.ok(await scroll.evaluate(e => e.scrollWidth > e.clientWidth), 'horizontally scrollable when zoomed')
    await scroll.evaluate(e => { e.scrollLeft = 120 }); assert.ok(await scroll.evaluate(e => e.scrollLeft) > 0)
    assert.equal(await timeline(phone.page).evaluate(e => getComputedStyle(e).userSelect), 'none')
    await diamond(phone.page, 'caja', 0).scrollIntoViewIfNeeded()
    const target = await diamond(phone.page, 'caja', 0).elementHandle(), box = await target.boundingBox()
    assert.ok(box.width >= 14 && (await target.evaluate(e => getComputedStyle(e).touchAction)) === 'none')
    const at = (await object('caja')).keyframes[0].at
    await target.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: box.x + 7, clientY: box.y + 7, button: 0 })
    await target.dispatchEvent('pointermove', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: box.x + 70, clientY: box.y + 7, button: 0 })
    await target.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: box.x + 70, clientY: box.y + 7, button: 0 })
    await until(async () => (await object('caja')).keyframes[0].at !== at, 'touch drag moved the keyframe')
    await shot(phone.page, 'timeline-phone')
    const expanded = (await timeline(phone.page).boundingBox()).height
    await timeline(phone.page).getByRole('button', { name: 'Plegar línea de tiempo' }).click()
    assert.ok((await timeline(phone.page).boundingBox()).height < expanded / 2)
    await timeline(phone.page).getByRole('button', { name: 'Expandir línea de tiempo' }).click()
    await phone.context.close()
    ok('phone: opened from the menu, native scroll (touch-action auto) with handles touch-action none, no text selection, touch drag moves a keyframe, collapse/expand')
  })

  await step('performance: scrubbing, keyframe drag, page switch, open/close and memory', async () => {
    await ui.player(a).waitFor({ state: 'detached', timeout: 500 }).catch(() => {})
    const heap = () => a.evaluate(() => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? 0 })
    const canvases = () => a.evaluate(() => document.querySelectorAll('canvas').length)
    await timeline(a).getByRole('button', { name: 'Cerrar línea de tiempo' }).click()
    const heap0 = await heap(), canvas0 = await canvases()
    let started = Date.now()
    await a.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página siguiente/ }).click()
    await openTimeline(a); await seek(a, 100)
    await until(async () => Number((await overlay(a).locator('[data-motion-stage]').evaluate(e => e.dataset.frames ?? '0'))) >= 0 && (await overlay(a).locator('[data-motion-stage] canvas').count()) > 0, 'heavy page live', 20000)
    const pageSwitch = Date.now() - started
    const ruler = timeline(a).getByRole('slider', { name: 'Cabezal de reproducción' }), rb = await ruler.boundingBox()
    started = Date.now()
    await a.mouse.move(rb.x + 5, rb.y + 10); await a.mouse.down()
    for (let i = 0; i <= 120; i++) await a.mouse.move(rb.x + 5 + (i / 120) * Math.min(rb.width - 10, 900), rb.y + 10)
    await a.mouse.up()
    const scrubMs = Date.now() - started
    const stats = await overlay(a).locator('[data-motion-stage]').evaluate(e => ({ frames: Number(e.dataset.frames), avg: Number(e.dataset.frameAvg), max: Number(e.dataset.frameMax) }))
    const [x, y] = await pageToScreen(a, 40 + 80, 40 + 40)
    started = Date.now()
    await a.mouse.move(x, y); await a.mouse.down(); for (let i = 1; i <= 60; i++) await a.mouse.move(x + i * 2, y + i); await a.mouse.up()
    const dragMs = Date.now() - started
    await until(async () => (await doc()).additionalPages[0].objects.find(o => o.id === 'h0').keyframes, 'heavy keyframe persisted')
    await shot(a, 'timeline-heavy')
    await timeline(a).getByRole('button', { name: 'Cerrar línea de tiempo' }).click()
    for (let i = 0; i < 5; i++) { await openTimeline(a); await seek(a, 500); await sleep(400); await timeline(a).getByRole('button', { name: 'Cerrar línea de tiempo' }).click() }
    await sleep(500)
    const growth = ((await heap()) - heap0) / 2 ** 20, canvas1 = await canvases()
    assert.equal(canvas1, canvas0, 'player canvases released after closing')
    assert.ok(stats.avg < 16, `scrub frame avg ${stats.avg}`)
    ok(`100 objects: page switch + timeline + first frame ${pageSwitch} ms; 121 scrub moves in ${scrubMs} ms (renderFrame avg ${stats.avg.toFixed(2)} ms, max ${stats.max.toFixed(1)} ms, ${stats.frames} frames); 60-step keyframe drag ${dragMs} ms; heap ${growth >= 0 ? '+' : ''}${growth.toFixed(1)} MiB after 5 open/close; canvases released`)
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`)
  ok('no uncaught page errors')
} catch (error) {
  report.fatal(error)
} finally {
  await ctx.close()
  report.finish()
}
