// Studio Next phase 4 verification: GIF, MP4 and WebM exported from the real dialog on a
// disposable stack, then inspected with independent container parsers (this file), played
// back by Chrome's own decoders and compared frame by frame with the editor's renderer.
// Usage: node scripts/verify-studio-exports.mjs --build-api-image | --api-image=<tag> [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acceptanceDocument } from './fixtures/studio/acceptance-project.mjs'
import { apiImageFromArgs, createReport, startPresentStack, ui, until } from './fixtures/studio/present-stack.mjs'

const report = createReport(), { ok, step } = report
const OUT = resolve('.artifacts/studio/exports'); await mkdir(OUT, { recursive: true })
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: resolve('.artifacts/studio/exports/shots') })
const { users, stored, uploadPhoto, createDesign, openEditor, shot, pageErrors } = ctx
const sleep = ms => new Promise(done => setTimeout(done, ms))

// ---- Independent container inspection (no encoder code involved) ----------------------
function mp4Info(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), info = {}
  const walk = (start, end) => {
    for (let at = start; at + 8 <= end;) {
      let size = view.getUint32(at), header = 8
      const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
      if (size === 1) { size = Number(view.getBigUint64(at + 8)); header = 16 }
      if (size === 0) size = end - at
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(at + header, at + size)
      if (type === 'mvhd') { const v = view.getUint8(at + 8), ts = view.getUint32(at + (v ? 28 : 20)), d = v ? Number(view.getBigUint64(at + 32)) : view.getUint32(at + 24); info.duration = d / ts }
      if (type === 'tkhd') { info.width = view.getUint32(at + size - 8) / 65536; info.height = view.getUint32(at + size - 4) / 65536 }
      if (type === 'stsz') info.frames = view.getUint32(at + 16)
      if (type === 'stsd') info.codec = String.fromCharCode(...bytes.subarray(at + 20, at + 24))
      at += size
    }
  }
  walk(0, bytes.length)
  return info
}
function webmInfo(bytes) {
  const info = { frames: 0 }
  const vint = at => { const first = bytes[at]; let length = 1; while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++; return length }
  const readId = at => { const n = vint(at); let id = 0; for (let i = 0; i < n; i++) id = id * 256 + bytes[at + i]; return [id, n] }
  const readSize = at => { const n = vint(at); let value = bytes[at] & (0xff >> n); for (let i = 1; i < n; i++) value = value * 256 + bytes[at + i]; return [value, n, value === 2 ** (7 * n) - 1] }
  const uint = (at, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + bytes[at + i]; return v }
  const MASTERS = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0x1f43b675, 0xa0])
  let scale = 1e6
  const walk = (start, end) => {
    for (let at = start; at < end;) {
      const [id, idLength] = readId(at), [size, sizeLength, unknown] = readSize(at + idLength), body = at + idLength + sizeLength, stop = unknown ? end : body + size
      if (MASTERS.has(id)) walk(body, stop)
      else if (id === 0x2ad7b1) scale = uint(body, size)
      else if (id === 0x4489) info.duration = (size === 4 ? new DataView(bytes.buffer, bytes.byteOffset + body, 4).getFloat32(0) : new DataView(bytes.buffer, bytes.byteOffset + body, 8).getFloat64(0)) * scale / 1e9
      else if (id === 0xb0) info.width = uint(body, size)
      else if (id === 0xba) info.height = uint(body, size)
      else if (id === 0x86) info.codec = new TextDecoder().decode(bytes.subarray(body, body + size))
      else if (id === 0xa3 || id === 0xa1) info.frames++
      at = stop
    }
  }
  walk(0, bytes.length)
  return info
}
function gifInfo(bytes) {
  const info = { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8), frames: 0, delay: 0, loop: null }
  let at = 13 + ((bytes[10] & 0x80) ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0)
  const skipBlocks = () => { while (bytes[at] !== 0) at += bytes[at] + 1; at++ }
  while (at < bytes.length) {
    const marker = bytes[at]
    if (marker === 0x3b) break
    if (marker === 0x21) {
      const label = bytes[at + 1]
      if (label === 0xf9) info.delay += (bytes[at + 4] | (bytes[at + 5] << 8)) * 10
      if (label === 0xff && String.fromCharCode(...bytes.subarray(at + 3, at + 11)) === 'NETSCAPE') info.loop = bytes[at + 16] | (bytes[at + 17] << 8)
      at += 2; skipBlocks()
    } else if (marker === 0x2c) {
      info.frames++
      const packed = bytes[at + 9]
      at += 10 + ((packed & 0x80) ? 3 * 2 ** ((packed & 7) + 1) : 0) + 1
      skipBlocks()
    } else break
  }
  return info
}

