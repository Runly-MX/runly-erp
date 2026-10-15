import { useEffect, useMemo, useRef, useState } from 'react'
import { CreatableComboboxField } from '@runly/ui'
import { ClipboardList, ReceiptText } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useSearchDocuments } from '../../runly.purchases/hooks/usePurchases.js'
import { hasPermission } from '../../runly.purchases/components/InventoryPurchaseMeta.js'
import { InventoryPurchaseQuickCreateDialog } from './InventoryPurchaseQuickCreateDialog.jsx'
import { documentOptionLabel } from '../lib/purchase-links.js'

// RunlyForm "custom" field of the inventory item form: pick the purchase order
// or invoice the item was bought with. Remote search by folio, supplier name or
// the linked document; "+ Crear ..." opens a quick-create dialog. The id is
// saved as an EntityRelation by the API together with the item.
const KINDS = {
  purchaseOrderId: { kind: 'order', icon: ClipboardList, linkKey: 'purchaseOrderLink', createLabel: 'Crear orden de compra', createPermission: 'purchases.order.create', placeholder: 'Buscar orden de compra...' },
  purchaseInvoiceId: { kind: 'invoice', icon: ReceiptText, linkKey: 'purchaseInvoiceLink', createLabel: 'Crear factura', createPermission: 'purchases.invoice.create', placeholder: 'Buscar factura...' },
}

export function InventoryPurchaseLinkField({ field, value, onChange, error, initialData }) {
  const meta = KINDS[field.name] ?? KINDS.purchaseOrderId
  const { userProfile } = useAuth()
  const canEdit = hasPermission(userProfile, 'purchases.relation.manage')
  const canCreate = canEdit && hasPermission(userProfile, meta.createPermission)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [dialog, setDialog] = useState(null)
  const known = useRef(new Map())

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const initial = initialData?.[meta.linkKey]
  if (initial?.id) known.current.set(initial.id, initial)
  const query = useSearchDocuments({ type: meta.kind, search: debounced || undefined, pageSize: 20 }, canEdit)
  const rows = useMemo(() => query.data?.data ?? [], [query.data?.data])
  rows.forEach((row) => known.current.set(row.id, row))

  const options = useMemo(() => {
    const list = rows.map((row) => ({ value: row.id, label: documentOptionLabel(row), description: row.statusLabel ?? undefined }))
    const current = value && known.current.get(value)
    if (current && !list.some((option) => option.value === value)) list.unshift({ value, label: documentOptionLabel(current) })
    return list
  }, [rows, value])

  return (
    <>
      <CreatableComboboxField
        label={field.label}
        icon={meta.icon}
        error={error}
        value={value ?? ''}
        options={options}
        onChange={(next) => onChange(next || '')}
        onSearchChange={setSearch}
        filter={false}
        clearable
        disabled={!canEdit}
        loading={query.isFetching && !rows.length}
        loadError={query.isError ? 'No se pudieron cargar los documentos' : null}
        onRetry={() => query.refetch()}
        onCreate={canCreate ? (term) => setDialog({ number: term }) : undefined}
        createLabel={meta.createLabel}
        placeholder={meta.placeholder}
        searchPlaceholder="Folio, proveedor u otro documento"
        emptyText="Sin resultados"
        missingLabel="Documento"
      />
      {canCreate ? (
        <InventoryPurchaseQuickCreateDialog
          open={Boolean(dialog)}
          onOpenChange={(open) => { if (!open) setDialog(null) }}
          kind={meta.kind}
          initialNumber={dialog?.number ?? ''}
          onCreated={(doc) => {
            known.current.set(doc.id, doc)
            onChange(doc.id)
            setDialog(null)
          }}
        />
      ) : null}
    </>
  )
}
