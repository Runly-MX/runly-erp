import { ErrorState, Skeleton, cn } from '@runly/ui'
import { AlertTriangle, ScanLine } from 'lucide-react'

// Middle panel: PNG of the first label exactly as the API renders it.
export function LabelPreviewPanel({ preview, draft, hasItems, total, compact = false, invalidReason = null }) {
  const ratio = `${Number(draft.widthMm) || 60} / ${Number(draft.heightMm) || 40}`
  return (
    <div className="flex flex-col gap-3">
      <div className={cn(
        'flex items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)]',
        compact ? 'p-3' : 'min-h-[220px] p-6',
      )}>
        {!hasItems ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            <ScanLine className="h-6 w-6" aria-hidden="true" />
            Agrega equipos a la cola para ver la etiqueta.
          </div>
        ) : invalidReason ? (
          <p className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">{invalidReason}</p>
        ) : preview.error && !preview.url ? (
          <ErrorState title="Sin vista previa" description={preview.error} />
        ) : (
          <div className={cn('relative w-full', compact ? 'max-w-[260px]' : 'max-w-[420px]')} style={{ aspectRatio: ratio }}>
            {preview.url ? (
              <img src={preview.url} alt="Vista previa de la etiqueta"
                className={cn('h-full w-full rounded-sm bg-white object-contain shadow-sm ring-1 ring-black/10 transition-opacity', preview.loading && 'opacity-60')} />
            ) : (
              <Skeleton className="h-full w-full rounded-sm" />
            )}
          </div>
        )}
      </div>
      {hasItems && !compact ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {Number(draft.widthMm)} × {Number(draft.heightMm)} mm · se muestra la primera etiqueta de {total}.
        </p>
      ) : null}
      {draft.qrOptions?.contentMode === 'embedded' && draft.layout !== 'text-only' ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          El QR guarda folio, serie y modelo como texto: si el equipo cambia, la etiqueta queda desactualizada.
        </p>
      ) : null}
    </div>
  )
}
