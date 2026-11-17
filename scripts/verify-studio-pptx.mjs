// Studio Next phase 5 verification: editable PowerPoint export on a disposable stack.
// The .pptx comes from the real Download dialog; its OOXML is read here; an isolated Office
// (Collabora Online = LibreOffice core) renders it and re-saves edited copies; pdf.js draws
// the rendered pages in Chrome to compare them with Studio's own PNG export.
// Usage: node scripts/verify-studio-pptx.mjs --api-image=<tag> --office-url=http://127.0.0.1:<port> [--keep] [--only=<text>]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { appendObject, blankDocument } from '../apps/shared/studio/document.js'
import { acceptanceDocument } from './fixtures/studio/acceptance-project.mjs'
import { apiImageFromArgs, createReport, startPresentStack, until } from './fixtures/studio/present-stack.mjs'

const require = createRequire(resolve('apps/desktop/package.json'))
const JSZip = require('jszip'), sharp = createRequire(resolve('apps/api/package.json'))('sharp')
const office = process.argv.find(value => value.startsWith('--office-url='))?.slice(13)
if (!office || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(office)) throw Error('Usa --office-url=http://127.0.0.1:<puerto> de una instancia Collabora desechable.')
const report = createReport(), { ok, step } = report
const OUT = resolve('.artifacts/studio/pptx'); await mkdir(OUT, { recursive: true })
const ctx = await startPresentStack({ apiImage: apiImageFromArgs(), shots: join(OUT, 'shots') })
const { users, stored, uploadPhoto, createDesign, openEditor, pageErrors } = ctx
const EMU = 914400

