import { ChevronRight, Unlink } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { ORIGIN_LABELS, documentHref, formatDay, formatMoney, statusMeta } from './InventoryPurchaseMeta.js'

// One purchase document related to an inventory item: opens its detail; the
// side button unlinks it (with the impact preview of UnlinkRelationDialog).
export function InventoryPurchaseDocCard({ doc, onOpen, onUnlink }) {
  const status = statusMeta(doc.status)
  const href = documentHref(doc)
  const origin = ORIGIN_LABELS[doc.origin] ?? null
  const hasTotal = doc.total !== null && doc.total !== undefined && doc.total !== ''
  return (
    <div className="group flex items-stretch overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-colors hover:bg-[hsl(var(--muted))]/40">
      <button
        type="button"
        disabled={!href}
        onClick={() => href && onOpen(href)}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))] disabled:cursor-default"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold text-[hsl(var(--foreground))]">{doc.number || 'Sin folio'}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset', status.className)}>{status.label}</span>
          </div>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
            {[formatDay(doc.date), origin ? `Relación ${origin.toLowerCase()}` : null].filter(Boolean).join(' · ') || 'Sin fecha'}
          </p>
        </div>
        {hasTotal ? <span className="shrink-0 text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{formatMoney(doc.total, doc.currency)}</span> : null}
        {href ? <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5" /> : null}
      </button>
      {onUnlink ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-auto w-11 shrink-0 rounded-none border-l border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-rose-600"
          aria-label={`Quitar relación con ${doc.number || 'el documento'}`}
          title="Quitar relación"
          onClick={() => onUnlink(doc)}
        >
          <Unlink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
