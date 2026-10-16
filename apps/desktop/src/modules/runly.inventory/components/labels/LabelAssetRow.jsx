import { memo } from 'react'
import { Checkbox, NumberStepper, cn } from '@runly/ui'
import { MAX_QUANTITY } from '../../lib/label-queue.js'
import { AssetMatchContext, AssetThumb } from '../AssetSearchParts.jsx'
import { LabelStateBadge } from './LabelStateBadge.jsx'

// One selectable asset: the whole row toggles; copies appear once selected.
// Selected = flat fill (no ring).
export const LabelAssetRow = memo(function LabelAssetRow({ item, selected, quantity, coverUrl, search, disabled, onToggle, onQuantity }) {
  const meta = [item.serialNumber && `S/N ${item.serialNumber}`, item.categoryName, item.locationName].filter(Boolean)
  const name = item.name ?? item.folio ?? 'Equipo'
  return (
    <li className={cn('flex items-center gap-1 pr-2 transition-colors sm:pr-3', selected ? 'bg-(--brand-soft)' : 'hover:bg-[hsl(var(--muted)/0.5)]')}>
      <label className="flex min-h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pl-3 sm:pl-4">
        <Checkbox checked={selected} disabled={disabled} onCheckedChange={() => onToggle(item)} aria-label={`Seleccionar ${name}`} className="size-5" />
        <AssetThumb url={coverUrl} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {item.folio ? <span className="font-mono text-[hsl(var(--foreground)/0.8)]">{item.folio}</span> : null}
            {meta.map((m) => <span key={m} className="truncate">{m}</span>)}
          </span>
          <AssetMatchContext item={item} search={search} />
        </span>
      </label>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <LabelStateBadge labelPrintCount={item.labelPrintCount} labelPrintedAt={item.labelPrintedAt} className="hidden whitespace-nowrap sm:inline-flex" />
        {selected ? (
          <NumberStepper size="sm" min={1} max={MAX_QUANTITY} value={quantity} disabled={disabled}
            label={`Copias de ${name}`} onChange={(q) => onQuantity(item.id, q)} />
        ) : (
          <LabelStateBadge labelPrintCount={item.labelPrintCount} labelPrintedAt={item.labelPrintedAt} className="whitespace-nowrap sm:hidden" />
        )}
      </div>
    </li>
  )
})
