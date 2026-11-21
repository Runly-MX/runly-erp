import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, Button, EmptyState, NumberField, SectionCard, SelectField, TextField } from '@runly/ui'
import { Gift, Loader2, Receipt, Store, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { formatDateTime } from '../../runly.bookings/lib/bookingsTime.js'
import { newKey, useTicketingMutation } from '../hooks/useTicketing.js'
import { MUTED, ticketingPath } from '../lib/ticketingLabels.js'
import { CredentialsDialog } from './CredentialsDialog.jsx'

const CAJA = '/app/m/runly.pos/pos/caja'

// Box office: pick a function and quantities per type, then issue (free) or hold the
// seats and charge in Caja (paid). Prices are shown as references: Caja charges the
// catalog price and the server checks the sale before issuing.
export function BoxOfficeTab({ event }) {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const canCharge = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('pos.caja.operate'))
  const sessions = (event.sessions ?? []).filter((s) => s.status === 'scheduled' && new Date(s.startsAt).getTime() > Date.now())
  const types = (event.types ?? []).filter((t) => t.enabled)
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '')
  const [qty, setQty] = useState({})
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [holders, setHolders] = useState([])
  const [attempt, setAttempt] = useState(newKey)
  const [credentials, setCredentials] = useState(null)
  const [held, setHeld] = useState(null)
  const [error, setError] = useState('')
  const session = sessions.find((s) => s.id === sessionId)
  const lines = types.map((t) => ({ type: t, quantity: Number.parseInt(qty[t.id] ?? '0', 10) || 0 })).filter((l) => l.quantity > 0)
  const total = lines.reduce((a, l) => a + l.quantity, 0)
  const paid = lines.some((l) => l.type.priceMode !== 'free')
  const needNames = event.policy.holderNameRequired
  const left = (t) => {
    const q = t.quotas.find((x) => x.sessionId === sessionId)
    const byType = q?.quota == null ? Infinity : q.quota - q.issued
    return Math.min(byType, session?.available ?? 0)
  }
  // Any change makes a new logical attempt (a retry of the same click keeps its key).
  const touch = (fn) => { setError(''); setAttempt(newKey()); fn() }
  const issue = useTicketingMutation((t, { data, key }) => runly.ticketing.createOrder(data, t, key))
  const ticketLabels = lines.flatMap((l) => Array.from({ length: l.quantity }, () => l.type.name))

  if (!sessions.length || !types.length) {
    return <EmptyState icon={Store} title="Taquilla sin nada que vender" description={!sessions.length ? 'Agrega una función futura en Funciones.' : 'Agrega un tipo de boleto activo en Boletos.'} />
  }

  async function submit(e) {
    e.preventDefault()
    if (!total) { setError('Elige cuántos boletos.'); return }
    if (total > event.policy.maxPerOrder) { setError(`Máximo ${event.policy.maxPerOrder} boletos por orden.`); return }
    if (needNames && (holders.length < total || holders.slice(0, total).some((h) => !h?.trim()))) { setError('Escribe el nombre de cada asistente.'); return }
    const data = {
      sessionId, channel: 'box_office', items: lines.map((l) => ({ typeId: l.type.id, quantity: l.quantity })),
      buyer: { name: buyer.name.trim() || null, email: buyer.email.trim() || null, phone: buyer.phone.trim() || null },
      ...(needNames || holders.some(Boolean) ? { holders: Array.from({ length: total }, (_, i) => ({ name: holders[i]?.trim() || null })) } : {}),
    }
    const result = await issue.mutateAsync({ data, key: attempt }).catch(() => null)
    if (!result) return
    setAttempt(newKey()); setQty({}); setHolders([]); setBuyer({ name: '', email: '', phone: '' })
    if (result.data.status === 'PENDING_PAYMENT') {
      if (canCharge) navigate(`${CAJA}?boletos=${result.data.id}`)
      else setHeld(result.data)
      return
    }
    const typeOf = new Map(result.data.tickets.map((t) => [t.id, types.find((x) => x.id === t.typeId)?.name]))
    const holderOf = new Map(result.data.tickets.map((t) => [t.id, t.holderName]))
    if (result.credentials?.length) setCredentials(result.credentials.map((c) => ({ ...c, label: [typeOf.get(c.ticketId), holderOf.get(c.ticketId)].filter(Boolean).join(' · ') })))
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-4">
        {held ? (
          <Alert>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Orden {held.reference} apartada</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">Cóbrala en Caja antes de que venza el apartado; los boletos se emiten al confirmar el pago.
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(ticketingPath(`/events/${event.id}/orders/${held.id}`))}>Ver orden</Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <SectionCard title="Función" icon={Store}>
          <SelectField label="Función" options={sessions.map((s) => ({ value: s.id, label: `${formatDateTime(s.startsAt, event.timezone ?? 'UTC')} · ${s.available} libres` }))} value={sessionId} onValueChange={(v) => touch(() => { setSessionId(v); setQty({}) })} />
        </SectionCard>
        <SectionCard title="Boletos" icon={Receipt} description="Precios de referencia; Caja cobra el precio vigente del producto.">
          <ul className="divide-y divide-[hsl(var(--border))]">
            {types.map((t) => {
              const max = Math.max(0, Math.min(t.perOrderMax, left(t)))
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">{t.priceMode === 'free' ? <Gift className="h-4 w-4" aria-hidden="true" /> : <Receipt className="h-4 w-4" aria-hidden="true" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className={MUTED}>{t.priceMode === 'free' ? 'Gratis' : 'Se cobra en Caja'} · {max ? `${Number.isFinite(left(t)) ? left(t) : 'sin límite de tipo'} disponibles` : 'Agotado'}</p>
                  </div>
                  <NumberField aria-label={`Cantidad de ${t.name}`} icon={null} min={0} max={max} allowDecimal={false} value={qty[t.id] ?? ''} placeholder="0" disabled={!max}
                    onChange={(e) => touch(() => setQty((q) => ({ ...q, [t.id]: e.target.value })))} className="h-10 w-24 text-center" />
                </li>
              )
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Comprador" icon={UserRound} description="Opcional. El correo servirá para enviar los boletos cuando esté disponible.">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <TextField label="Nombre" value={buyer.name} maxLength={160} autoComplete="off" onChange={(e) => touch(() => setBuyer((b) => ({ ...b, name: e.target.value })))} />
            <TextField label="Correo" type="email" inputMode="email" value={buyer.email} autoComplete="off" onChange={(e) => touch(() => setBuyer((b) => ({ ...b, email: e.target.value })))} />
            <TextField label="Teléfono" type="tel" inputMode="tel" value={buyer.phone} maxLength={40} autoComplete="off" onChange={(e) => touch(() => setBuyer((b) => ({ ...b, phone: e.target.value })))} />
          </div>
          {needNames && total ? (
            <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
              <p className="text-sm font-medium">Nombre de cada asistente</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ticketLabels.map((label, i) => <TextField key={i} label={`${label} ${i + 1}`} value={holders[i] ?? ''} maxLength={160} autoComplete="off" onChange={(e) => touch(() => setHolders((h) => { const n = [...h]; n[i] = e.target.value; return n }))} />)}
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
      <aside className="space-y-3 lg:sticky lg:top-4">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <p className="text-xs font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">Orden</p>
          {lines.length ? (
            <ul className="mt-3 space-y-1.5 text-sm">{lines.map((l) => <li key={l.type.id} className="flex justify-between gap-2"><span className="truncate">{l.type.name}</span><span className="tabular-nums">× {l.quantity}</span></li>)}</ul>
          ) : <p className={`${MUTED} mt-3`}>Elige cuántos boletos de cada tipo.</p>}
          <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-sm"><span className="font-semibold tabular-nums">{total}</span> {total === 1 ? 'boleto' : 'boletos'}{session ? ` · ${formatDateTime(session.startsAt, event.timezone ?? 'UTC')}` : ''}</p>
          {paid ? <p className={`${MUTED} mt-2`}>Se apartan {event.policy.holdMinutes} min mientras se cobran en Caja.{canCharge ? '' : ' No tienes acceso a Caja: alguien más deberá cobrarla.'}</p> : null}
          {error ? <p role="alert" className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
          <Button type="submit" className="mt-4 w-full" disabled={issue.isPending || !event.enabled}>
            {issue.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : paid ? <Wallet /> : <Gift />}
            {issue.isPending ? 'Procesando…' : paid ? (canCharge ? 'Apartar y cobrar en Caja' : 'Apartar boletos') : `Emitir ${total || ''} ${total === 1 ? 'boleto' : 'boletos'}`.replace('  ', ' ')}
          </Button>
        </div>
      </aside>
      <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </form>
  )
}
