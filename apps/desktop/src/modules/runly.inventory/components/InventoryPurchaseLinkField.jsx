import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDialog, CreatableComboboxField } from '@runly/ui'
import { toast } from 'sonner'
import { ClipboardList, ReceiptText } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useRelationMutations, useSearchDocuments } from '../../runly.purchases/hooks/usePurchases.js'
import { hasPermission } from '../../runly.purchases/components/InventoryPurchaseMeta.js'
import { InventoryPurchaseQuickCreateDialog } from './InventoryPurchaseQuickCreateDialog.jsx'
import { documentOptionLabel, planPurchaseLinkRule, purchaseDocCache } from '../lib/purchase-links.js'

// RunlyForm "custom" field of the inventory item form: pick the purchase order
// or invoice the item was bought with. Remote search by folio, supplier name or
// the linked document; "+ Crear ..." opens a quick-create dialog. The id is
// saved as an EntityRelation by the API together with the item.
const KINDS = {
  purchaseOrderId: { kind: 'order', icon: ClipboardList, linkKey: 'purchaseOrderLink', createLabel: 'Crear orden de compra', createPermission: 'purchases.order.create', placeholder: 'Buscar orden de compra...' },
  purchaseInvoiceId: { kind: 'invoice', icon: ReceiptText, linkKey: 'purchaseInvoiceLink', createLabel: 'Crear factura', createPermission: 'purchases.invoice.create', placeholder: 'Buscar factura...' },
}

export function InventoryPurchaseLinkField({ field, value, onChange, error, initialData, values, onFieldChange }) {
  const meta = KINDS[field.name] ?? KINDS.purchaseOrderId
  const { userProfile } = useAuth()
  const canEdit = hasPermission(userProfile, 'purchases.relation.manage')
  const canCreate = canEdit && hasPermission(userProfile, meta.createPermission)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [dialog, setDialog] = useState(null)
  const [relate, setRelate] = useState(null)
  const known = useRef(purchaseDocCache[meta.kind])
  const { create: createRelation } = useRelationMutations()

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const initial = initialData?.[meta.linkKey]
  if (initial?.id && !known.current.has(initial.id)) known.current.set(initial.id, initial)
  const query = useSearchDocuments({ type: meta.kind, search: debounced || undefined, pageSize: 20, ...(meta.kind === 'invoice' && values?.purchaseOrderId && !debounced ? { orderId: values.purchaseOrderId } : {}) }, canEdit)
  const rows = useMemo(() => query.data?.data ?? [], [query.data?.data])
  rows.forEach((row) => known.current.set(row.id, row))

  // An invoice belongs to one order: picking an invoice that has one fills the
  // order; picking both when they are unrelated offers to relate them.
  function select(next) {
    onChange(next || '')
    if (!next) return
    const invoice = meta.kind === 'invoice' ? purchaseDocCache.invoice.get(next) : purchaseDocCache.invoice.get(values?.purchaseInvoiceId)
    const orderId = meta.kind === 'order' ? next : values?.purchaseOrderId
    const rule = planPurchaseLinkRule({ invoice, orderId })
    if (rule.type === 'fill-order') {
      purchaseDocCache.order.set(rule.order.id, rule.order)
      if (meta.kind === 'order') onChange(rule.order.id)
      else onFieldChange?.('purchaseOrderId', rule.order.id)
      toast.info(meta.kind === 'order'
        ? `La factura ${invoice.number} ya pertenece a la orden ${rule.order.number}; se usó esa orden.`
        : `Se completó la orden ${rule.order.number} de la factura ${invoice.number}.`)
    } else if (rule.type === 'ask-relate') {
      setRelate({ invoice, order: purchaseDocCache.order.get(orderId) })
    }
  }

  function confirmRelate() {
    const { invoice, order } = relate
    createRelation.mutate({ sourceType: 'purchase_invoice', sourceId: invoice.id, targetType: 'purchase_order', targetId: order.id }, {
      onSuccess: () => {
        purchaseDocCache.invoice.set(invoice.id, { ...invoice, order: { id: order.id, number: order.number } })
        toast.success(`Factura ${invoice.number} relacionada con la orden ${order.number}.`)
        setRelate(null)
      },
    })
  }

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
        onChange={select}
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
        searchPlaceholder={meta.kind === 'invoice' && values?.purchaseOrderId ? 'Facturas de la orden; escribe para buscar otras' : 'Folio, proveedor u otro documento'}
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
            known.current.set(doc.id, meta.kind === 'invoice' ? { order: null, ...doc } : doc)
            select(doc.id)
            setDialog(null)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(relate)}
        onOpenChange={(open) => { if (!open) setRelate(null) }}
        tone="primary"
        title="¿Relacionar factura y orden?"
        description={relate ? `La factura ${relate.invoice.number} aún no está relacionada con la orden ${relate.order?.number ?? ''}. Una orden puede tener varias facturas; una factura, solo una orden.` : ''}
        confirmLabel="Relacionar"
        cancelLabel="No relacionar"
        loading={createRelation.isPending}
        onConfirm={confirmRelate}
      />
    </>
  )
}
