// Assembles the PowerPoint file from Studio pages with pptxgenjs, then adds the slide
// transitions (bounded PresentationML, see pptx-mapping.js). Assets come from a provider:
// the browser supplies authorized originals and per-object images; tests supply stubs.
import { findPage } from '../../../../../shared/studio/pages.js'
import { checkAbort } from '../../../../../shared/studio/abort.js'
import { sceneHasMotion } from '../../../../../shared/studio/motion.js'
import { MAPPED_TRANSITIONS, classify, imageOptions, injectTransition, lineOptions, pageFrame, presentationLayout, shapeOptions, textOptions, transitionXml } from './pptx-mapping.js'

const hex = color => color.replace('#', '').toUpperCase()

// assets: { image(fileAssetId) → dataURL, raster(item, scene) → { data, box: {x,y,width,height} in page px }, background(scene) → dataURL }
// video: optional { data: 'video/mp4;base64,…', cover: dataURL, width, height } added as one extra slide.
export async function buildPptx({ PptxGenJS, JSZip, document, pageIds, title = 'Studio', assets, video = null, signal, onProgress = () => {}, output = 'blob' }) {
  const scenes = pageIds.map(id => findPage(document, id))
  if (!scenes.length || scenes.some(scene => !scene)) throw new Error('Elige páginas existentes del diseño.')
  const layout = presentationLayout(scenes[0].page), pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'STUDIO', ...layout }); pptx.layout = 'STUDIO'; pptx.title = title
  const report = { layout, slides: [], rasterized: [], losses: new Set(), video: false }
  const total = scenes.reduce((n, scene) => n + scene.objects.length, 0) || 1
  let done = 0
  for (const [index, scene] of scenes.entries()) {
    checkAbort(signal)
    const slide = pptx.addSlide(), frame = pageFrame(scene.page, layout), counts = { text: 0, shape: 0, line: 0, image: 0, raster: 0 }
    // Background: slide colour, or black bars plus the page as an editable rectangle; gradients as one background image.
    if (scene.page.backgroundPaint) {
      const data = await assets.background(scene)
      if (frame.letterboxed) { slide.background = { color: '000000' }; slide.addImage({ data, x: frame.x, y: frame.y, w: frame.width, h: frame.height }) } else slide.background = { data }
      report.losses.add('Los fondos degradados se exportan como imagen de fondo.')
    } else if (frame.letterboxed) {
      slide.background = { color: '000000' }
      slide.addShape('rect', { x: frame.x, y: frame.y, w: frame.width, h: frame.height, fill: { color: hex(scene.page.background) }, line: { type: 'none' } })
    } else slide.background = { color: hex(scene.page.background) }
    if (frame.letterboxed) report.losses.add('Las páginas con otra proporción se centran con franjas negras.')
    const transition = index ? scene.page.slide?.transition?.type : null
    if (transition && transition !== 'none' && !MAPPED_TRANSITIONS.includes(transition)) report.losses.add('Solo el fundido se exporta como transición; las de empujar, cubrir, descubrir, barrido, división y zoom no: los programas de presentaciones las interpretan de forma distinta. Esas diapositivas cambian sin efecto.')
    if (new Set(scene.objects.map(item => item.groupId).filter(Boolean)).size) report.losses.add('Los grupos se exportan como elementos independientes (PowerPoint los recibe sin agrupar).')
    if (sceneHasMotion(scene)) report.losses.add('Las animaciones de los elementos no se convierten en animaciones de PowerPoint: cada elemento queda en su posición del diseño.')
    for (const item of scene.objects) {
      checkAbort(signal)
      const { kind, reason } = classify(item)
      if (kind === 'text') { slide.addText(item.text, textOptions(item, frame)); counts.text++ }
      else if (kind === 'shape') { const { shape, options } = shapeOptions(item, frame); slide.addShape(shape, options); counts.shape++ }
      else if (kind === 'line') { const { options, lost } = lineOptions(item, frame); slide.addShape('custGeom', options); lost.forEach(text => report.losses.add(`Algunas líneas pierden su ${text}.`)); counts.line++ }
      else if (kind === 'image') { slide.addImage(imageOptions(item, frame, await assets.image(item.fileAssetId), { fit: item.image?.fit ?? 'cover' })); counts.image++ }
      else if (kind === 'photo-shape') { slide.addImage(imageOptions(item, frame, await assets.image(item.fillPaint.fileAssetId), { fit: item.fillPaint.image?.fit ?? 'cover', rounded: item.type === 'ellipse' })); counts.image++ }
      else if (kind === 'raster') {
        const { data, box } = await assets.raster(item, scene)
        slide.addImage({ data, x: frame.x + box.x * frame.scale, y: frame.y + box.y * frame.scale, w: box.width * frame.scale, h: box.height * frame.scale })
        report.rasterized.push({ page: index + 1, reason }); counts.raster++
      }
      onProgress(++done / total)
    }
    report.slides.push({ pageId: scene.page.id, ...counts, transition: MAPPED_TRANSITIONS.includes(transition) ? transition : 'none' })
  }
  if (video) {
    const slide = pptx.addSlide(), fit = Math.min(layout.width / video.width, layout.height / video.height), w = video.width * fit, h = video.height * fit
    slide.background = { color: '000000' }
    slide.addMedia({ type: 'video', data: video.data, cover: video.cover, extn: 'mp4', x: (layout.width - w) / 2, y: (layout.height - h) / 2, w, h })
    report.video = true
  }
  checkAbort(signal)
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'arraybuffer' }))
  for (const [index, scene] of scenes.entries()) {
    const path = `ppt/slides/slide${index + 1}.xml`
    zip.file(path, injectTransition(await zip.file(path).async('string'), transitionXml(scene.page, { first: index === 0 })))
  }
  const data = await zip.generateAsync({ type: output, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' })
  return { data, report: { ...report, losses: [...report.losses] } }
}
