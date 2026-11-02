import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FILE_STORE_LIMIT_BYTES, fitSize, isDwg, isDxf, isImage, isPdf, maxInsertSide as computeMaxInsertSide, openPdf, readImageSize, renderPdfPage } from '../lib/media.js'
import { rasterizeDxf } from '../lib/dxf.js'
import { mediaTargetLayer } from '../lib/boardTemplates.js'
import { screenToWorld } from '../engine/viewport.js'

// Image, PDF, DXF and DWG insertion. PDFs with several pages go through a page
// picker; every inserted page becomes an image object placed side by side.
// DXF plans are rasterized client-side (lib/dxf.js) and, when the file
// declares its units and the page has no scale yet, auto-calibrate it. DWG is
// converted to DXF once by the server (runly-dwg), then follows the DXF path.
export function useMediaInsert({ upload, convertDwg, viewport, size, drawableLayer, layers, lockLayer, rows, pageId, createRows, fail, calibratePage, hasCalibration }) {
  const [inserting, setInserting] = useState(false)
  const [pdf, setPdf] = useState(null)
  const fileInputRef = useRef(null)

  const viewportCenter = () => screenToWorld({ x: size.width / 2, y: size.height / 2 }, viewport)
  const maxInsertSide = () => computeMaxInsertSide(size, viewport)

  async function placeImages(items, label) {
    // Templates flag a backdrop layer (Plano base, Documento…) for inserted
    // media; a hidden or locked one falls back to the active drawing layer.
    const target = mediaTargetLayer(layers)
    const layer = target && target.visible && !target.locked ? target : drawableLayer()
    if (!layer) throw new Error('No hay una capa de dibujo disponible.')
    if (target && layer !== target) toast.info(`La capa «${target.name}» está ${target.locked ? 'bloqueada' : 'oculta'}; se insertó en la capa activa.`)
    const center = viewportCenter(), gap = 40
    const totalWidth = items.reduce((sum, item) => sum + item.size.width, 0) + gap * (items.length - 1)
    // Images go behind existing shapes so plans work as a backdrop.
    const back = Math.min(0, ...rows.filter((row) => row.layerId === layer.id).map((row) => row.position ?? 0)) - 1
    let x = center.x - totalWidth / 2
    const datas = items.map((item, index) => {
      const data = {
        pageId, layerId: layer.id, type: 'image', position: back - index,
        transform: { x, y: center.y - item.size.height / 2, rotation: 0, scaleX: 1, scaleY: 1 },
        geometry: item.size, style: {}, properties: item.properties,
      }
      x += item.size.width + gap
      return data
    })
    const created = await createRows(datas, label)
    if (layer === target && target.metadata?.lockAfterInsert) await lockLayer(target)
    return created
  }

  async function insertImage(file) {
    const [asset, natural] = await Promise.all([upload.mutateAsync(file), readImageSize(file)])
    await placeImages([{ size: fitSize(natural.width, natural.height, maxInsertSide()), properties: { fileId: asset.id, name: file.name, naturalWidth: natural.width, naturalHeight: natural.height } }], 'Insertar imagen')
  }

  // `dxfText` is the drawing, `source` the original file to keep (null when it
  // cannot be stored), `label` the format name shown to the user.
  async function placeDxfPlan(dxfText, sourceFile, name, label) {
    const [result, source] = await Promise.all([rasterizeDxf(dxfText), sourceFile ? upload.mutateAsync(sourceFile) : null])
    const png = new File([result.blob], `${name.replace(/\.(dxf|dwg)$/i, '')}.png`, { type: 'image/png' })
    const asset = await upload.mutateAsync(png)
    const [created] = await placeImages([{
      size: fitSize(result.width, result.height, maxInsertSide()),
      properties: {
        fileId: asset.id, ...(source ? { sourceFileId: source.id } : {}), name,
        naturalWidth: result.width, naturalHeight: result.height,
        dxf: { unit: result.unit?.unit ?? null, width: result.extents.width, height: result.extents.height },
      },
    }], `Insertar ${label}`)
    if (result.unit && !hasCalibration && created) {
      const { x, y } = created.transform
      calibratePage?.({
        a: { x, y }, b: { x: x + created.geometry.width, y },
        distance: result.extents.width * result.unit.toUnit, unit: result.unit.unit,
      })
      toast.success(`Plano ${label} insertado con escala en ${result.unit.unit}`)
    } else {
      toast.success(`Plano ${label} insertado`)
    }
  }

  async function insertDxf(file) {
    setInserting(true)
    try { await placeDxfPlan(await file.text(), file, file.name, 'DXF') } catch (error) { fail(error) } finally { setInserting(false) }
  }

  async function insertDwg(file) {
    setInserting(true)
    try {
      const dxfText = await convertDwg.mutateAsync(file)
      const keep = file.size <= FILE_STORE_LIMIT_BYTES
      if (!keep) toast.info('El DWG original supera 10 MB y no se conservó; se guardó solo el plano.')
      await placeDxfPlan(dxfText, keep ? file : null, file.name, 'DWG')
    } catch (error) { fail(error) } finally { setInserting(false) }
  }

  async function insertPdfPages(pages, target = pdf) {
    if (!target) return
    setInserting(true)
    try {
      const source = await upload.mutateAsync(target.file)
      const items = []
      for (const number of pages) {
        const page = await renderPdfPage(target.doc, number)
        const png = new File([page.blob], `${target.file.name.replace(/\.pdf$/i, '')}-p${number}.png`, { type: 'image/png' })
        const asset = await upload.mutateAsync(png)
        items.push({
          size: fitSize(page.pointWidth, page.pointHeight, maxInsertSide()),
          properties: { fileId: asset.id, sourceFileId: source.id, name: target.file.name, page: number, naturalWidth: page.width, naturalHeight: page.height },
        })
      }
      await placeImages(items, 'Insertar PDF')
      toast.success(pages.length === 1 ? 'Página insertada' : `${pages.length} páginas insertadas`)
      target.doc.destroy?.(); setPdf(null)
    } catch (error) { fail(error) } finally { setInserting(false) }
  }

  async function handleFile(file) {
    if (!file) return
    if (isDxf(file)) return insertDxf(file)
    if (isDwg(file)) return insertDwg(file)
    if (!isImage(file) && !isPdf(file)) return toast.error('Formato no soportado. Usa una imagen (PNG, JPG, WebP, SVG), un PDF o un plano DXF o DWG.')
    setInserting(true)
    try {
      if (isImage(file)) { await insertImage(file); toast.success('Imagen insertada'); return }
      const doc = await openPdf(file)
      if (doc.numPages === 1) await insertPdfPages([1], { file, doc })
      else setPdf({ file, doc })
    } catch (error) { fail(error) } finally { setInserting(false) }
  }

  return {
    inserting, pdf, fileInputRef, handleFile, insertPdfPages,
    openFilePicker: () => fileInputRef.current?.click(),
    cancelPdf: () => { pdf?.doc.destroy?.(); setPdf(null) },
  }
}
