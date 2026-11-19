// Verification of the animation/transition galleries, the timeline help bar, the single
// presentation clock and Grabar presentación on a disposable stack (real Chrome).
// Usage: node scripts/verify-studio-motion-gallery.mjs --build-api-image | --api-image=<tag> [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import { validateDocument } from '../apps/shared/studio/document.js'
import { apiImageFromArgs, createReport, startPresentStack, ui, until } from './fixtures/studio/present-stack.mjs'

const SHOTS = resolve('.artifacts/studio/motion-gallery')
const report = createReport(), { ok, step } = report
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: SHOTS, browserArgs: ['--use-fake-device-for-media-stream'] })
const { users, stored, createDesign, openEditor, shot, pageErrors } = ctx
const sleep = ms => new Promise(done => setTimeout(done, ms))
const W = 1920, H = 1080
const player = page => ui.player(page)
let recorded = null
const hashOf = locator => locator.evaluate(canvas => { const data = canvas.toDataURL('image/png'); let h = 0; for (let i = 0; i < data.length; i++) h = (h * 31 + data.charCodeAt(i)) | 0; return h })

try {
  const document = validateDocument({ schemaVersion: 8, unit: 'px', additionalPages: [
    { page: { id: 'page-2', width: W, height: H, background: '#0f172a', slide: { duration: 4000, transition: { type: 'wipe-left', duration: 800, easing: 'linear' } } },
      objects: [{ id: 'barra', type: 'rectangle', x: 300, y: 400, width: 1300, height: 200, rotation: 0, fill: '#f59e0b', enter: { preset: 'wipe-right', duration: 1000, delay: 0, easing: 'linear' } }] },
    { page: { id: 'page-3', width: W, height: H, background: '#fde68a', slide: { duration: 3000, transition: { type: 'cover-up', duration: 600, easing: 'ease-out' } } },
      objects: [{ id: 'sol', type: 'ellipse', x: 760, y: 340, width: 400, height: 400, rotation: 0, fill: '#ef4444' }] },
  ], page: { id: 'page-1', width: W, height: H, background: '#ffffff', slide: { duration: 5000 } },
  objects: [
    { id: 'caja', type: 'rectangle', x: 200, y: 300, width: 600, height: 400, rotation: 0, fill: '#ef4444', enter: { preset: 'fade', duration: 600, delay: 0, easing: 'ease-out' } },
    { id: 'circulo', type: 'ellipse', x: 1100, y: 300, width: 400, height: 400, rotation: 0, fill: '#3b82f6', emphasis: { preset: 'swing', duration: 1200, delay: 300, easing: 'ease-in-out', repeat: 2 },
      keyframes: [{ at: 0, x: 1100, y: 300 }, { at: 2500, x: 1300, y: 500, easing: 'ease-in-out' }] },
    { id: 'titulo', type: 'text', x: 200, y: 100, width: 1200, height: 110, rotation: 0, fill: '#111827', text: 'Galería de efectos', fontSize: 90, enter: { preset: 'float-up', duration: 900, delay: 200, easing: 'ease-out' } },
  ] })
  const design = await createDesign('Galería y grabación E2E', document)
  const doc = async () => (await stored(design.id)).document
  const object = async id => (await doc()).objects.find(o => o.id === id)
  ok('3-page v8 design with new presets (float-up, swing, wipe-right) and transitions (wipe-left, cover-up) accepted by the API')

  const { page: a } = await openEditor(users.owner, design.id)
  const selectLayer = async (target, name) => { await ui.layersPanel(target); await ui.layer(target, name).getByRole('button', { name: new RegExp(name) }).first().click() }
  const openAnimation = async target => { await target.getByRole('button', { name: 'Animar', exact: true }).click(); await target.getByRole('radiogroup', { name: 'Tipo de efecto' }).waitFor() }
  const card = (target, value) => target.locator(`[data-effect-card="${value}"]`)

  await step('A. gallery: explore and preview on the real element without writing', async () => {
    await selectLayer(a, 'Rectángulo'); await openAnimation(a)
    const before = await stored(design.id)
    const undoEnabledBefore = await ui.undo(a).isEnabled()
    for (const kind of ['Entrada', 'Énfasis', 'Salida']) {
      await a.getByRole('radiogroup', { name: 'Tipo de efecto' }).getByRole('radio', { name: new RegExp(`^${kind}`) }).click()
      assert.ok(await a.locator('[data-effect-card]').count() >= 10, `${kind} cards`)
    }
    await a.getByRole('radiogroup', { name: 'Tipo de efecto' }).getByRole('radio', { name: /^Entrada/ }).click()
    assert.ok(await card(a, 'fade').getAttribute('aria-label').then(label => label.includes('(aplicado)')), 'applied effect marked')
    await card(a, 'spiral').click()
    await a.locator('[data-effect-preview]').waitFor({ timeout: 15000 })
    await until(async () => (await a.locator('[data-effect-preview]').evaluate(e => e.style.opacity)) === '1', 'preview drawn')
    await sleep(250); await shot(a, 'A-gallery-preview-desktop')
    await a.getByText('Probando:').waitFor()
    await until(async () => (await a.locator('[data-effect-preview]').count()) === 0, 'preview ends by itself', 8000)
    await a.getByRole('button', { name: 'Reproducir de nuevo' }).click(); await a.locator('[data-effect-preview]').waitFor({ timeout: 15000 })
    await a.getByPlaceholder('Buscar efecto').fill('barr')
    assert.equal(await a.locator('[data-effect-card]').count(), 5, 'search narrows to the Barrido group (four wipes and reveal)')
    await a.getByPlaceholder('Buscar efecto').fill('')
    await sleep(800)
    const after = await stored(design.id)
    assert.equal(after.revision, before.revision, 'trying effects never writes')
    assert.equal(await ui.undo(a).isEnabled(), undoEnabledBefore, 'no undo entry')
    ok('three galleries (≥10 cards each), applied mark, tap plays on the element (read-only layer), replay, search; revision and undo unchanged')
  })

  await step('A. apply, timing, undo/redo and remove', async () => {
    await card(a, 'spiral').click()
    await a.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await until(async () => (await object('caja')).enter?.preset === 'spiral', 'spiral applied')
    assert.equal((await object('caja')).enter.duration, 600, 'timing kept')
    const field = a.locator('input[aria-label="Entrada: duración en segundos"]'); await field.fill('1,2'); await field.press('Enter')
    await until(async () => (await object('caja')).enter.duration === 1200, 'duration')
    const delay = a.locator('input[aria-label="Entrada: retraso en segundos"]'); await delay.fill('0,3'); await delay.press('Enter')
    await until(async () => (await object('caja')).enter.delay === 300, 'delay')
    await ui.undo(a).click(); await until(async () => (await object('caja')).enter.delay === 0, 'undo delay')
    await ui.redo(a).click(); await until(async () => (await object('caja')).enter.delay === 300, 'redo delay')
    await a.getByRole('radiogroup', { name: 'Tipo de efecto' }).getByRole('radio', { name: /^Salida/ }).click()
    await card(a, 'wipe-down').click(); await a.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await until(async () => (await object('caja')).exit?.preset === 'wipe-down', 'exit applied')
    await a.getByRole('button', { name: 'Quitar', exact: true }).click()
    await until(async () => !(await object('caja')).exit, 'exit removed')
    ok('Aplicar writes spiral keeping 0,6 s; duration 1,2 s and delay 0,3 s; undo/redo; exit wipe-down applied then Quitar')
  })

  await step('D. transition gallery: try, real preview both ways, apply, curve, remove', async () => {
    await ui.formatPanel(a)
    const section = ui.slideSection(a)
    await section.locator('[data-transition-card="uncover-right"]').click()
    await section.getByRole('button', { name: 'Vista previa' }).click()
    const dialog = a.getByRole('dialog', { name: 'Vista previa de la transición' })
    await dialog.locator('img').first().waitFor({ timeout: 20000 })
    await sleep(500); await shot(a, 'D-transition-preview')
    await dialog.getByRole('button', { name: 'Al retroceder' }).click(); await sleep(400)
    assert.equal(await dialog.locator('img').count(), 2, 'two real slides during the change')
    await dialog.getByRole('button', { name: 'Cerrar' }).last().click()
    assert.equal((await doc()).page.slide.transition, undefined, 'previewing never writes')
    await section.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await until(async () => (await doc()).page.slide.transition?.type === 'uncover-right', 'transition applied')
    await section.getByText('Desacelerar', { exact: true }).click(); await a.getByRole('option', { name: 'Lineal', exact: true }).click()
    await until(async () => (await doc()).page.slide.transition.easing === 'linear', 'curve')
    await shot(a, 'D-transition-gallery')
    await section.getByRole('button', { name: 'Quitar', exact: true }).click()
    await until(async () => (await doc()).page.slide.transition?.type === 'none', 'removed')
    ok('uncover-right tried and previewed between pages 3 → 1 forwards and backwards without writing; applied, curve Lineal, removed')
  })

  await step('B. timeline: badge and help bar stay put while dragging segments and the playhead', async () => {
    const timeline = a.getByRole('region', { name: 'Línea de tiempo' })
    await a.getByRole('button', { name: 'Línea de tiempo', exact: true }).click(); await timeline.waitFor()
    await selectLayer(a, 'Rectángulo')
    await timeline.focus(); await a.keyboard.press('Shift+ArrowRight')
    const badge = a.getByText('Modo Animación', { exact: true }), help = timeline.locator('p[aria-live="off"]')
    await badge.waitFor()
    const segment = timeline.locator('[data-track="caja"] [data-effect="enter"]')
    const box = await segment.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
    const boxes = [], helps = []
    await a.mouse.move(x, y); await a.mouse.down()
    for (let i = 1; i <= 16; i++) {
      await a.mouse.move(x + i * 9, y)
      boxes.push(JSON.stringify(await badge.boundingBox())); helps.push(await help.evaluate(e => ({ h: e.getBoundingClientRect().height, text: e.textContent, lines: Math.round(e.scrollHeight / e.clientHeight) })))
      if (i === 8) await shot(a, 'B-timeline-drag-readout')
    }
    await a.mouse.up()
    assert.equal(new Set(boxes).size, 1, `badge never moves or resizes: ${[...new Set(boxes)].join(' | ')}`)
    assert.ok(helps.every(entry => entry.h === helps[0].h && entry.lines === 1), 'help bar keeps one line and its height')
    assert.ok(helps.some(entry => /^Entrada: [^·]+ · \d\d:\d\d,\d{3} – \d\d:\d\d,\d{3}$/.test(entry.text)), `drag readout: ${helps.at(-1).text}`)
    await until(async () => (await object('caja')).enter.delay > 300, 'drag committed')
    // Playhead drag across the ruler: the badge text and box are constant.
    const ruler = timeline.getByRole('slider', { name: 'Cabezal de reproducción' }), r = await ruler.boundingBox()
    const seen = new Set()
    await a.mouse.move(r.x + 20, r.y + r.height / 2); await a.mouse.down()
    for (let i = 0; i < 12; i++) { await a.mouse.move(r.x + 20 + i * 37, r.y + r.height / 2); seen.add(JSON.stringify(await badge.boundingBox())) }
    await a.mouse.up()
    assert.equal(seen.size, 1, 'badge constant while scrubbing')
    ok(`badge box constant over 16 segment moves and 12 playhead moves; help bar 1 line, ${helps[0].h}px; readout "${helps.find(entry => entry.text.startsWith('Entrada')).text}"`)
  })

  await step('F. editor timeline: the same instant reached forwards and backwards draws the same pixels', async () => {
    const timeline = a.getByRole('region', { name: 'Línea de tiempo' }), canvas = a.locator('[data-animated-canvas] [data-motion-stage] canvas').first()
    await timeline.focus(); await a.keyboard.press('Home'); await a.keyboard.press('Shift+ArrowRight'); await a.keyboard.press('ArrowRight'); await a.keyboard.press('ArrowRight')
    await sleep(300); const forward = await hashOf(canvas)
    await a.keyboard.press('End'); await sleep(200)
    for (let i = 0; i < 38; i++) await a.keyboard.press('ArrowLeft')
    await sleep(300)
    assert.equal(await timeline.locator('output').innerText(), '00:01,200 / 00:05,000')
    assert.equal(await hashOf(canvas), forward, 'seeking back to 1,2 s reverts entry, emphasis and keyframes')
    ok('1,2 s reached from 0 and from the end (5 s) gives an identical frame')
    await timeline.getByRole('button', { name: 'Cerrar línea de tiempo' }).click()
  })

  await step('F. presenter: one clock — pause freezes transitions, replay/back are deterministic', async () => {
    const { page: p, context } = await openEditor(users.owner, design.id)
    // Fake clock paused before presenting: every reveal happens at a known instant.
    await p.clock.install(); await p.clock.pauseAt(await p.evaluate(() => Date.now() + 50))
    await p.getByRole('button', { name: 'Presentar' }).click(); await player(p).waitFor()
    const live = () => player(p).locator('[data-motion-stage] canvas').first()
    await until(async () => (await player(p).locator('[role="img"][aria-label="Diapositiva 1"]').getAttribute('aria-hidden')) === null, 'live slide 1 shown', 30000)
    // Frames are compared frozen: pausing renders the exact instant (not the last 16 ms frame).
    const freeze = async () => { await p.keyboard.press('k'); await p.keyboard.press('k'); await sleep(300) }
    await p.clock.runFor(1500); await freeze()
    const first = await hashOf(live())
    // Restart, pause at 0,7 s for 4 s, resume to 1,5 s.
    await p.keyboard.press('Home'); await p.clock.runFor(700)
    await p.keyboard.press('k'); await p.keyboard.press('k'); await p.clock.runFor(4000); await p.keyboard.press('k'); await p.clock.runFor(800); await p.keyboard.press('k'); await sleep(300)
    const resumed = await hashOf(live())
    assert.equal(resumed, first, 'restart + pause + resume reaches the same frame at 1,5 s')
    // Next slide (wipe-left 800 ms, linear): pause in the middle of the transition.
    await p.keyboard.press('ArrowRight')
    await until(async () => (await player(p).locator('[role="img"][aria-label="Diapositiva 2"]').getAttribute('aria-hidden')) === null, 'slide 2 revealed', 30000)
    await p.clock.runFor(400); await p.keyboard.press('k'); await p.keyboard.press('k'); await sleep(200)
    const clipOf = () => player(p).locator('[role="img"][aria-label="Diapositiva 2"] > div').first().evaluate(e => e.style.clipPath)
    const mid = await clipOf()
    assert.match(mid, /^inset\(0% 0% 0% (4\d|5\d)(\.\d+)?%\)$/, `half-way wipe: ${mid}`)
    await p.clock.runFor(3000); await sleep(200)
    assert.equal(await clipOf(), mid, 'a paused transition stays exactly where it was')
    await shot(p, 'F-transition-paused')
    await p.keyboard.press('k'); await p.clock.runFor(1000); await sleep(200)
    assert.equal(await clipOf(), '', 'resumed transition completes')
    await p.keyboard.press('k')
    // Back to slide 1: the wipe plays exactly in reverse with the leaving slide on top.
    await p.keyboard.press('ArrowLeft')
    await until(async () => (await player(p).locator('[role="img"][aria-label="Diapositiva 1"]').getAttribute('aria-hidden')) === null, 'slide 1 again', 30000)
    await p.clock.runFor(200); await sleep(150)
    const leaving = await player(p).locator('div[aria-hidden="true"]').filter({ has: p.locator('canvas') }).first().evaluate(e => ({ z: e.parentElement.style.zIndex, clip: e.style.clipPath }))
    assert.equal(leaving.z, '2'); assert.match(leaving.clip, /^inset\(0% 0% 0% \d/, `reverse wipe on the leaving slide: ${JSON.stringify(leaving)}`)
    await p.clock.runFor(1300); await freeze()
    assert.equal(await hashOf(live()), first, 'returning to slide 1 restarts it from its initial state')
    // Change slide during a transition: no orphan layers.
    await p.keyboard.press('ArrowRight'); await until(async () => (await player(p).locator('[role="img"][aria-label="Diapositiva 2"]').getAttribute('aria-hidden')) === null, 'slide 2', 30000)
    await p.clock.runFor(300); await p.keyboard.press('ArrowRight')
    await until(async () => (await ui.counter(p).innerText()) === '3 / 3', 'slide 3')
    await p.clock.runFor(2000); await sleep(400)
    const layers = await player(p).locator('div.absolute.inset-0.flex').count()
    assert.equal(layers, 1, 'one layer after an interrupted transition')
    assert.equal(await player(p).locator('[style*="clip-path"]').count(), 0)
    ok('same frame at 1,5 s via play / restart+pause+resume / back navigation; wipe paused at 50 % stays for 3 s and completes on resume; back plays the reverse with the leaving slide on top; interrupting a transition leaves one layer')
    await context.close()
  })

  await step('E. record with narration, pause/resume, stop, preview, download, tracks released', async () => {
    const { page: p, context } = await openEditor(users.owner, design.id, { permissions: ['microphone'] })
    await p.evaluate(() => {
      window.__streams = []
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async constraints => { const s = await gum(constraints); window.__streams.push(s); return s }
      const capture = HTMLCanvasElement.prototype.captureStream
      HTMLCanvasElement.prototype.captureStream = function (...args) { const s = capture.apply(this, args); window.__streams.push(s); return s }
    })
    await p.getByRole('button', { name: 'Presentar' }).click(); await player(p).waitFor()
    await player(p).getByRole('button', { name: 'Grabar presentación' }).click()
    const setup = player(p).getByRole('dialog', { name: 'Grabar presentación' }); await setup.waitFor()
    const format = await setup.getByText(/^Formato:/).innerText()
    await shot(p, 'E-record-setup')
    await setup.getByRole('button', { name: 'Empezar a grabar' }).click()
    await player(p).getByText(/^[123]$/).first().waitFor()
    await player(p).getByText(/^REC \d\d:\d\d$/).waitFor({ timeout: 8000 })
    const started = Date.now()
    await sleep(1500); await p.keyboard.press('ArrowRight'); await sleep(1500)
    await shot(p, 'E-recording')
    await player(p).getByRole('button', { name: 'Pausar grabación' }).click()
    const paused = await player(p).getByText(/^En pausa \d\d:\d\d$/).innerText()
    await sleep(2000)
    assert.equal(await player(p).getByText(/^En pausa \d\d:\d\d$/).innerText(), paused, 'the counter stops while paused')
    await player(p).getByRole('button', { name: 'Reanudar grabación' }).click()
    await sleep(1000); await p.keyboard.press('ArrowLeft'); await sleep(1200)
    const wall = Date.now() - started
    await player(p).getByRole('button', { name: 'Detener grabación', exact: true }).click()
    const result = player(p).getByRole('dialog', { name: 'Grabación lista' }); await result.waitFor({ timeout: 15000 })
    await shot(p, 'E-recording-result')
    recorded = await p.evaluate(async () => {
      const video = document.querySelector('[role="dialog"][aria-label="Grabación lista"] video'), blob = await (await fetch(video.src)).blob()
      const element = Object.assign(document.createElement('video'), { muted: true, src: video.src })
      await new Promise(done => { element.onloadedmetadata = done })
      if (!Number.isFinite(element.duration)) { element.currentTime = 1e9; await new Promise(done => { element.ontimeupdate = done }) }
      let audio = null
      try { audio = (await new AudioContext().decodeAudioData(await blob.arrayBuffer())).duration } catch { audio = null }
      const tracks = window.__streams.flatMap(s => s.getTracks()).map(t => ({ kind: t.kind, state: t.readyState }))
      return { type: blob.type, size: blob.size, duration: element.duration, width: element.videoWidth, height: element.videoHeight, audio, tracks }
    })
    assert.ok(recorded.size > 20_000, `size ${recorded.size}`)
    assert.deepEqual([recorded.width, recorded.height], [1920, 1080])
    assert.ok(recorded.tracks.length >= 2 && recorded.tracks.every(t => t.state === 'ended'), `tracks released: ${JSON.stringify(recorded.tracks)}`)
    const expected = (wall - 2000) / 1000
    assert.ok(Math.abs(recorded.duration - expected) < 1.2, `video ${recorded.duration.toFixed(2)} s vs ${expected.toFixed(2)} s without the pause`)
    assert.ok(recorded.audio !== null && Math.abs(recorded.audio - recorded.duration) < 0.5, `audio ${recorded.audio} vs video ${recorded.duration}`)
    const [download] = await Promise.all([p.waitForEvent('download'), result.getByRole('button', { name: 'Descargar' }).click()])
    const saved = join(SHOTS, `grabacion.${download.suggestedFilename().split('.').pop()}`); await download.saveAs(saved)
    ok(`${format.replace('.', '')}: ${recorded.type}, ${recorded.width}×${recorded.height}, video ${recorded.duration.toFixed(2)} s (expected ≈${expected.toFixed(2)} s excl. 2 s pause), audio ${recorded.audio.toFixed(2)} s, ${(recorded.size / 1024).toFixed(0)} KB; download "${download.suggestedFilename()}"; ${recorded.tracks.length} tracks ended`)

    // Again without the microphone: video only.
    await result.getByRole('button', { name: 'Grabar de nuevo' }).click()
    await setup.waitFor(); await setup.getByRole('switch', { name: 'Narrar con el micrófono' }).click()
    await setup.getByRole('button', { name: 'Empezar a grabar' }).click()
    await player(p).getByText(/^REC \d\d:\d\d$/).waitFor({ timeout: 8000 }); await sleep(1500)
    // Hidden tab pauses the recording.
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
    await player(p).getByText('La grabación se pausó porque cambiaste de pestaña.').waitFor()
    await p.evaluate(() => { delete document.hidden })
    await player(p).getByRole('button', { name: 'Reanudar grabación' }).click(); await sleep(800)
    await player(p).getByRole('button', { name: 'Detener grabación', exact: true }).click(); await result.waitFor({ timeout: 15000 })
    const silent = await p.evaluate(async () => {
      const blob = await (await fetch(document.querySelector('[role="dialog"][aria-label="Grabación lista"] video').src)).blob()
      try { await new AudioContext().decodeAudioData(await blob.arrayBuffer()); return { size: blob.size, audio: true } } catch { return { size: blob.size, audio: false } }
    })
    assert.equal(silent.audio, false, 'no audio track without the microphone')
    await result.getByRole('button', { name: 'Descartar' }).click()
    // Escape while recording stops and keeps the video instead of leaving.
    await player(p).getByRole('button', { name: 'Grabar presentación' }).click(); await setup.getByRole('button', { name: 'Empezar a grabar' }).click()
    await player(p).getByText(/^REC \d\d:\d\d$/).waitFor({ timeout: 8000 }); await sleep(800)
    await player(p).getByRole('button', { name: 'Detener grabación y salir' }).click()
    await result.waitFor({ timeout: 15000 }); assert.equal(await player(p).count(), 1, 'the player stays open with the result')
    ok(`silent recording ${(silent.size / 1024).toFixed(0)} KB without audio track; hidden tab pauses with a notice; ✕ while recording stops and keeps the video`)
    await context.close()
  })

  await step('E. denied microphone and unsupported browser are honest', async () => {
    const { page: p, context } = await openEditor(users.owner, design.id)
    await p.getByRole('button', { name: 'Presentar' }).click(); await player(p).waitFor()
    await player(p).getByRole('button', { name: 'Grabar presentación' }).click()
    const setup = player(p).getByRole('dialog', { name: 'Grabar presentación' })
    await setup.getByRole('button', { name: 'Empezar a grabar' }).click()
    await setup.getByRole('alert').filter({ hasText: /permiso para usar el micrófono|micrófono disponible/ }).waitFor({ timeout: 10000 })
    assert.equal(await player(p).getByText(/^REC/).count(), 0, 'nothing recorded')
    await shot(p, 'E-mic-denied')
    await setup.getByRole('switch', { name: 'Narrar con el micrófono' }).click()
    await setup.getByRole('button', { name: 'Empezar a grabar' }).click()
    await player(p).getByText(/^REC \d\d:\d\d$/).waitFor({ timeout: 8000 })
    await player(p).getByRole('button', { name: 'Detener grabación', exact: true }).click()
    await player(p).getByRole('dialog', { name: 'Grabación lista' }).waitFor({ timeout: 15000 })
    await p.addInitScript(() => { delete window.MediaRecorder })
    await p.reload(); await p.getByRole('button', { name: /Deshacer/ }).first().waitFor({ timeout: 60000 })
    await p.getByRole('button', { name: 'Presentar' }).click(); await player(p).waitFor()
    await player(p).getByRole('button', { name: 'Grabar presentación' }).click()
    await setup.getByText('Este navegador no permite grabar la presentación.').waitFor()
    assert.equal(await setup.getByRole('button', { name: 'Empezar a grabar' }).count(), 0, 'no control that pretends to work')
    ok('denied microphone: explanation, no recording; recording without audio still works; without MediaRecorder the panel explains and offers no start button')
    await context.close()
  })

  await step('H. phone: gallery without hover, timeline help bar, player controls', async () => {
    const { page: phone, context } = await openEditor(users.owner, design.id, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    // Select by tapping the element on the canvas, then Propiedades → Animar.
    const paper = phone.locator('canvas.upper-canvas').first(), pb = await paper.boundingBox()
    await phone.touchscreen.tap(pb.x + pb.width * 500 / W, pb.y + pb.height * 500 / H)
    await ui.selectionBar(phone).getByRole('button', { name: 'Propiedades' }).click()
    await phone.getByRole('button', { name: 'Animar', exact: true }).last().click()
    await phone.getByRole('radiogroup', { name: 'Tipo de efecto' }).waitFor()
    await card(phone, 'elastic').tap()
    assert.equal(await card(phone, 'elastic').getAttribute('aria-pressed'), 'true')
    await phone.getByRole('button', { name: 'Aplicar', exact: true }).waitFor()
    await sleep(300); await shot(phone, 'H-gallery-phone')
    const cardBox = await card(phone, 'elastic').boundingBox()
    assert.ok(cardBox.height >= 44, `touch target ${cardBox.height}px`)
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll')
    ok(`phone: tap plays a card (aria-pressed), Aplicar is a separate action, cards ${Math.round(cardBox.height)} px tall, no horizontal scroll`)
    await context.close()
    const second = await openEditor(users.owner, design.id, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await second.page.getByRole('button', { name: 'Más opciones' }).click(); await second.page.getByRole('menuitem', { name: 'Línea de tiempo' }).click()
    const timeline = second.page.getByRole('region', { name: 'Línea de tiempo' }); await timeline.waitFor()
    await timeline.getByText('Diseño: los cambios modifican la posición base.', { exact: false }).waitFor()
    await shot(second.page, 'H-timeline-phone')
    await second.page.getByRole('button', { name: 'Más opciones' }).click(); await second.page.getByRole('menuitem', { name: 'Presentar' }).click()
    await player(second.page).waitFor(); await sleep(1500)
    for (const name of ['Reiniciar presentación', 'Grabar presentación', 'Diapositiva siguiente']) await player(second.page).getByRole('button', { name }).waitFor()
    await shot(second.page, 'H-player-phone')
    ok('phone: timeline help bar visible in one line; player has Reiniciar, Grabar and navigation controls')
    await second.context.close()
  })

  await step('H. dark mode gallery', async () => {
    const { page: dark, context } = await openEditor(users.owner, design.id, { colorScheme: 'dark' })
    await selectLayer(dark, 'Rectángulo'); await openAnimation(dark)
    await dark.locator('[data-effect-card="wipe-right"]').hover(); await sleep(400)
    await shot(dark, 'H-gallery-dark')
    ok('dark mode gallery rendered (screenshot)')
    await context.close()
  })

  await step('E. browser engines: what recording each one really supports', async () => {
    const probe = () => {
      const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      const R = window.MediaRecorder
      return { mediaRecorder: Boolean(R), captureStream: typeof HTMLCanvasElement.prototype.captureStream === 'function', pause: Boolean(R?.prototype?.pause),
        types: R ? types.filter(type => { try { return R.isTypeSupported(type) } catch { return false } }) : [] }
    }
    const results = {}
    for (const [name, engine, options] of [['Chrome (stack)', chromium, { channel: 'chrome' }], ['Firefox', firefox, {}], ['WebKit', webkit, {}]]) {
      const browser = await engine.launch({ headless: true, ...options }), page = await browser.newPage()
      await page.setContent('<canvas></canvas>'); results[name] = await page.evaluate(probe); await browser.close()
    }
    await writeFile(join(SHOTS, 'engines.json'), JSON.stringify(results, null, 2))
    for (const [name, value] of Object.entries(results)) ok(`${name}: MediaRecorder ${value.mediaRecorder}, captureStream ${value.captureStream}, pause ${value.pause}, types [${value.types.join(' | ')}]`)
  })

  assert.deepEqual(pageErrors.filter(message => !/ResizeObserver/.test(message)), [], `page errors: ${pageErrors.join(' | ')}`)
  ok('no page errors')
} catch (error) { report.fatal(error) } finally {
  if (recorded) await writeFile(join(SHOTS, 'recording.json'), JSON.stringify(recorded, null, 2))
  await ctx.close(); report.finish()
}
