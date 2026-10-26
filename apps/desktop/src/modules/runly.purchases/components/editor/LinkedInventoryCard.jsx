import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Boxes, PackagePlus, X } from 'lucide-react'
import { Button } from '@runly/ui'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { runly } from '../../../../lib/runly.js'
import { InventoryItemPicker } from './InventoryItemPicker.jsx'

// Items picked for the document (sent as inventoryIds on create). Items that
// arrive by id only (?inventoryId=) get their label from runly.inventory.
export function LinkedInventoryCard({ ids = [], onChange, known, onKnown, disabled }) {
  const token = useAuth().session?.access_token
  const [open, setOpen] = useState(false)
  const missing = ids.filter((id) => !known[id])
  const lookups = useQueries({
    queries: missing.map((id) => ({
      queryKey: ['inventory', 'items', id],
      queryFn: () => runly.inventory.getItem(id, token).then((res) => res?.data ?? res),
      enabled: Boolean(token),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  })
  const labelOf = (id) => known[id] ?? lookups[missing.indexOf(id)]?.data ?? null

  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"><Boxes className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">Activos de Inventario</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{ids.length ? `${ids.length} relacionados con este documento` : 'Relaciona los equipos que cubre esta compra'}</p>
          </div>
        </div>
        {!disabled ? <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><PackagePlus className="h-4 w-4" />Elegir</Button> : null}
      </header>
      {ids.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {ids.map((id) => {
            const item = labelOf(id)
            return (
              <li key={id} className="flex max-w-full items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 py-1 pl-3 pr-1 text-xs">
                <span className="truncate font-medium tabular-nums">{item?.assetTag || item?.name || 'Activo'}</span>
                {item?.assetTag && item?.name ? <span className="truncate text-[hsl(var(--muted-foreground))]">{item.name}</span> : null}
                {item?.serialNumber ? <span className="tabular-nums text-[hsl(var(--muted-foreground))]">{`S/N ${item.serialNumber}`}</span> : null}
                {!disabled ? (
                  <button type="button" aria-label={`Quitar ${item?.name ?? 'activo'}`} onClick={() => onChange(ids.filter((x) => x !== id))}
                    className="rounded-full p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      <InventoryItemPicker open={open} onOpenChange={setOpen}
        selected={ids.map((id) => ({ id, ...(labelOf(id) ?? {}) }))}
        confirmLabel="Usar selección"
        onConfirm={(items) => { onKnown(items); onChange(items.map((i) => i.id)) }} />
    </section>
  )
}