async function convert(bytes, format) {
  const form = new FormData(); form.set('data', new Blob([bytes]), 'studio.pptx')
  const response = await fetch(`${office}/cool/convert-to/${format}`, { method: 'POST', body: form })
  assert.equal(response.status, 200, `Office convert-to ${format}`)
  return new Uint8Array(await response.arrayBuffer())
}
const slideXml = async (zip, n) => zip.file(`ppt/slides/slide${n}.xml`).async('string')
const elements = xml => [...xml.matchAll(/<p:(sp|pic)>[\s\S]*?<\/p:\1>/g)].map(([block, kind]) => ({ kind, text: [...block.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join(' '), geometry: /prst="(\w+)"/.exec(block)?.[1] ?? (block.includes('<a:custGeom>') ? 'custGeom' : null), fill: /<a:solidFill><a:srgbClr val="(\w{6})"/.exec(block)?.[1] ?? null, video: block.includes('videoFile'), off: /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(block)?.slice(1).map(Number), rot: Number(/rot="(\d+)"/.exec(block)?.[1] ?? 0) }))

try {
  const photo = await uploadPhoto('#14b8a6', 'foto-privada.png')
  const design = await createDesign('Proyecto de aceptación', acceptanceDocument(photo.id), [[users.viewer, 'VIEWER']])
  const original = await stored(design.id)
  ok('acceptance project reused (3 pages: 16:9 dark, square with fade, 16:9 with slide; private photo, texts, shapes, effects and keyframes)')
  const { page: a } = await openEditor(users.owner, design.id)

  async function exportPptx(target, { video = false, range = null } = {}) {
    await target.getByRole('button', { name: 'Descargar' }).click()
    const dialog = target.getByRole('dialog').last()
    await dialog.getByRole('radio', { name: /^PowerPoint/ }).click()
    if (range) { await dialog.getByRole('radio', { name: 'Rango' }).click(); await dialog.getByLabel('Rango de páginas').fill(range) } else if (await dialog.getByRole('radio', { name: /^Todas/ }).count()) await dialog.getByRole('radio', { name: /^Todas/ }).click()
    const box = dialog.getByLabel('Añadir una diapositiva con la reproducción animada (MP4)')
    if ((await box.isChecked()) !== video) await dialog.getByText('Añadir una diapositiva con la reproducción animada (MP4)').click()
    const summary = await dialog.getByRole('region', { name: 'Compatibilidad con PowerPoint' }).innerText()
    const started = Date.now(), download = target.waitForEvent('download', { timeout: 300_000 })
    await dialog.getByRole('button', { name: 'Descargar', exact: true }).click()
    await target.getByRole('button', { name: 'Exportar PPTX' }).click()
    const file = await download, name = video ? 'aceptacion-con-video.pptx' : 'aceptacion.pptx', path = join(OUT, name)
    await file.saveAs(path)
    return { bytes: new Uint8Array(await readFile(path)), name: file.suggestedFilename(), elapsed: Date.now() - started, summary, path }
  }
  // Office PDF → PNG pages with pdf.js inside Chrome (an app-origin page: module blobs and workers allowed).
  const pdfjs = await readFile(resolve('apps/desktop/node_modules/pdfjs-dist/build/pdf.min.mjs'), 'utf8'), worker = await readFile(resolve('apps/desktop/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8')
  async function renderPdf(pdf, width = 1280) {
    return a.evaluate(async ({ base64, pdfjs, worker, width }) => {
      const lib = await import(URL.createObjectURL(new Blob([pdfjs], { type: 'text/javascript' })))
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }))
      const doc = await lib.getDocument({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)) }).promise, pages = []
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n), viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
        const canvas = document.createElement('canvas'); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
        pages.push(canvas.toDataURL('image/png'))
      }
      return pages
    }, { base64: Buffer.from(pdf).toString('base64'), pdfjs, worker, width })
  }
  const pngPixel = async (dataUrl, fx, fy) => { const image = sharp(Buffer.from(dataUrl.split(',')[1], 'base64')), meta = await image.metadata(); const { data } = await image.extract({ left: Math.floor(fx * (meta.width - 1)), top: Math.floor(fy * (meta.height - 1)), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true }); return [...data].slice(0, 3) }
  const near = (actual, expected, label, tolerance) => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance), `${label}: ${actual} vs ${expected}`)

  let file, zip
  await step('export from the dialog: summary and OOXML structure', async () => {
    file = await exportPptx(a)
    assert.match(file.name, /\.pptx$/)
    zip = await JSZip.loadAsync(file.bytes)
    const presentation = await zip.file('ppt/presentation.xml').async('string')
    const [cx, cy] = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(presentation).slice(1).map(Number)
    assert.ok(Math.abs(cx / EMU - 13.333) < 0.01 && Math.abs(cx / cy - 16 / 9) < 0.001, `slide ${cx}×${cy}`)
    assert.equal((presentation.match(/<p:sldId /g) ?? []).length, 3)
    const slides = await Promise.all([1, 2, 3].map(async n => elements(await slideXml(zip, n))))
    assert.deepEqual(slides.map(list => list.map(e => e.kind + (e.geometry ? `:${e.geometry}` : '') + (e.text ? `:${e.text}` : ''))), [
      ['pic:rect', 'sp:rect:Studio Next', 'sp:rect'], ['sp:rect', 'sp:ellipse', 'sp:rect:Página cuadrada'], ['pic:rect', 'sp:rect']])
    assert.equal(slides[0][2].fill, 'EF4444'); assert.equal(slides[1][0].fill, 'FDE68A'); assert.equal(slides[2][1].fill, '2563EB')
    const transitions = await Promise.all([1, 2, 3].map(async n => /<p:transition[^>]*>.*?<\/p:transition>/.exec(await slideXml(zip, n))[0]))
    assert.deepEqual(transitions, ['<p:transition advTm="3000"><p:cut/></p:transition>', '<p:transition spd="fast" advTm="2000"><p:fade/></p:transition>', '<p:transition advTm="2500"><p:cut/></p:transition>'])
    assert.match(file.summary, /1 transición de fundido/); assert.match(file.summary, /Una transición de deslizar o acercar no se exporta/)
    const media = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !zip.files[name].dir)
    const images = await Promise.all(media.map(async name => sharp(await zip.file(name).async('nodebuffer')).metadata()))
    assert.ok(images.some(meta => meta.width === 800 && meta.height === 600), 'the private photo is embedded at its original size')
    const xml = (await Promise.all(Object.keys(zip.files).filter(name => /\.(xml|rels)$/.test(name)).map(name => zip.file(name).async('string')))).join('')
    assert.ok(!/https?:\/\/(?!schemas\.|purl\.org|www\.w3\.org)/.test(xml) && !/token|signature=|X-Amz/i.test(xml), 'no URLs, tokens or signatures')
    assert.match(file.summary, /3 diapositivas · 7 elementos editables/)
    await writeFile(join(OUT, 'estructura.json'), JSON.stringify(slides, null, 1))
    ok(`${file.name}: ${(file.bytes.length / 1e3).toFixed(0)} kB in ${(file.elapsed / 1000).toFixed(1)} s; 3 slides 16:9 in page order; slide 1 photo + text + rectangle, slide 2 page background rectangle + ellipse + text, slide 3 photo + rectangle; transitions: page 2 fade, page 3 slide declared as not exported (cut), autoplay 3/2/2,5 s; photo embedded 800×600; no URLs or tokens; dialog: "${file.summary.split('\n')[0]}"`)
  })

  let rendered
  await step('Office opens and renders the three slides like Studio', async () => {
    const pdf = await convert(file.bytes, 'pdf')
    assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-')
    rendered = await renderPdf(pdf)
    assert.equal(rendered.length, 3)
    rendered.forEach((png, i) => writeFile(join(OUT, `office-diapositiva-${i + 1}.png`), Buffer.from(png.split(',')[1], 'base64')))
    // Studio references: the editor's own PNG export of each page (design state).
    const references = []
    for (let n = 1; n <= 3; n++) {
      if (n > 1) { await a.getByRole('group', { name: 'Navegación entre páginas' }).getByRole('button', { name: /Página siguiente/ }).click(); await a.waitForTimeout(500) }
      await a.getByRole('button', { name: 'Descargar' }).click()
      const dialog = a.getByRole('dialog').last()
      await dialog.getByRole('radio', { name: /^PNG/ }).click()
      const download = a.waitForEvent('download', { timeout: 60000 })
      await dialog.getByRole('button', { name: 'Descargar', exact: true }).click(); await a.getByRole('button', { name: 'Exportar PNG' }).click()
      const path = join(OUT, `studio-pagina-${n}.png`); await (await download).saveAs(path)
      references.push(`data:image/png;base64,${(await readFile(path)).toString('base64')}`)
    }
    // Page fraction → slide fraction (square page centred in the 16:9 slide).
    const map = (n, fx, fy) => (n === 2 ? [(1 - 9 / 16) / 2 + fx * 9 / 16, fy] : [fx, fy])
    const points = { 1: [[0.8, 0.72], [0.2, 0.55], [0.5, 0.95], [0.08, 0.12]], 2: [[0.5, 0.5], [0.1, 0.1], [0.5, 0.25]], 3: [[0.29, 0.5], [0.75, 0.33], [0.95, 0.9]] }
    let compared = 0, worst = 0
    for (const n of [1, 2, 3]) for (const [fx, fy] of points[n]) {
      const studio = await pngPixel(references[n - 1], fx, fy), [sx, sy] = map(n, fx, fy), officePixel = await pngPixel(rendered[n - 1], sx, sy)
      const diff = Math.max(...officePixel.map((v, c) => Math.abs(v - studio[c]))); worst = Math.max(worst, diff); compared++
      near(officePixel, studio, `slide ${n} at ${fx},${fy}`, 16)
    }
    near(await pngPixel(rendered[1], 0.05, 0.5), [0, 0, 0], 'black bar beside the square page', 6)
    await sharp({ create: { width: 1280 * 2 + 16, height: 720 * 3 + 32, channels: 3, background: '#ffffff' } })
      .composite((await Promise.all([1, 2, 3].map(async n => [
        { input: await sharp(Buffer.from(references[n - 1].split(',')[1], 'base64')).resize(n === 2 ? 720 : 1280, 720).png().toBuffer(), left: n === 2 ? 280 : 0, top: (n - 1) * 736 },
        { input: Buffer.from(rendered[n - 1].split(',')[1], 'base64'), left: 1296, top: (n - 1) * 736 }]))).flat())
      .png().toFile(join(OUT, 'comparacion-studio-vs-office.png'))
    ok(`Collabora renders 3 pages; ${compared} points match Studio's PNG export (worst diff ${worst}); the square page keeps its proportion with black bars; side-by-side image saved`)
  })

  await step('edit in the file and re-save with Office: text, color and position persist independently', async () => {
    const edited = await JSZip.loadAsync(file.bytes)
    let xml = await slideXml(edited, 1)
    xml = xml.replace('<a:t>Studio Next</a:t>', '<a:t>Editado en Office</a:t>').replace('<a:srgbClr val="EF4444"', '<a:srgbClr val="16A34A"')
    const rect = elements(xml)[2]
    xml = xml.replace(`<a:off x="${rect.off[0]}" y="${rect.off[1]}"/>`, `<a:off x="${rect.off[0] + EMU}" y="${rect.off[1]}"/>`)
    edited.file('ppt/slides/slide1.xml', xml)
    const resaved = await convert(await edited.generateAsync({ type: 'uint8array' }), 'pptx')
    await writeFile(join(OUT, 'editado-y-guardado-por-office.pptx'), resaved)
    const back = await JSZip.loadAsync(resaved), after = elements(await back.file('ppt/slides/slide1.xml').async('string'))
    const text = after.find(e => e.text.includes('Editado en Office')), shape = after.find(e => e.fill === '16A34A'), others = after.filter(e => e !== text && e !== shape)
    assert.ok(text && text.kind === 'sp', 'edited text is still a text shape after Office saves it')
    assert.ok(shape && Math.abs(shape.off[0] - (rect.off[0] + EMU)) < EMU / 100, 'recoloured shape moved 1 inch')
    assert.equal(others.filter(e => e.kind === 'pic').length, 1, 'photo still its own picture')
    const pages = await renderPdf(await convert(resaved, 'pdf'))
    near(await pngPixel(pages[0], (rect.off[0] + EMU) / (13.333 * EMU) + 0.05, 0.55), [22, 163, 74], 'green shape at its new place', 20)
    near(await pngPixel(pages[0], 0.8, 0.72), await pngPixel(rendered[0], 0.8, 0.72), 'photo untouched', 6)
    await writeFile(join(OUT, 'office-editado-diapositiva-1.png'), Buffer.from(pages[0].split(',')[1], 'base64'))
    ok('Office re-saves the edited file: the new text is still editable text, the recoloured shape moved alone, the photo is still its own image; the render shows the change')
  })

  await step('transitions after an Office round-trip', async () => {
    const back = await JSZip.loadAsync(await convert(file.bytes, 'pptx'))
    const found = await Promise.all([1, 2, 3].map(async n => /<p:transition[\s\S]*?<\/p:transition>|<p:transition[^>]*\/>/.exec(await back.file(`ppt/slides/slide${n}.xml`).async('string'))?.[0] ?? 'ninguna'))
    assert.match(found[1], /advTm="2000"><p:fade/, 'the fade and its time survive')
    ok(`after Office re-saves: slide 1 ${found[0]}, slide 2 ${found[1].slice(0, 50)}…, slide 3 ${found[2]} (LibreOffice drops <p:cut/> and its advance time; documented)`)
  })

  await step('optional animated slide with the MP4 of the presentation', async () => {
    const withVideo = await exportPptx(a, { video: true })
    const z = await JSZip.loadAsync(withVideo.bytes)
    const presentation = await z.file('ppt/presentation.xml').async('string')
    assert.equal((presentation.match(/<p:sldId /g) ?? []).length, 4)
    const last = elements(await z.file('ppt/slides/slide4.xml').async('string'))
    assert.ok(last.some(e => e.video), 'slide 4 holds a video')
    const mp4 = Object.keys(z.files).find(name => /^ppt\/media\/.*\.mp4$/.test(name))
    const bytes = await z.file(mp4).async('uint8array')
    assert.equal(Buffer.from(bytes.subarray(4, 8)).toString(), 'ftyp', 'embedded MP4')
    const editableStill = (await Promise.all([1, 2, 3].map(async n => elements(await z.file(`ppt/slides/slide${n}.xml`).async('string')).length))).reduce((x, y) => x + y)
    assert.equal(editableStill, 8, 'editable slides unchanged')
    const pdf = await convert(withVideo.bytes, 'pdf'), pages = await renderPdf(pdf)
    const back = await JSZip.loadAsync(await convert(withVideo.bytes, 'pptx'))
    const kept = Object.keys(back.files).some(name => /\.mp4$/.test(name)), poster = await pngPixel(pages[3], 0.5, 0.5)
    await writeFile(join(OUT, 'office-diapositiva-video.png'), Buffer.from(pages[3].split(',')[1], 'base64'))
    ok(`with video: ${(withVideo.bytes.length / 1e6).toFixed(2)} MB (+${((withVideo.bytes.length - file.bytes.length) / 1e6).toFixed(2)} MB) in ${(withVideo.elapsed / 1000).toFixed(1)} s; 4th slide with the embedded MP4 (${(bytes.length / 1e6).toFixed(2)} MB); Office opens it (4 pages, poster pixel ${poster}); after Office re-saves the video is ${kept ? 'kept' : 'DROPPED'}`)
    assert.ok(kept, 'Office keeps the embedded video when re-saving')
  })

  await step('a v7 design without animations exports and opens', async () => {
    let doc = appendObject(blankDocument(1080, 1350), 'text', { text: 'Diseño v7', fontSize: 90, width: 800, height: 120, fill: '#111827' })
    doc = appendObject(doc, 'ellipse', { x: 300, y: 500, width: 480, height: 480, fill: '#f97316' })
    const legacy = await createDesign('Diseño v7', doc)
    assert.equal((await stored(legacy.id)).document.schemaVersion, 7)
    const page = await openEditor(users.owner, legacy.id)
    const v7 = await exportPptx(page.page)
    const z = await JSZip.loadAsync(v7.bytes), list = elements(await z.file('ppt/slides/slide1.xml').async('string'))
    assert.deepEqual(list.map(e => e.kind + ':' + e.geometry), ['sp:rect', 'sp:ellipse'])
    const presentation = await z.file('ppt/presentation.xml').async('string'), [cx, cy] = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(presentation).slice(1).map(Number)
    assert.ok(Math.abs(cx / cy - 1080 / 1350) < 0.001 && Math.abs(cy / EMU - 13.333) < 0.01, 'portrait slide')
    assert.equal((await renderPdf(await convert(v7.bytes, 'pdf'))).length, 1)
    assert.equal((await stored(legacy.id)).document.schemaVersion, 7, 'still v7')
    await page.context.close()
    ok('v7 portrait design → portrait slide 4:5 with editable text and ellipse; Office opens it; the design stays v7')
  })

  await step('read-only export, cancellation and errors', async () => {
    const viewer = await openEditor(users.viewer, design.id)
    const fromViewer = await exportPptx(viewer.page)
    const z = await JSZip.loadAsync(fromViewer.bytes), media = Object.keys(z.files).filter(name => name.startsWith('ppt/media/') && !z.files[name].dir)
    assert.ok((await Promise.all(media.map(async name => sharp(await z.file(name).async('nodebuffer')).metadata()))).some(meta => meta.width === 800))
    await viewer.context.close()
    await a.getByRole('button', { name: 'Descargar' }).click()
    const dialog = a.getByRole('dialog').last()
    await dialog.getByRole('radio', { name: /^PowerPoint/ }).click()
    await dialog.getByRole('radio', { name: 'Rango' }).click(); await dialog.getByLabel('Rango de páginas').fill('7')
    await dialog.getByRole('alert').first().waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Descargar', exact: true }).isDisabled(), true)
    await dialog.getByRole('radio', { name: /^Todas/ }).click()
    const box = dialog.getByLabel('Añadir una diapositiva con la reproducción animada (MP4)'); if (!(await box.isChecked())) await dialog.getByText('Añadir una diapositiva con la reproducción animada (MP4)').click()
    await dialog.getByRole('button', { name: 'Descargar', exact: true }).click(); await a.getByRole('button', { name: 'Exportar PPTX' }).click()
    await until(async () => Number((await a.locator('[data-progress]').first().innerText({ timeout: 200 })).replace(' %', '')) >= 5, 'progress', 60000)
    let downloaded = false
    a.once('download', () => { downloaded = true })
    await a.getByRole('status').getByRole('button', { name: 'Cancelar' }).click()
    await a.getByText('Descarga cancelada. No se guardó ningún archivo.').waitFor()
    await a.waitForTimeout(3000)
    assert.equal(downloaded, false)
    const after = await stored(design.id)
    assert.equal(after.revision, original.revision); assert.deepEqual(after.document, original.document)
    ok('viewer exports with the private photo embedded; an invalid range disables Descargar; cancelling the video export leaves no file; the design is unchanged')
  })

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`)
  ok('no uncaught page errors')
} catch (error) {
  report.fatal(error)
} finally {
  await ctx.close()
  report.finish()
}
