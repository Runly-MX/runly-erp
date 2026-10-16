import { useState } from 'react'
import { Button, ErrorState, Skeleton, cn } from '@runly/ui'
import { AlertTriangle, ChevronLeft, ChevronRight, ScanLine } from 'lucide-react'
import { SegmentTabs } from './studio-ui.jsx'

const ZOOMS = [
  { value: 'fit', label: 'Ajustar' },
  { value: '1', label: 'Real' },
  { value: '2', label: '200 %' },
]

// Live PNG of one label as the API renders it, at its true proportions.
// "Real" shows it at physical size (CSS millimetres), "200 %" doubled.
// preview: { url, loading, error, overflow }; item: the asset being previewed.
export function LabelLivePreview({
  preview, draft, item, index = 0, count = 0, onIndex, sample = false, blockedReason = null, compact = false, hideTitle = false,
}) {
  const [zoom, setZoom] = useState('fit')
  const w = Number(draft.widthMm) || 60
  const h = Number(draft.heightMm) || 40
  const scaled = zoom !== 'fit'
  const size = scaled ? { width: `${w * Number(zoom)}mm`, height: `${h * Number(zoom)}mm` } : { aspectRatio: `${w} / ${h}` }

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

      <div className={cn(
        'relative flex items-center justify-center overflow-auto rounded-md border border-[hsl(var(--border))]',
        'bg-[hsl(var(--muted)/0.55)] bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:12px_12px]',
        compact ? 'h-40 p-3' : 'h-52 p-4 lg:h-44',
      )}>
        {!item ? (
          <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            <ScanLine className="h-6 w-6" aria-hidden="true" />
            Selecciona activos para ver su etiqueta.
          </div>
        ) : blockedReason ? (
          <p className="px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">{blockedReason}</p>
        ) : preview.error && !preview.url ? (
          <ErrorState title="Sin vista previa" description={preview.error} showReport={false} className="py-6" />
        ) : (
          <div className={cn('relative', scaled ? 'shrink-0' : 'max-h-full max-w-full')}
            style={scaled ? size : { ...size, width: w >= h ? '100%' : 'auto', height: w >= h ? 'auto' : '100%' }}>
            {preview.url ? (
              <img src={preview.url} alt={`Etiqueta de ${item.name ?? item.folio ?? 'equipo'}`}
                className={cn('h-full w-full rounded-[2px] bg-white object-contain shadow-md ring-1 ring-black/10 transition-opacity motion-reduce:transition-none', preview.loading && 'opacity-60')} />
            ) : <Skeleton className="h-full w-full rounded-[2px]" />}
          </div>
        )}
      </div>

      {item ? (
        <div className="flex items-center gap-2">
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