try {
  // ---- Acceptance project -------------------------------------------------------------
  const photo = await uploadPhoto('#14b8a6', 'foto-privada.png')
  const document = acceptanceDocument(photo.id)
  const design = await createDesign('Proyecto de aceptación', document, [[users.viewer, 'VIEWER']])
  const original = await stored(design.id)
  ok('acceptance project: 3 pages (16:9 dark 3 s, square 2 s with fade, 16:9 2,5 s with slide), private photo, texts, shapes, enter/exit, position/scale/opacity/rotation keyframes')

  const { page: a } = await openEditor(users.owner, design.id)
  const heapNow = target => target.evaluate(() => { globalThis.gc?.(); return performance.memory?.usedJSHeapSize ?? 0 })
  // Runs one export from the dialog; returns bytes, elapsed time, progress samples and peak heap.
  async function exportFrom(target, type, label, configure = async () => {}) {
    await target.getByRole('button', { name: 'Descargar' }).click()
    const dialog = target.getByRole('dialog').last()
    await dialog.getByRole('radio', { name: new RegExp(`^${label}`) }).click()
    await configure(dialog)
    await dialog.getByRole('region', { name: 'Resumen de la exportación' }).waitFor()
    const summary = await dialog.getByRole('region', { name: 'Resumen de la exportación' }).innerText()
    const base = await heapNow(target)
    let peak = base
    const sampler = setInterval(async () => { try { peak = Math.max(peak, await target.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) } catch { /* page busy */ } }, 400)
    const progress = new Set()
    const watcher = setInterval(async () => { try { const value = await target.locator('[data-progress]').first().innerText({ timeout: 200 }); progress.add(value) } catch { /* not shown */ } }, 250)
    const started = Date.now(), download = target.waitForEvent('download', { timeout: 300_000 })
    await dialog.getByRole('button', { name: 'Descargar', exact: true }).click()
    await target.getByRole('button', { name: `Exportar ${type.toUpperCase()}` }).click()
    const file = await download
    const elapsed = Date.now() - started
    clearInterval(sampler); clearInterval(watcher)
    const path = join(OUT, `aceptacion.${type}`); await file.saveAs(path)
    return { bytes: new Uint8Array(await readFile(path)), name: file.suggestedFilename(), elapsed, progress: [...progress], peakMiB: (peak - base) / 2 ** 20, summary, path }
  }

  // Reference pixels from the editor's own renderer (preview dialog: same sceneAt + player) at page-local instants.
  const PAGE = { 'page-1': { width: 1920, height: 1080 }, 'page-2': { width: 1080, height: 1080 }, 'page-3': { width: 1920, height: 1080 } }
  const POINTS = { 'page-1': [[300, 570], [700, 570], [1540, 780], [500, 150], [60, 1000]], 'page-2': [[540, 540], [300, 300], [540, 920], [60, 60]], 'page-3': [[560, 540], [1450, 360], [1000, 950], [1800, 120]] }
  // Points on glyph edges: compared at video resolution only (a 640 px GIF averages a 1920 px page's letter edges).
  const TEXT_EDGES = new Set(['page-1:500,150', 'page-2:540,920'])
  const references = {}
  async function referenceAt(pageNumber, local) {
    const pageId = `page-${pageNumber}`, key = `${pageId}@${local}`
    if (references[key]) return references[key]
    const switcher = a.getByRole('group', { name: 'Navegación entre páginas' })
    const label = await switcher.innerText()
    for (let i = Number(/Página (\d)/.exec(label)[1]); i < pageNumber; i++) { await switcher.getByRole('button', { name: /Página siguiente/ }).click(); await sleep(400) }
    for (let i = Number(/Página (\d)/.exec(await switcher.innerText())[1]); i > pageNumber; i--) { await switcher.getByRole('button', { name: /Página anterior/ }).click(); await sleep(400) }
    const layer = { 1: 'Studio Next', 2: 'Página cuadrada', 3: 'Rectángulo' }[pageNumber]
    await ui.layersPanel(a); await ui.layer(a, layer).getByRole('button', { name: new RegExp(layer) }).first().click()
    await a.getByRole('button', { name: 'Animar', exact: true }).click(); await a.getByRole('button', { name: 'Previsualizar página' }).click()
    const dialog = a.getByRole('dialog', { name: 'Previsualizar animaciones' }), canvas = dialog.locator('[data-motion-stage] canvas').first()
    await canvas.waitFor(); await sleep(600)
    const slider = dialog.getByRole('slider', { name: 'Tiempo' }); await slider.focus(); await slider.press('Home')
    for (let i = 0; i < local / 50; i++) await slider.press('ArrowRight')
    await sleep(200)
    references[key] = await canvas.evaluate((c, points) => points.map(([x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3)), POINTS[pageId])
    await dialog.getByRole('button', { name: 'Cerrar' }).first().click(); await dialog.waitFor({ state: 'detached' })
    return references[key]
  }
  // Decoded frame pixels at given video coordinates, by Chrome's decoders.
  async function decodedPixels(file, type, time, coords) {
    // Decoded in the app's page: a secure context (ImageDecoder requires it), nothing added to the DOM.
    {
      return await a.evaluate(async ({ base64, type, time, coords }) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (type === 'gif') {
          const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' }); await decoder.tracks.ready
          const frame = (await decoder.decode({ frameIndex: time.frame })).image
          canvas.width = frame.displayWidth; canvas.height = frame.displayHeight; ctx.drawImage(frame, 0, 0); frame.close()
        } else {
          const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(new Blob([bytes], { type: `video/${type}` }))
          await new Promise((ok, fail) => { video.onloadeddata = ok; video.onerror = () => fail(Error('decode')) })
          video.currentTime = time.seconds; await new Promise(ok => { video.onseeked = ok })
          canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0)
        }
        return coords.map(([x, y]) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3))
      }, { base64: Buffer.from(file.bytes).toString('base64'), type, time, coords })
    }
  }
  // Contact sheet of decoded frames (PNG) for visual review of each file.
  async function contactSheet(file, type, fps, instants) {
    const data = await a.evaluate(async ({ base64, type, fps, instants }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), images = []
      if (type === 'gif') {
        const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' }); await decoder.tracks.ready
        for (const ms of instants) images.push((await decoder.decode({ frameIndex: Math.floor(ms * fps / 1000) })).image)
      } else {
        const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(new Blob([bytes], { type: `video/${type}` }))
        await new Promise(ok => { video.onloadeddata = ok })
        for (const ms of instants) { video.currentTime = (Math.round(ms * fps / 1000) + 0.5) / fps; await new Promise(ok => { video.onseeked = ok }); images.push(await createImageBitmap(video)) }
      }
      const w = 480, h = Math.round(w * (images[0].displayHeight ?? images[0].height) / (images[0].displayWidth ?? images[0].width))
      const canvas = document.createElement('canvas'); canvas.width = w * images.length + 8 * (images.length - 1); canvas.height = h
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, h)
      images.forEach((image, i) => { ctx.drawImage(image, i * (w + 8), 0, w, h); image.close() })
      return canvas.toDataURL('image/png')
    }, { base64: Buffer.from(file.bytes).toString('base64'), type, fps, instants })
    await writeFile(join(OUT, `fotogramas-${type}.png`), Buffer.from(data.split(',')[1], 'base64'))
  }
  // Plays the whole file in Chrome (muted, real time) and reports what the player saw.
  async function play(file, type) {
    const viewer = await a.context().newPage()
    try {
      await viewer.goto(a.url().replace(/\/app\/.*$/, '/app/login'))
      return await viewer.evaluate(async ({ base64, type }) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), url = URL.createObjectURL(new Blob([bytes], { type: type === 'gif' ? 'image/gif' : `video/${type}` }))
        if (type === 'gif') {
          const image = document.createElement('img'); image.src = url; await image.decode()
          const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' }); await decoder.tracks.ready
          return { width: image.naturalWidth, height: image.naturalHeight, frames: decoder.tracks.selectedTrack.frameCount, repetition: decoder.tracks.selectedTrack.repetitionCount }
        }
        const video = document.createElement('video'); video.muted = true; video.src = url
        await new Promise((ok, fail) => { video.onloadedmetadata = ok; video.onerror = () => fail(Error(`no se pudo reproducir ${type}`)) })
        const started = performance.now(); await video.play(); await new Promise(ok => { video.onended = ok })
        const quality = video.getVideoPlaybackQuality()
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, playedMs: Math.round(performance.now() - started), decoded: quality.totalVideoFrames, dropped: quality.droppedVideoFrames }
      }, { base64: Buffer.from(file.bytes).toString('base64'), type })
    } finally { await viewer.close() }
  }
  // Global instants: page 1 at 1 s, the fade into page 2 halfway, page 2 at 1 s, page 3 at 1,5 s.
  const box = (page, W, H) => { const fit = Math.min(W / page.width, H / page.height), w = page.width * fit, h = page.height * fit; return { x: (W - w) / 2, y: (H - h) / 2, w, h } }
  const toVideo = (pageId, W, H) => POINTS[pageId].map(([x, y]) => { const b = box(PAGE[pageId], W, H); return [b.x + x * b.w / PAGE[pageId].width, b.y + y * b.h / PAGE[pageId].height] })
  async function compareFrames(file, type, info, fps, tolerance) {
    const W = info.width, H = info.height, at = ms => (type === 'gif' ? { frame: Math.floor(ms * fps / 1000) } : { seconds: (Math.round(ms * fps / 1000) + 0.5) / fps })
    const checks = [['page-1', 1, 1000, 1000], ['page-2', 2, 1000, 4000], ['page-3', 3, 1500, 6500]]
    let compared = 0, worst = 0
    for (const [pageId, number, local, global] of checks) {
      const expected = await referenceAt(number, local), actual = await decodedPixels(file, type, at(global), toVideo(pageId, W, H))
      actual.forEach((pixel, i) => { if (type === 'gif' && TEXT_EDGES.has(`${pageId}:${POINTS[pageId][i]}`)) return; const diff = Math.max(...pixel.map((v, c) => Math.abs(v - expected[i][c]))); worst = Math.max(worst, diff); compared++; assert.ok(diff <= tolerance, `${type} ${pageId}@${local} point ${POINTS[pageId][i]}: ${pixel} vs ${expected[i]} (diff ${diff})`) })
    }
    // Halfway through the fade into page 2 (global 3250 ms): 50 % of page 1's last frame over page 2 at 250 ms.
    const incoming = await referenceAt(2, 250)
    const center = toVideo('page-2', W, H)[0], under = await decodedPixels(file, type, at(3250), [center])
    const p1 = (await decodedPixels(file, type, at(2990), [center]))[0]
    const blend = incoming[0].map((v, c) => 0.5 * v + 0.5 * p1[c])
    const diff = Math.max(...under[0].map((v, c) => Math.abs(v - blend[c])))
    assert.ok(diff <= tolerance + 10, `${type} fade halfway ${under[0]} vs ${blend.map(Math.round)}`)
    // Letterbox bars beside the square page are black, like Presentar.
    const bar = (await decodedPixels(file, type, at(4000), [[4, H / 2]]))[0]
    assert.ok(bar.every(v => v <= 24), `${type} letterbox ${bar}`)
    return { compared: compared + 2, worst }
  }

  const results = {}
  for (const [type, label, tolerance] of [['mp4', 'Video MP4', 28], ['webm', 'Video WebM', 28], ['gif', 'GIF animado', 48]]) {
    await step(`${type}: export, inspect, play and compare with the editor`, async () => {
      const file = await exportFrom(a, type, label)
      assert.match(file.name, new RegExp(`\\.${type}$`))
      const info = type === 'mp4' ? mp4Info(file.bytes) : type === 'webm' ? webmInfo(file.bytes) : gifInfo(file.bytes)
      const fps = type === 'gif' ? 12 : 30, expectedFrames = type === 'gif' ? 90 : 225
      if (type === 'gif') {
        assert.deepEqual([info.width, info.height, info.frames, info.loop], [640, 360, expectedFrames, 0])
        assert.ok(Math.abs(info.delay - 7500) <= 100, `gif delays ${info.delay}`)
      } else {
        assert.deepEqual([info.width, info.height], [1280, 720])
        assert.ok(Math.abs(info.frames - expectedFrames) <= 1, `${type} frames ${info.frames}`)
        assert.ok(Math.abs(info.duration - 7.5) <= 0.1, `${type} duration ${info.duration}`)
      }
      const played = await play(file, type)
      if (type === 'gif') assert.deepEqual([played.width, played.height, played.frames], [640, 360, expectedFrames])
      else { assert.deepEqual([played.width, played.height], [1280, 720]); assert.ok(Math.abs(played.duration - 7.5) <= 0.1 && played.playedMs >= 7000, `played ${JSON.stringify(played)}`) }
      const frames = await compareFrames(file, type, info, fps, tolerance)
      await contactSheet(file, type, fps, [1000, 3250, 4000, 5300, 6500])
      results[type] = { file, info, played, frames }
      assert.ok(file.progress.length >= 2, `progress shown ${file.progress}`)
      ok(`${type.toUpperCase()}: ${(file.bytes.length / 1e6).toFixed(2)} MB in ${(file.elapsed / 1000).toFixed(1)} s; container ${JSON.stringify(info)}; Chrome ${type === 'gif' ? `decoded ${played.frames} frames, repetition ${played.repetition}` : `played ${played.duration.toFixed(2)} s in ${(played.playedMs / 1000).toFixed(1)} s, ${played.decoded} frames decoded, ${played.dropped} dropped`}; ${frames.compared} pixels vs editor (worst diff ${frames.worst}, tolerance ${tolerance}); peak heap +${file.peakMiB.toFixed(0)} MiB; progress ${file.progress.slice(0, 3).join(', ')}…`)
    })
  }
  await shot(a, 'after-exports')

  await step('the design is unchanged after exporting', async () => {
    const after = await stored(design.id)
    assert.equal(after.revision, original.revision); assert.deepEqual(after.document, original.document)
    ok(`revision ${after.revision} and document identical after three exports`)
  })

  await step('cancel mid-export, then export again', async () => {
    await a.getByRole('button', { name: 'Descargar' }).click()
    const dialog = a.getByRole('dialog').last()
    await dialog.getByRole('radio', { name: /^Video WebM/ }).click()
    await dialog.getByRole('button', { name: 'Descargar', exact: true }).click()
    await a.getByRole('button', { name: 'Exportar WEBM' }).click()
    await until(async () => Number((await a.locator('[data-progress]').first().innerText({ timeout: 200 })).replace(' %', '')) >= 10, 'progress 10 %', 120000)
    let downloaded = false
    a.once('download', () => { downloaded = true })
    await a.getByRole('status').getByRole('button', { name: 'Cancelar' }).click()
    await a.getByText('Descarga cancelada. No se guardó ningún archivo.').waitFor()
    await sleep(4000)
    assert.equal(downloaded, false)
    const canvases = await a.evaluate(() => document.querySelectorAll('canvas').length)
    const again = await exportFrom(a, 'webm', 'Video WebM')
    assert.ok(webmInfo(again.bytes).frames >= 224)
    ok(`cancel at ≥10 % stops without a file; ${canvases} canvases on the page afterwards; the next export works (${(again.elapsed / 1000).toFixed(1)} s)`)
  })

  await step('errors are explained before starting', async () => {
    await a.getByRole('button', { name: 'Descargar' }).click()
    const dialog = a.getByRole('dialog').last()
    await dialog.getByRole('radio', { name: /^GIF animado/ }).click()
    await dialog.getByRole('radio', { name: 'Rango' }).click()
    await dialog.getByLabel('Rango de páginas').fill('9')
    await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.getByRole('alert').count(), 1, 'the message is shown once')
    assert.equal(await dialog.getByRole('button', { name: 'Descargar', exact: true }).isDisabled(), true)
    ok(`invalid range: "${await dialog.getByRole('alert').innerText()}" (once) and Descargar disabled`)
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
  })

  await step('fallback encoding without WebCodecs (ffmpeg.wasm libx264) still produces a valid MP4', async () => {
    const plain = await openEditor(users.owner, design.id)
    await plain.context.addInitScript(() => { delete window.VideoEncoder })
    await plain.page.reload(); await plain.page.getByRole('button', { name: /Deshacer/ }).waitFor({ timeout: 60000 })
    assert.equal(await plain.page.evaluate(() => typeof window.VideoEncoder), 'undefined')
    const file = await exportFrom(plain.page, 'mp4', 'Video MP4', async dialog => { await dialog.getByText('codificación compatible más lenta').waitFor() })
    const info = mp4Info(file.bytes), played = await (async () => { const viewer = await a.context().newPage(); try { await viewer.setContent('<body></body>'); return await viewer.evaluate(async base64 => { const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'video/mp4' })); await new Promise((ok, fail) => { v.onloadedmetadata = ok; v.onerror = fail }); return { w: v.videoWidth, d: v.duration } }, Buffer.from(file.bytes).toString('base64')) } finally { await viewer.close() } })()
    assert.deepEqual([info.width, info.height], [1280, 720]); assert.ok(Math.abs(info.frames - 225) <= 1); assert.ok(Math.abs(played.d - 7.5) <= 0.1)
    await writeFile(join(OUT, 'aceptacion-respaldo.mp4'), file.bytes)
    ok(`fallback MP4 (no VideoEncoder): ${info.frames} frames ${info.width}×${info.height}, plays ${played.d.toFixed(2)} s in Chrome; ${(file.elapsed / 1000).toFixed(1)} s, peak heap +${file.peakMiB.toFixed(0)} MiB`)
    await plain.context.close()
  })

  await step('a read-only collaborator exports with the private photo authorized', async () => {
    const viewer = await openEditor(users.viewer, design.id)
    const file = await exportFrom(viewer.page, 'mp4', 'Video MP4')
    const info = mp4Info(file.bytes)
    const photoPoint = toVideo('page-1', info.width, info.height)[2]
    const [pixel] = await decodedPixels(file, 'mp4', { seconds: (30 + 0.5) / 30 }, [photoPoint])
    assert.ok(Math.abs(pixel[0] - 20) < 30 && Math.abs(pixel[1] - 184) < 30 && Math.abs(pixel[2] - 166) < 30, `photo pixel ${pixel}`)
    ok(`viewer export includes the private photo (pixel ${pixel}) through the design's image authorization`)
    await viewer.context.close()
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`)
  ok('no uncaught page errors')
} catch (error) {
  report.fatal(error)
} finally {
  await ctx.close()
  report.finish()
}
