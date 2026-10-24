import { normalizeExportColors } from '../../../lib/exportColorCompatibility.js'

// Client-side export for the public note page's rendered content (the
// `.note-sheet` DOM node — see NoteSheet.jsx). html2canvas is dynamic-
// imported so it never ships in the main bundle; this only runs from the
// public toolbar's Download buttons. Mirrors the raster-then-embed pattern
// already used for canvas notes in canvasExport.js (exportCanvasPdf).

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const safeName = (title) => (title?.trim() || 'nota').replace(/[^\w\-. ]+/g, '_')

async function renderNoteSheetToCanvas(el, backgroundColor) {
  const { default: html2canvas } = await import('html2canvas')
  const layoutWidth = getComputedStyle(el).width
  return html2canvas(el, {
    backgroundColor: backgroundColor || '#ffffff',
    useCORS: true,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    // Preserve this device's wrapping when removing zoom for export.
    // The clone must not reflow to a different width or clip scrolled content.
    onclone: (_document, sheet) => {
      sheet.style.width = layoutWidth
      sheet.style.minWidth = layoutWidth
      sheet.style.maxWidth = 'none'
      sheet.style.minHeight = '0'
      sheet.style.zoom = '1'
      sheet.style.margin = '0'
      // The break marker is an editing affordance, never part of the export.
      sheet.querySelectorAll('.note-page-break').forEach((node) => { node.style.visibility = 'hidden' })
      normalizeExportColors(_document, sheet)
      let ancestor = sheet.parentElement
      while (ancestor && ancestor !== _document.body) {
        ancestor.style.overflow = 'visible'
        ancestor.style.height = 'auto'
        ancestor.style.maxHeight = 'none'
        ancestor.scrollTop = 0
        ancestor.scrollLeft = 0
        ancestor = ancestor.parentElement
      }
    },
  })
}

export async function exportNoteSheetAsJpg(el, { title, backgroundColor } = {}) {
  if (!el) throw new Error('Contenido de la nota no disponible')
  const canvas = await renderNoteSheetToCanvas(el, backgroundColor)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/jpeg', 0.92)
  })
  triggerDownload(blob, `${safeName(title)}.jpg`)
}

// Canvas y-offsets of each explicit page break. The export is one tall raster
// (the PDF page used to be the whole canvas), so with breaks present we cut the
// raster at those offsets and emit one PDF page per segment.
function pageBreakOffsets(el, canvas) {
  const sheetRect = el.getBoundingClientRect()
  if (!sheetRect.height) return []
  const ratio = canvas.height / sheetRect.height
  const offsets = []
  el.querySelectorAll('.note-page-break').forEach((node) => {
    const y = Math.round((node.getBoundingClientRect().top - sheetRect.top) * ratio)
    if (y > 0 && y < canvas.height) offsets.push(y)
  })
  return [...new Set(offsets)].sort((a, b) => a - b)
}

export async function exportNoteSheetAsPdf(el, { title, backgroundColor } = {}) {
  if (!el) throw new Error('Contenido de la nota no disponible')
  const canvas = await renderNoteSheetToCanvas(el, backgroundColor)
  const { jsPDF } = await import('jspdf')
  const w = canvas.width || 1
  const h = canvas.height || 1
  const cuts = [0, ...pageBreakOffsets(el, canvas), h]
  const firstH = cuts[1] - cuts[0]
  const pdf = new jsPDF({
    orientation: w >= firstH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [w, firstH],
    compress: true,
  })
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const segH = cuts[i + 1] - cuts[i]
    const slice = document.createElement('canvas')
    slice.width = w
    slice.height = segH
    const ctx = slice.getContext('2d')
    ctx.fillStyle = backgroundColor || '#ffffff'
    ctx.fillRect(0, 0, w, segH)
    ctx.drawImage(canvas, 0, cuts[i], w, segH, 0, 0, w, segH)
    if (i > 0) pdf.addPage([w, segH], w >= segH ? 'landscape' : 'portrait')
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, segH)
  }
  pdf.save(`${safeName(title)}.pdf`)
}

// Browser print dialog (also "Guardar como PDF"). The print stylesheet in
// runtime.css hides everything but the sheet while body[data-note-print] is set.
export function printNote() {
  const body = document.body
  body.dataset.notePrint = 'true'
  const cleanup = () => {
    delete body.dataset.notePrint
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
