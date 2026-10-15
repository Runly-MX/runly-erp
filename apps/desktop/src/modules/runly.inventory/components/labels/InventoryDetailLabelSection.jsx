import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, NumberField, Skeleton } from '@runly/ui'
import { Maximize2, Printer, QrCode } from 'lucide-react'
import { useInventoryCan } from '../../hooks/useInventoryAdmin.js'
import { useItemLabelHistory, useLabelPreview } from '../../hooks/useInventoryLabels.js'
import { buildLabelsPath, clampQuantity, statsFromHistory } from '../../lib/label-queue.js'
import { LabelDetailsDialog, qrOnlyBody } from './LabelDetailsDialog.jsx'

const formatDay = (value) => new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function labelStatusText(history) {
  const { labelPrintCount, labelPrintedAt } = statsFromHistory(history)
  if (!labelPrintCount) return 'Sin etiquetar'
  return `Impresa el ${formatDay(labelPrintedAt)}, ${labelPrintCount === 1 ? '1 vez' : `${labelPrintCount} veces`}`
}

// Registry key: runly.inventory:LabelSection — "Etiqueta / QR" card of the item detail.
export default function InventoryDetailLabelSection({ data }) {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const canPrint = can('inventory.label.print')
  const canManage = can('inventory.label.manage')
  const itemId = data?.id
  const history = useItemLabelHistory(itemId)
  const preview = useLabelPreview(itemId ? qrOnlyBody(itemId, 300) : null, { enabled: canPrint, delay: 0 })
  const [quantity, setQuantity] = useState('1')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const printed = (history.data?.length ?? 0) > 0

  function openPrint() {
    const qty = clampQuantity(quantity)
    navigate(buildLabelsPath({ itemIds: [itemId], quantity: qty }), {
      state: { labelItems: [{ ...data, ...statsFromHistory(history.data ?? []) }] },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-white p-1">
          {preview.url ? (
            <img src={preview.url} alt={`Código QR de ${data?.name ?? 'el equipo'}`} className="h-full w-full object-contain" />
          ) : canPrint && !preview.error ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <QrCode className="h-8 w-8 text-neutral-400" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {data?.folio ? <p className="font-mono text-sm font-medium">{data.folio}</p> : null}
          {history.isLoading ? <Skeleton className="h-4 w-36" /> : (
            <p className={printed ? 'text-sm' : 'text-sm text-[hsl(var(--muted-foreground))]'}>{labelStatusText(history.data ?? [])}</p>
          )}
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setDetailsOpen(true)}>
            <Maximize2 className="mr-1 h-3 w-3" />Ver con detalles
          </Button>
        </div>
      </div>
      {canPrint ? (
        <div className="flex items-end gap-2">
          <div className="w-24 shrink-0">
            <NumberField label="Cantidad" min={1} max={500} allowNegative={false} allowDecimal={false} value={quantity}
              onChange={(e) => setQuantity(e.target.value)} onBlur={() => setQuantity(String(clampQuantity(quantity)))} />
          </div>
          <Button type="button" variant={printed ? 'outline' : 'default'} className="flex-1" onClick={openPrint}>
            <Printer className="mr-2 h-4 w-4" />{printed ? 'Reimprimir' : 'Imprimir'}
          </Button>
        </div>
      ) : null}
      <LabelDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} item={data} history={history} canPrint={canPrint} canManage={canManage} />
    </div>
  )
}
