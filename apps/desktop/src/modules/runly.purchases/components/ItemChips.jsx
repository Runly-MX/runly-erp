import { Boxes } from 'lucide-react'
import { cn } from '@runly/ui'

// Inventory items behind a document, identified the way people look for them:
// asset number first, serial number under it. `items` is the list payload
// { count, preview: [{ id, assetTag, serialNumber, name }] }.
export function ItemChips({ items, max = 2, className }) {
  const count = items?.count ?? 0
  if (!count) return <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin activos</span>
  const shown = (items.preview ?? []).slice(0, max)
  const rest = count - shown.length
  return (
    <ul className={cn('space-y-1', className)}>
      {shown.map((item) => (
        <li key={item.id} className="flex min-w-0 items-center gap-1.5 text-xs">
          <Boxes className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
          <span className="truncate">
            <span className="font-medium tabular-nums">{item.assetTag || item.name}</span>
            {item.serialNumber ? <span className="text-[hsl(var(--muted-foreground))]">{`  S/N ${item.serialNumber}`}</span> : null}
          </span>
        </li>
      ))}
      {rest > 0 ? <li className="pl-5 text-xs text-[hsl(var(--muted-foreground))]">{`+${rest} más`}</li> : null}
    </ul>
  )
}
