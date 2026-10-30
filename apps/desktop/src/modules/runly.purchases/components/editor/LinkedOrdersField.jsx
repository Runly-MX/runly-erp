import { useMemo, useRef, useState } from 'react'
import { ClipboardList, GitMerge } from 'lucide-react'
import { ComboboxField, SwitchField } from '@runly/ui'
import { usePropagationPreview, useSearchDocuments } from '../../hooks/usePurchases.js'
import { formatMoney } from '../../lib/format.js'

// The order this invoice bills (an order can have many invoices, an invoice only one). When the orders already have inventory items,
// the API can copy those relations to the invoice (inheritItems, origin INHERITED).
export function LinkedOrdersField({ value = [], onChange, known = {}, inherit, onInheritChange, invoiceId, supplierId, disabled }) {
  const [search, setSearch] = useState('')
  const cache = useRef(new Map(Object.entries(known)))
  Object.entries(known).forEach(([id, doc]) => cache.current.set(id, doc))
  const query = useSearchDocuments({ type: 'order', search: search || undefined, supplierId: supplierId || undefined, page: 1 })
  const rows = useMemo(() => query.data?.data ?? [], [query.data?.data])
  rows.forEach((row) => cache.current.set(row.id, row))

  const options = useMemo(() => {
    const list = rows.map((row) => ({
      value: row.id,
      label: row.number,
      description: [row.supplierName, row.total != null ? formatMoney(row.total, row.currency) : null].filter(Boolean).join(', '),
      icon: ClipboardList,
    }))
    value.forEach((id) => {
      if (!list.some((o) => o.value === id)) list.push({ value: id, label: cache.current.get(id)?.number ?? cache.current.get(id)?.label ?? 'Orden', icon: ClipboardList })
    })
    return list
  }, [rows, value])

  const preview = usePropagationPreview({ orderIds: value.join(','), ...(invoiceId ? { invoiceId } : {}) }, value.length > 0 && !disabled)
  const inheritable = Array.isArray(preview.data) ? preview.data : preview.data?.items ?? preview.data?.data ?? []

  return (
    <div className="space-y-3">
      <ComboboxField
        label="Orden de compra de esta factura"
        options={options}
        value={value[0] ?? ''}
        onChange={(next) => onChange(next ? [next] : [])}
        clearable
        onSearchChange={setSearch}
        filter={false}
        loading={query.isFetching && !rows.length}
        disabled={disabled}
        placeholder="Buscar orden por folio"
        searchPlaceholder="OC-000123"
        emptyText="Sin órdenes"
        hint={supplierId ? 'Una factura se relaciona con una sola orden. Se muestran las del proveedor elegido.' : 'Una factura se relaciona con una sola orden. Elige el proveedor para acotar la búsqueda.'}
      />
      {value.length && inheritable.length ? (
        <div className="flex items-start gap-3 rounded-xl border border-(--brand-primary)/25 bg-(--brand-primary)/[0.07] p-3">
          <GitMerge className="mt-0.5 h-4 w-4 shrink-0 text-(--brand-primary-computed)" />
          <div className="min-w-0 flex-1">
            <SwitchField id="inherit-items" label={`Heredar ${inheritable.length} ${inheritable.length === 1 ? 'activo' : 'activos'} de la orden`}
              description={inheritable.slice(0, 3).map((i) => i.label ?? i.name ?? i.other?.label).filter(Boolean).join(', ') + (inheritable.length > 3 ? ` y ${inheritable.length - 3} más` : '')}
              checked={inherit} onChange={onInheritChange} disabled={disabled} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
