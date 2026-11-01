// apps/desktop/src/modules/runly.pos/retail/components/ReceiptDialog.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ErrorState, SelectField, Skeleton, StatusPill } from '@runly/ui'
import { Bluetooth, CircleAlert, Info, Printer, Receipt, Send } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { useReceiptPrinting } from '../hooks/useReceiptPrinting.js'
import { classifyPosError } from '../lib/retailErrors.js'
import { PRINT_STATUS_META, formatMoney, formatQuantity } from '../lib/retailRules.js'

function when(value) {
  try { return new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' }
}

// C7 structured receipt: preview of the stored document plus the print
// attempts. GET never prints or counts; only an explicit action creates a
// job, and a later attempt is a copy of the same folio.
export default function ReceiptDialog({ receiptId, token, onClose }) {
  const query = useQuery({
    queryKey: ['pos-retail-receipt', receiptId, token],
    queryFn: () => runly.commerce.getReceipt(receiptId, token),
    enabled: Boolean(token && receiptId),
  })
  const { state, print, bluetooth } = useReceiptPrinting({ receiptId, token })
  const [devices, setDevices] = useState(null)
  const [address, setAddress] = useState('')
  const receipt = query.data?.data
  const doc = receipt?.document
  const money = (v) => formatMoney(v, doc?.header?.currency)
  const status = PRINT_STATUS_META[receipt?.printStatus] ?? null
  const working = state.phase === 'working'

  async function loadDevices() {
    const res = await bluetooth.pairedDevices()
    setDevices(res.ok ? res.devices : [])
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !working && onClose()}>
      <DialogContent size="lg" scrollable className="p-0 md:p-0">
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
          <DialogHeader icon={Receipt}>
            <DialogTitle>{doc ? `${doc.kind === 'REFUND' ? 'Devolución' : 'Venta'} · comprobante #${doc.header.receiptNumber}` : 'Comprobante'}</DialogTitle>
            <DialogDescription>{doc ? `Orden #${doc.header.orderNumber} · ${when(doc.header.issuedAt)}` : 'Cargando...'}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {query.isPending ? <Skeleton className="h-64" /> : query.isError ? (
            <ErrorState title="No se pudo abrir el comprobante" description={classifyPosError(query.error).message} onRetry={query.refetch} />
          ) : !doc ? (
            <ErrorState title="Comprobante incompleto" description={receipt?.unavailableReason ?? 'Este comprobante histórico no tiene todos sus datos y no se puede mostrar.'} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {status && <StatusPill tone={status.tone} icon={receipt.printStatus === 'FAILED' ? CircleAlert : receipt.printStatus === 'SUBMITTED' ? Send : Printer}>{status.label}</StatusPill>}
                {receipt.printJobs?.length > 0 && <span className="text-xs text-[hsl(var(--muted-foreground))]">{receipt.printJobs.length} intento(s) de impresión</span>}
              </div>
              <article aria-label="Vista previa del comprobante" className="mx-auto w-full max-w-sm rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 font-mono text-sm text-[hsl(var(--foreground))]">
                <header className="space-y-0.5 border-b border-dashed border-[hsl(var(--border))] pb-2 text-center">
                  {doc.header.companyName && <p className="font-bold">{doc.header.companyName}</p>}
                  <p>{[doc.header.outletName, doc.header.terminalName].filter(Boolean).join(' · ')}</p>
                  <p className="font-bold">{doc.kind === 'REFUND' ? 'DEVOLUCIÓN' : 'VENTA'} #{doc.header.receiptNumber}{doc.copy ? ' · COPIA' : ''}</p>
                </header>
                <ul className="space-y-1 border-b border-dashed border-[hsl(var(--border))] py-2">
                  {doc.lines.map((l) => (
                    <li key={l.orderLineId}>
                      <div className="flex justify-between gap-2"><span className="min-w-0 truncate">{l.name}</span><span className="tabular-nums">{money(l.totalAmount)}</span></div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{formatQuantity(l.quantity)} × {money(l.unitPrice)}{l.variantLabel ? ` · ${l.variantLabel}` : ''}</div>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-0.5 py-2">
                  <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(doc.totals.subtotalAmount)}</dd></div>
                  <div className="flex justify-between"><dt>Impuestos</dt><dd className="tabular-nums">{money(doc.totals.taxAmount)}</dd></div>
                  <div className="flex justify-between font-bold"><dt>Total</dt><dd className="tabular-nums">{money(doc.totals.totalAmount)} {doc.header.currency}</dd></div>
                  {doc.kind === 'SALE' && Number(doc.totals.refundedAmount) > 0 && (
                    <>
                      <div className="flex justify-between"><dt>Devuelto</dt><dd className="tabular-nums">{money(doc.totals.refundedAmount)}</dd></div>
                      <div className="flex justify-between"><dt>Pagado neto</dt><dd className="tabular-nums">{money(doc.totals.netPaidAmount)}</dd></div>
                    </>
                  )}
                </dl>
                <ul className="space-y-0.5 border-t border-dashed border-[hsl(var(--border))] pt-2">
                  {doc.payments.map((p) => (
                    <li key={p.paymentId ?? p.name}>
                      <div className="flex justify-between"><span>{p.name ?? p.kind}</span><span className="tabular-nums">{money(p.amount)}</span></div>
                      {p.tenderedAmount !== null && <div className="flex justify-between text-xs"><span>Recibido</span><span className="tabular-nums">{money(p.tenderedAmount)}</span></div>}
                      {p.changeAmount !== null && <div className="flex justify-between text-xs"><span>Cambio</span><span className="tabular-nums">{money(p.changeAmount)}</span></div>}
                    </li>
                  ))}
                </ul>
                <p className="pt-2 text-center text-xs text-[hsl(var(--muted-foreground))]">{doc.notice}</p>
              </article>
              {state.message && (
                <p role="status" className={`flex items-start gap-2 rounded-xl p-3 text-sm ${state.phase === 'failed' ? 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-200' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'}`}>
                  {state.phase === 'failed' ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}{state.message}
                </p>
              )}
              {bluetooth.available && (
                <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3">
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Impresora Bluetooth</p>
                  {devices === null ? (
                    <Button variant="outline" onClick={loadDevices}><Bluetooth className="h-4 w-4" aria-hidden="true" />Buscar impresoras emparejadas</Button>
                  ) : devices.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">No hay impresoras emparejadas. Emparéjala en los ajustes del dispositivo.</p>
                  ) : (
                    <SelectField aria-label="Impresora" options={devices.map((d) => ({ value: d.address, label: d.name ?? d.address }))} value={address} onValueChange={setAddress} placeholder="Elige la impresora" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" onClick={onClose} disabled={working}>Cerrar</Button>
          {doc && receipt.printable !== false && bluetooth.available && address && (
            <Button variant="outline" size="lg" onClick={() => print('BLUETOOTH', address)} loading={working}><Bluetooth className="h-4 w-4" aria-hidden="true" />Imprimir por Bluetooth</Button>
          )}
          {doc && receipt.printable !== false && (
            <Button size="lg" onClick={() => print('BROWSER')} loading={working}><Printer className="h-4 w-4" aria-hidden="true" />{receipt.printJobs?.length ? 'Imprimir copia' : 'Imprimir'}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
