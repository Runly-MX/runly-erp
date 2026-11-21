import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, AlertDescription, AlertTitle, BackButton, Button, CheckboxField, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, ErrorState, LoadingState, NotFoundState, PageHeader, SectionCard, Skeleton, TextField, TextareaField,
} from '@runly/ui'
import { ArrowRightLeft, History, Loader2, QrCode, Receipt, Ticket, Wallet, XCircle } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { formatDateTime } from '../../runly.bookings/lib/bookingsTime.js'
import { CredentialsDialog } from '../components/CredentialsDialog.jsx'
import { OrderStatus, PageShell, TicketStatus } from '../components/shared.jsx'
import { newKey, useEvent, useOrder, useOrderHistory, usePaymentCandidates, useTicketingMutation } from '../hooks/useTicketing.js'
import { CHANNEL, MUTED, money, ticketingPath } from '../lib/ticketingLabels.js'

const ACTION = { create: 'Orden creada', confirm_payment: 'Pago confirmado', cancel: 'Orden cancelada', cancel_tickets: 'Boletos cancelados', expire: 'Apartado vencido', reissue: 'QR reemitido', transfer: 'Boleto transferido' }

export default function TicketingOrder({ eventId, orderId }) {
  const navigate = useNavigate()
  const event = useEvent(eventId)
  const order = useOrder(orderId)
  const back = () => navigate(ticketingPath(`/events/${eventId}?tab=orders`))
  if (order.isPending || event.isPending) return <PageShell><LoadingState /></PageShell>
  if (order.isError || event.isError) {
    return <PageShell>{[403, 404].includes(order.error?.status ?? event.error?.status) ? <NotFoundState title="Orden no disponible" description="No existe o no formas parte del equipo del evento." /> : <ErrorState title="No se pudo abrir la orden" onRetry={() => order.refetch()} />}</PageShell>
  }
  return <OrderScreen event={event.data} order={order.data} onBack={back} />
}

