import { useEffect, useRef } from 'react'
import { SearchX, ScanLine, X } from 'lucide-react'
import { Button, EmptyState, cn } from '@runly/ui'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { ScanThumb } from './ScanResultCard.jsx'

const timeOf = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

// Session list, newest first. The highlighted row (last read, or a duplicate)
// gets a flat fill and is scrolled into view.
export function ScanSessionList({ rows, highlightKey, onRemove, onOpen }) {
  const refs = useRef(new Map())
  useEffect(() => {
    if (!highlightKey) return
    refs.current.get(highlightKey)?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [highlightKey, rows])

  if (!rows.length) {
    return <EmptyState icon={ScanLine} title="Lista vacía" description="Cada equipo que escanees aparece aquí. La lista se conserva mientras esta pestaña siga abierta." />
  }
  return (
    <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Equipos escaneados">
      {rows.map((row) => {
        const item = row.item
        return (
          <li
            key={row.key}
            ref={(el) => { if (el) refs.current.set(row.key, el); else refs.current.delete(row.key) }}
            className={cn('flex min-h-14 items-center gap-3 px-2 py-2 transition-colors motion-reduce:transition-none', row.key === highlightKey && 'bg-[hsl(var(--muted))]')}
          >
            {item ? <ScanThumb fileId={item.coverImageFileId} className="size-11" /> : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-red-50 dark:bg-red-500/10">
                <SearchX className="size-5 text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {item ? (
                <button type="button" onClick={() => onOpen?.(item)} className="block max-w-full truncate text-left text-sm font-medium hover:underline">{item.name}</button>
              ) : (
                <p className="text-sm font-medium text-red-700 dark:text-red-300">No encontrado</p>
              )}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="max-w-full truncate font-mono">{item ? (item.folio ?? item.assetTag ?? item.serialNumber ?? '—') : row.code}</span>
                {item?.locationName ? <span className="truncate">{item.locationName}</span> : null}
                <span>{timeOf(row.lastReadAt ?? row.readAt)}</span>
                {row.reads > 1 ? <span className="font-medium">Leído {row.reads} veces</span> : null}
              </p>
            </div>
            {item ? <span className="hidden sm:inline-flex"><InventoryAdminStatusBadge status={item.adminStatus} /></span> : null}
            <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(row.key)} aria-label={`Quitar ${item?.name ?? row.code} de la lista`}>
              <X />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
