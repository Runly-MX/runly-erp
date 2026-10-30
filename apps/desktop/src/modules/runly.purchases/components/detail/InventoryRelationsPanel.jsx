import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, PackagePlus, Unlink } from 'lucide-react'
import { Button, DataTable, EmptyState } from '@runly/ui'
import { useRelationMutations } from '../../hooks/usePurchases.js'
import { INVENTORY_BASE, ORIGIN_LABELS, toAppPath } from '../../lib/purchases-constants.js'
import { InventoryItemPicker } from '../editor/InventoryItemPicker.jsx'
import { AssignInvoiceDialog } from './AssignInvoiceDialog.jsx'
import { UnlinkRelationDialog } from './UnlinkRelationDialog.jsx'

const ITEM_STATUS = { available: 'Disponible', assigned: 'Asignado', maintenance: 'En mantenimiento' }
const dash = <span className="text-[hsl(var(--muted-foreground))]">Sin dato</span>
const ORIGIN_TONE = { MANUAL: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', INHERITED: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', AUTOMATIC: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', MIGRATED: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }

export const isInventoryRelation = (r) => r?.other?.type === 'inventory_item' || r?.other?.module === 'runly.inventory'

// Inventory items linked to this document, both ways: pick more from
// Inventario or unlink. Items open in the inventory detail.
export function InventoryRelationsPanel({ entityType, doc, canManage }) {
  const { bulk } = useRelationMutations()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [unlink, setUnlink] = useState(null)
  const [assign, setAssign] = useState([])
  const relations = (doc.relations ?? []).filter(isInventoryRelation)
  const invoices = doc.invoices ?? []


  const columns = useMemo(() => [
    {
      id: 'asset', header: 'Activo',
      cell: ({ row: { original: r } }) => (
        <Link to={toAppPath(r.other.path, 'runly.inventory') ?? `${INVENTORY_BASE}/${r.other.id}`} className="group block max-w-[20rem]">
          <span className="block truncate font-semibold tabular-nums group-hover:underline">{r.other.assetTag || r.other.label || 'Activo'}</span>
          <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{r.other.assetTag ? r.other.label : r.other.categoryName}</span>
        </Link>
      ),
    },
    { id: 'serial', header: 'Número de serie', cell: ({ row: { original: r } }) => (r.other.serialNumber ? <span className="tabular-nums">{r.other.serialNumber}</span> : dash) },
    { id: 'type', header: 'Tipo', cell: ({ row: { original: r } }) => r.other.categoryName ?? dash },
    { id: 'status', header: 'Estado', cell: ({ row: { original: r } }) => ITEM_STATUS[r.other.status] ?? r.other.status ?? dash },
    {
      id: 'origin', header: 'Origen',
      cell: ({ row: { original: r } }) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ORIGIN_TONE[r.origin] ?? ORIGIN_TONE.MANUAL}`}>{ORIGIN_LABELS[r.origin] ?? r.origin}</span>,
    },
    ...(canManage ? [{
      id: 'actions', header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row: { original: r } }) => (
        <div className="text-right">
          <Button variant="ghost" size="icon-sm" aria-label={`Quitar relación con ${r.other.label}`} title="Quitar relación" onClick={() => setUnlink(r)}><Unlink className="h-4 w-4" /></Button>
        </div>
      ),
    }] : []),
  ], [canManage])

  const addItems = (items) => {
    const known = new Set(relations.map((r) => r.other.id))
    const targetIds = items.map((i) => i.id).filter((id) => !known.has(id))
    if (!targetIds.length) return
    bulk.mutate({ sourceType: entityType, sourceId: doc.id, targetType: 'inventory_item', targetIds }, {
      // An order may have several invoices: ask which one covers the new assets.
      onSuccess: () => { if (entityType === 'purchase_order' && invoices.length) setAssign(targetIds) },
    })
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setPickerOpen(true)} disabled={bulk.isPending}><PackagePlus className="h-4 w-4" />Relacionar activos</Button>
        </div>
      ) : null}
      {!relations.length ? (
        <EmptyState icon={Boxes} title="Sin activos relacionados"
          description="Relaciona los equipos que cubre este documento, o crea activos desde un concepto de tipo bien." />
      ) : (
        <DataTable columns={columns} data={relations} showToolbar={false} showPagination={false} pageSize={relations.length} getRowId={(row) => row.id} />
      )}
      <AssignInvoiceDialog open={assign.length > 0} onOpenChange={(o) => { if (!o) setAssign([]) }} order={doc} invoices={invoices} itemIds={assign} />
      <InventoryItemPicker open={pickerOpen} onOpenChange={setPickerOpen} onConfirm={addItems} />
      <UnlinkRelationDialog relation={unlink ? { id: unlink.id, label: unlink.other?.label } : null} onOpenChange={(o) => { if (!o) setUnlink(null) }} />
    </div>
  )
}
