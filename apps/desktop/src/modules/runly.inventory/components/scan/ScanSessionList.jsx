import { useEffect, useMemo, useRef } from 'react'
import { CheckCircle2, ListFilter, ScanLine, SearchX, Trash2, X } from 'lucide-react'
import { Button, EmptyState, cn } from '@runly/ui'
import { useCoverUrls } from '../../hooks/useLabelStudio.js'
import { filterRows } from '../../lib/scan-kiosk.js'
import { AssetThumb } from '../AssetSearchParts.jsx'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { SegmentTabs } from '../labels/studio-ui.jsx'

const timeOf = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

function Row({ row, highlighted, coverUrl, onRemove, onOpen, rowRef }) {
  const item = row.item
  const name = item?.name ?? item?.folio ?? 'Equipo'
  return (
    <li ref={rowRef} className={cn('flex min-h-16 items-center gap-3 py-2 pl-4 pr-2 transition-colors motion-reduce:transition-none', highlighted ? 'bg-(--brand-soft)' : 'hover:bg-[hsl(var(--muted)/0.45)]')}>
      {item ? <AssetThumb url={coverUrl} className="size-10" /> : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-red-500/10">
          <SearchX className="size-5 text-red-700 dark:text-red-300" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {item ? (
          <button type="button" onClick={() => onOpen(item)} className="block max-w-full truncate rounded-sm text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">{name}</button>
        ) : (
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">No encontrado</p>
        )}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="max-w-full truncate font-mono text-[hsl(var(--foreground)/0.8)]">{item ? (item.folio ?? item.assetTag ?? '—') : row.code}</span>
          {item?.serialNumber ? <span className="truncate">S/N {item.serialNumber}</span> : null}
          <span className="tabular-nums">{timeOf(row.lastReadAt ?? row.readAt)}</span>
          {row.reads > 1 ? <span className="font-semibold text-[hsl(var(--foreground))]">Leído {row.reads} veces</span> : null}
        </p>
      </div>
      {item ? <span className="hidden shrink-0 sm:inline-flex"><InventoryAdminStatusBadge status={item.adminStatus} /></span> : null}
      <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 lg:size-9" onClick={() => onRemove(row)} aria-label={`Quitar ${item ? name : row.code} de la lista`}>
        <X className="size-4" />
      </Button>
    </li>
  )
}

// Session list, newest first, with counters, the Todos / No encontrados
// filter and Vaciar. The highlighted row (last read or a
// repeated one) gets a flat fill and is scrolled into view.
export function ScanSessionPanel({ rows, counts, filter, onFilter, highlightKey, onRemove, onOpen, onClear, showTitle = true }) {
  const visible = useMemo(() => filterRows(rows, filter), [rows, filter])
  // One batch request (the API signs up to 50); rows past that show the placeholder.
  const coverIds = useMemo(() => [...new Set(visible.map((r) => r.item?.coverImageFileId).filter(Boolean))].slice(0, 50), [visible])
  const covers = useCoverUrls(coverIds).data ?? {}
  const refs = useRef(new Map())
  useEffect(() => {
    if (!highlightKey) return
    refs.current.get(highlightKey)?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [highlightKey, rows])

  const options = [
    { value: 'all', label: 'Todos', count: counts.total },
    { value: 'missing', label: 'No encontrados', count: counts.unmatched },
  ]
  return (
    <div className="flex min-w-0 flex-col">
      <div className="space-y-3 border-b border-[hsl(var(--border))] p-4">
        {showTitle ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Lista de escaneo</h2>
              <p className="truncate text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
                {counts.matched} {counts.matched === 1 ? 'encontrado' : 'encontrados'} · {counts.unmatched} no {counts.unmatched === 1 ? 'encontrado' : 'encontrados'} · {counts.total} en total
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!rows.length} onClick={onClear}><Trash2 className="mr-1.5 size-4" />Vaciar</Button>
          </div>
        ) : null}
        <SegmentTabs ariaLabel="Filtrar lista" options={options} value={filter} onChange={onFilter} size="sm" />
      </div>
      {!rows.length ? (
        <div className="p-4">
          <EmptyState icon={ScanLine} title="Aún no hay equipos" description="Cada código que escanees o busques aparece aquí. La lista se conserva mientras esta pestaña siga abierta." />
        </div>
      ) : !visible.length ? (
        <div className="p-4">
          <EmptyState icon={filter === 'missing' ? CheckCircle2 : ListFilter}
            title={filter === 'missing' ? 'Todo se encontró' : 'Nada con este filtro'}
            description={filter === 'missing' ? 'Ningún código de la lista quedó sin coincidencia.' : 'Cambia el filtro para ver el resto de la lista.'}
            action={<Button type="button" variant="outline" onClick={() => onFilter('all')}>Ver todos</Button>} />
        </div>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border)/0.6)]" aria-label="Equipos escaneados">
          {visible.map((row) => (
            <Row key={row.key} row={row} highlighted={row.key === highlightKey} coverUrl={covers[row.item?.coverImageFileId]}
              onRemove={onRemove} onOpen={onOpen}
              rowRef={(el) => { if (el) refs.current.set(row.key, el); else refs.current.delete(row.key) }} />
          ))}
        </ul>
      )}
      {!showTitle && rows.length ? (
        <div className="flex justify-center border-t border-[hsl(var(--border))] p-3">
          <Button type="button" variant="ghost" className="h-11" onClick={onClear}><Trash2 className="mr-2 size-4" />Vaciar lista</Button>
        </div>
      ) : null}
    </div>
  )
}
