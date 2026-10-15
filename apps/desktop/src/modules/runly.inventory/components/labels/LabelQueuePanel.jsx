import { useEffect, useMemo, useState } from 'react'
import { Button, ComboboxField, EmptyState, NumberField } from '@runly/ui'
import { ListPlus, Tags, Trash2, X } from 'lucide-react'
import { useItemSearch } from '../../hooks/useInventoryCustody.js'
import { MAX_QUANTITY, MAX_QUEUE_ITEMS, clampQuantity, totalLabels } from '../../lib/label-queue.js'
import { LabelStateBadge } from './LabelStateBadge.jsx'

// Quantity input that commits on blur/Enter so typing "25" is not clamped mid-way.
function QuantityInput({ value, onCommit, label, disabled }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const next = clampQuantity(text)
    setText(String(next))
    if (next !== value) onCommit(next)
  }
  return (
    <div className="w-[5.5rem] shrink-0">
      <NumberField
        aria-label={label}
        prefix="×"
        min={1}
        max={MAX_QUANTITY}
        allowNegative={false}
        allowDecimal={false}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      />
    </div>
  )
}

function ItemPicker({ rows, onAdd, disabled }) {
  const [search, setSearch] = useState('')
  const query = useItemSearch(search)
  const queued = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const options = useMemo(() => (query.data ?? [])
    .filter((item) => !queued.has(item.id))
    .map((item) => ({
      value: item.id,
      label: item.name ?? item.folio ?? item.id,
      description: [item.folio, item.assetTag && `Activo ${item.assetTag}`, item.serialNumber && `S/N ${item.serialNumber}`].filter(Boolean).join(' · ') || undefined,
      keywords: [item.folio, item.assetTag, item.serialNumber].filter(Boolean),
      item,
    })), [query.data, queued])

  return (
    <ComboboxField
      label="Agregar equipos"
      options={options}
      value=""
      onChange={(id) => {
        const option = options.find((o) => o.value === id)
        if (option) onAdd([option.item])
      }}
      onSearchChange={setSearch}
      filter={false}
      loading={query.isFetching}
      disabled={disabled || rows.length >= MAX_QUEUE_ITEMS}
      placeholder="Buscar equipo..."
      searchPlaceholder="Buscar por folio, nombre o serie..."
      emptyText="Sin equipos que coincidan"
    />
  )
}

// Left panel: what will be printed and how many copies of each.
export function LabelQueuePanel({ rows, dispatch, disabled }) {
  const [allQty, setAllQty] = useState(1)
  const total = totalLabels(rows)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <ItemPicker rows={rows} disabled={disabled} onAdd={(items) => dispatch({ type: 'add', items })} />

      {rows.length > 1 ? (
        <div className="flex items-end gap-2">
          <QuantityInput value={allQty} label="Cantidad para todos" onCommit={setAllQty} disabled={disabled} />
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={disabled}
            onClick={() => dispatch({ type: 'applyAll', quantity: allQty })}>
            <ListPlus className="mr-1.5 h-3.5 w-3.5" />Aplicar a todos
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={Tags} title="Cola vacía"
          description="Busca equipos por folio, nombre o serie, o selecciónalos en la lista de Inventario y usa Imprimir etiquetas." />
      ) : (
        <>
          <ul className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))]" aria-label="Cola de impresión">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name ?? '—'}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {row.folio ? <span className="font-mono">{row.folio}</span> : null}
                    {row.serialNumber ? <span className="truncate">S/N {row.serialNumber}</span> : null}
                    <LabelStateBadge labelPrintCount={row.labelPrintCount} labelPrintedAt={row.labelPrintedAt} />
                  </div>
                </div>
                <QuantityInput value={row.quantity} label={`Cantidad de ${row.name ?? 'equipo'}`} disabled={disabled}
                  onCommit={(quantity) => dispatch({ type: 'quantity', id: row.id, quantity })} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={disabled}
                  aria-label={`Quitar ${row.name ?? 'equipo'}`} onClick={() => dispatch({ type: 'remove', id: row.id })}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span>{rows.length} {rows.length === 1 ? 'equipo' : 'equipos'} · {total} {total === 1 ? 'etiqueta' : 'etiquetas'}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={() => dispatch({ type: 'clear' })}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />Vaciar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
