import { useLayoutEffect, useRef, useState } from 'react'
import { Button, ErrorState, cn } from '@runly/ui'
import { AlertTriangle, ChevronLeft, ChevronRight, ScanLine } from 'lucide-react'
import { SegmentTabs } from './studio-ui.jsx'

const ZOOMS = [
  { value: 'fit', label: 'Ajustar' },
  { value: '1', label: 'Real' },
  { value: '2', label: '200 %' },
]
const PX_PER_MM = 96 / 25.4

// Content-box size of the preview viewport, tracked with a ResizeObserver.
function useContentBox() {
  const ref = useRef(null)
  const [box, setBox] = useState(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => {
      const cs = getComputedStyle(el)
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      setBox((prev) => (prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, box]
}

// Box (px) of the label: "Ajustar" contains it in the viewport keeping its
// proportions; "Real" is the physical size (CSS millimetres), "200 %" doubled.
export function previewBoxSize(zoom, widthMm, heightMm, box) {
  if (zoom !== 'fit') return { width: widthMm * PX_PER_MM * Number(zoom), height: heightMm * PX_PER_MM * Number(zoom) }
  if (!box) return null
  const s = Math.max(0, Math.min(box.w / widthMm, box.h / heightMm))
  return { width: Math.floor(widthMm * s), height: Math.floor(heightMm * s) }
}

// Live SVG of one label (same geometry and SVG as the API renders, computed in
// the browser: lib/label-preview.js), at its true proportions, in a
// fixed-height viewport. "Ajustar" never scrolls; "Real" and "200 %" scroll
// only inside the viewport (native scrollbar), and only when the label is larger.
// preview: { svg, error, overflow }; item: the asset being previewed.
export function LabelLivePreview({
  preview, draft, item, index = 0, count = 0, onIndex, sample = false, blockedReason = null, compact = false, hideTitle = false,
}) {
  const [zoom, setZoom] = useState('fit')
  const [viewportRef, box] = useContentBox()
  const w = Number(draft.widthMm) || 60
  const h = Number(draft.heightMm) || 40
  const size = previewBoxSize(zoom, w, h, box) ?? { width: '100%', maxHeight: '100%', aspectRatio: `${w} / ${h}` }
  const overflowing = zoom !== 'fit' && Boolean(box) && (size.width > box.w + 0.5 || size.height > box.h + 0.5)
  const showImage = item && !blockedReason && Boolean(preview.svg)

  return (
    <div className="flex flex-col gap-3">
      {!compact ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {!hideTitle ? <h2 className="text-sm font-semibold">Vista previa</h2> : null}
            <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{w} × {h} mm · {draft.dpi} dpi</p>
          </div>
          <SegmentTabs ariaLabel="Zoom de la vista previa" options={ZOOMS} value={zoom} onChange={setZoom} size="sm" className="w-52 shrink-0" />
        </div>
      ) : null}

      <div className="relative">
        <div ref={viewportRef} tabIndex={overflowing ? 0 : undefined}
          aria-label={overflowing ? 'Vista previa ampliada' : undefined}
          className={cn(
            'flex rounded-md border border-[hsl(var(--border))]',
            'bg-[hsl(var(--muted)/0.55)] bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:12px_12px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
            overflowing ? 'overflow-auto overscroll-contain' : 'overflow-hidden',
            compact ? 'h-40 p-3' : 'h-52 p-4 lg:h-44',
          )}>
          {!item ? (
            <div className="m-auto flex flex-col items-center gap-2 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
              <ScanLine className="h-6 w-6" aria-hidden="true" />
              Selecciona activos para ver su etiqueta.
            </div>
          ) : blockedReason ? (
            <p className="m-auto px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">{blockedReason}</p>
          ) : !showImage ? (
            <ErrorState title="Sin vista previa" description={preview.error} showReport={false} className="m-auto py-6" />
          ) : (
            // m-auto centres the label yet lets an oversized one scroll from its top-left corner.
            <div className="relative m-auto shrink-0" style={size}>
              {/* The SVG comes from renderLabelSvg, which escapes every text value. */}
              <div role="img" aria-label={`Etiqueta de ${item.name ?? item.folio ?? 'equipo'}`}
                className="h-full w-full overflow-hidden rounded-[2px] bg-white shadow-md ring-1 ring-black/10 [&>svg]:block"
                dangerouslySetInnerHTML={{ __html: preview.svg }} />
            </div>
          )}
        </div>
      </div>

      {item ? (
        <div className="flex min-h-10 items-center gap-2">
          {count > 1 ? (
            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Etiqueta anterior"
              disabled={index <= 0} onClick={() => onIndex(index - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-medium">{item.name ?? '—'}</p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
              {sample ? 'Ejemplo con el primer resultado' : count > 1 ? `Etiqueta ${index + 1} de ${count}` : item.folio ?? ''}
            </p>
          </div>
          {count > 1 ? (
            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Etiqueta siguiente"
              disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {item && !blockedReason && preview.overflow > 0 ? (
        <p role="status" className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          El texto no cabe completo y se recorta. Quita campos, baja el tamaño del texto o usa una etiqueta más grande.
        </p>
      ) : null}
      {draft.qrOptions?.contentMode === 'embedded' && !['text-only'].includes(draft.layout) ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          El QR guarda folio, serie y modelo como texto: si el equipo cambia, la etiqueta queda desactualizada.
        </p>
      ) : null}
    </div>
  )
}