function OrderScreen({ event, order, onBack }) {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const canAct = ['admin', 'agent'].includes(event.role)
  const canCharge = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('pos.caja.operate'))
  const [selected, setSelected] = useState([])
  const [cancelling, setCancelling] = useState(null)
  const [reason, setReason] = useState('')
  const [credentials, setCredentials] = useState(null)
  const [transferring, setTransferring] = useState(null)
  const [cancelKey, setCancelKey] = useState(newKey)
  const tz = event.timezone ?? 'UTC'
  const session = (event.sessions ?? []).find((s) => s.id === order.sessionId)
  const typeName = new Map((event.types ?? []).map((t) => [t.id, t.name]))
  const pending = order.status === 'PENDING_PAYMENT'
  const active = order.tickets.filter((t) => ['ISSUED', 'PENDING_PAYMENT'].includes(t.status))
  const paidOrder = Boolean(Number(order.totals?.amount ?? 0)) && !pending
  const cancel = useTicketingMutation((t, data) => runly.ticketing.cancelOrder(order.id, data, t, cancelKey), { success: (r) => (r.data.status === 'CONFIRMED' ? 'Boletos cancelados.' : 'Orden cancelada.') })
  const reissue = useTicketingMutation((t, ticket) => runly.ticketing.reissue(ticket.id, t, newKey()))
  const label = (ticketId) => { const t = order.tickets.find((x) => x.id === ticketId); return [typeName.get(t?.typeId), t?.holderName].filter(Boolean).join(' · ') }

  async function confirmCancel() {
    const ticketIds = cancelling === 'selected' ? selected : undefined
    const ok = await cancel.mutateAsync({ ...(ticketIds ? { ticketIds } : {}), reason: reason.trim() || null }).then(() => true).catch(() => false)
    setCancelKey(newKey())
    if (ok) { setCancelling(null); setSelected([]); setReason('') }
  }

  return (
    <PageShell>
      <BackButton onClick={onBack} label="Órdenes" />
      <PageHeader eyebrow={`Boletos · ${event.title}`} title={`Orden ${order.reference}`} description={session ? formatDateTime(session.startsAt, tz) : undefined}
        actions={<OrderStatus status={order.status} size="md" />} />

      {pending ? <PendingPayment order={order} event={event} canCharge={canCharge} canAct={canAct} onCharge={() => navigate(`/app/m/runly.pos/pos/caja?boletos=${order.id}`)} onIssued={setCredentials} /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Boletos" icon={Ticket} description={pending ? 'Se emiten al confirmar el pago.' : 'Selecciona boletos para cancelarlos; los demás conservan su lugar.'}
            action={canAct && active.length ? (
              <div className="flex flex-wrap gap-2">
                {selected.length && selected.length < active.length && !pending ? <Button type="button" variant="outline" size="sm" onClick={() => setCancelling('selected')}><XCircle />Cancelar {selected.length}</Button> : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling('all')}><XCircle />Cancelar orden</Button>
              </div>
            ) : null}>
            <ul className="divide-y divide-[hsl(var(--border))]">
              {order.tickets.map((t) => {
                const selectable = canAct && !pending && t.status === 'ISSUED'
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                    {selectable ? (
                      <CheckboxField label={<span className="sr-only">Seleccionar {t.code}</span>} checked={selected.includes(t.id)} onChange={(e) => setSelected((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id)))} />
                    ) : <span className="w-4" aria-hidden="true" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold tracking-wider">{t.code}</span><TicketStatus status={t.status} /></p>
                      <p className={`${MUTED} truncate`}>{typeName.get(t.typeId)}{t.holderName ? ` · ${t.holderName}` : ''}{t.credentialVersion > 1 ? ` · QR versión ${t.credentialVersion}` : ''}</p>
                    </div>
                    {canAct && t.status === 'ISSUED' ? (
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" disabled={reissue.isPending} onClick={async () => { const r = await reissue.mutateAsync(t).catch(() => null); if (r?.credential) setCredentials([{ ...r.credential, label: label(t.id) }]) }}><QrCode />Reemitir</Button>
                        {event.policy.transferAllowed ? <Button type="button" variant="ghost" size="sm" onClick={() => setTransferring(t)}><ArrowRightLeft />Transferir</Button> : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </SectionCard>
          <OrderHistory orderId={order.id} />
        </div>
        <aside className="space-y-3 lg:sticky lg:top-4">
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <p className="text-xs font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">Detalle</p>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Comprador">{order.buyerName || '—'}</Row>
              {order.buyerEmail ? <Row label="Correo">{order.buyerEmail}</Row> : null}
              {order.buyerPhone ? <Row label="Teléfono">{order.buyerPhone}</Row> : null}
              <Row label="Canal">{CHANNEL[order.channel]}</Row>
              <Row label="Boletos">{active.length} de {order.quantity}</Row>
              <Row label="Importe">{Number(order.totals?.amount ?? 0) ? money(order.totals.amount, order.totals.currency) : 'Gratis'}</Row>
              <Row label="Creada">{formatDateTime(order.createdAt, tz)}</Row>
              {pending && order.holdExpiresAt ? <Row label="Apartado hasta">{formatDateTime(order.holdExpiresAt, tz)}</Row> : null}
            </dl>
          </div>
          {paidOrder ? <p className={MUTED}>Los boletos pagados se cancelan después de devolver el cobro en Caja (Órdenes, abrir la venta, Devolución); cada boleto devuelto permite anular uno.</p> : null}
        </aside>
      </div>

      <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(v) => !v && setCancelling(null)} loading={cancel.isPending}
        title={cancelling === 'selected' ? `Cancelar ${selected.length} boleto(s)` : 'Cancelar la orden'}
        description={`${cancelling === 'selected' ? 'Sus QR dejan de servir y se liberan esos lugares; los demás boletos siguen vigentes.' : 'Todos los QR vigentes dejan de servir y se liberan sus lugares.'}${paidOrder ? ' Si son pagados, primero devuelve el cobro en Caja.' : ''}`}
        confirmLabel="Cancelar boletos" cancelLabel="Volver" onConfirm={confirmCancel}>
        <TextareaField label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </ConfirmDialog>
      {transferring ? <TransferDialog ticket={transferring} onClose={() => setTransferring(null)} onDone={(c) => { setTransferring(null); setCredentials([{ ...c, label: label(c.ticketId) }]) }} /> : null}
      <CredentialsDialog credentials={credentials} title="QR para entregar" onClose={() => setCredentials(null)} />
    </PageShell>
  )
}

// Unpaid: charge it in Caja, or confirm with a paid sale found on the server (Caja closed
// before confirming). Only sales that match the order can be used.
function PendingPayment({ order, canCharge, canAct, onCharge, onIssued }) {
  const candidates = usePaymentCandidates(order.id, canAct)
  const [key, setKey] = useState(newKey)
  const confirm = useTicketingMutation((t, posOrderId) => runly.ticketing.confirmPayment(order.id, posOrderId, t, key), { success: 'Pago verificado y boletos emitidos.' })
  const matching = (candidates.data ?? []).filter((c) => c.matches)
  return (
    <Alert>
      <Wallet className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Pendiente de pago · {money(order.totals?.amount, order.totals?.currency)}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Cóbrala en Caja; al confirmarse el pago se emiten los boletos. Si el apartado vence, los lugares se liberan.</p>
        <div className="flex flex-wrap gap-2">
          {canCharge ? <Button type="button" size="sm" onClick={onCharge}><Receipt />Cobrar en Caja</Button> : null}
          {candidates.isFetching ? <Skeleton className="h-8 w-40" /> : matching.map((c) => (
            <Button key={c.posOrderId} type="button" size="sm" variant="outline" disabled={confirm.isPending}
              onClick={async () => { const r = await confirm.mutateAsync(c.posOrderId).catch(() => null); setKey(newKey()); if (r?.credentials?.length) onIssued(r.credentials) }}>
              {confirm.isPending ? <Loader2 className="animate-spin" /> : null}Confirmar con venta #{c.orderNumber} ({money(c.totalAmount)})
            </Button>
          ))}
        </div>
        {!candidates.isFetching && canAct && !matching.length ? <p className={MUTED}>No hay ventas pagadas de Caja que coincidan con esta orden.</p> : null}
      </AlertDescription>
    </Alert>
  )
}

function TransferDialog({ ticket, onClose, onDone }) {
  const [form, setForm] = useState({ holderName: '', holderEmail: '' })
  const [error, setError] = useState('')
  const [key] = useState(newKey)
  const transfer = useTicketingMutation((t, data) => runly.ticketing.transfer(ticket.id, data, t, key), { success: 'Boleto transferido; el QR anterior ya no sirve.' })
  async function submit(e) {
    e.preventDefault()
    if (!form.holderName.trim()) { setError('Escribe el nombre del nuevo titular.'); return }
    const r = await transfer.mutateAsync({ holderName: form.holderName.trim(), holderEmail: form.holderEmail.trim() || null }).catch(() => null)
    if (r?.credential) onDone(r.credential)
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} noValidate>
          <DialogHeader icon={ArrowRightLeft} className="mb-0 px-5 pt-4 pb-3">
            <DialogTitle>Transferir boleto {ticket.code}</DialogTitle>
            <DialogDescription>Se emite un QR nuevo para el nuevo titular; el anterior deja de servir de inmediato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <TextField label="Nombre del nuevo titular" required value={form.holderName} error={error} maxLength={160} autoFocus onChange={(e) => { setError(''); setForm((f) => ({ ...f, holderName: e.target.value })) }} />
            <TextField label="Correo (opcional)" type="email" value={form.holderEmail} onChange={(e) => setForm((f) => ({ ...f, holderEmail: e.target.value }))} />
          </div>
          <DialogFooter className="mt-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={transfer.isPending}>{transfer.isPending ? <Loader2 className="animate-spin" /> : null}Transferir</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OrderHistory({ orderId }) {
  const history = useOrderHistory(orderId)
  return (
    <SectionCard title="Historial" icon={History} description="Registro de cambios; no se puede editar ni borrar.">
      {history.isPending ? <Skeleton className="h-20 w-full" /> : (
        <ol className="space-y-2.5">
          {(history.data ?? []).map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>{ACTION[h.action] ?? h.action}{h.after?.reason ? ` · ${h.after.reason}` : ''}{h.after?.posOrderNumber ? ` · venta #${h.after.posOrderNumber}` : ''}</span>
              <span className={MUTED}>{h.actorName ?? (h.actorKind === 'system' ? 'Sistema' : '—')} · {new Date(h.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
}

function Row({ label, children }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="text-[hsl(var(--muted-foreground))]">{label}</dt><dd className="truncate text-right font-medium">{children}</dd></div>
}
