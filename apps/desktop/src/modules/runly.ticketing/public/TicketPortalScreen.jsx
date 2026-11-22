import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, Button, CheckboxField, EmptyState, Skeleton, TextField } from '@runly/ui'
import { AlertTriangle, ArrowLeft, CalendarX2, ExternalLink, Loader2, MapPin, ShieldAlert, Store, Ticket } from 'lucide-react'
import { accentStyle, useAttemptKey } from '../../runly.bookings/public/portalLib.js'
import { EventHero, IssuedTickets, SessionPicker, SuccessBanner, TypeRow } from './EventParts.jsx'
import { embedBlocked, isNetworkError, longDate, ticketsApi, ticketsError, time, unwrap, useReportHeight } from './ticketPortalLib.js'

const STATUS_COPY = {
  closed: { title: 'La venta no está abierta', text: 'El organizador todavía no abre la venta en línea, o ya la cerró.' },
  ended: { title: 'Este evento ya pasó', text: 'No quedan funciones próximas.' },
  cancelled: { title: 'Evento cancelado', text: 'El organizador canceló este evento.' },
}

// Public event page (/app/p/boletos/:slug). Availability shown here is informative: the
// server re-checks quota and seats in one transaction when issuing, so it never oversells.
export default function TicketPortalScreen() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const vista = params.get('vista')
  const compact = vista === 'tarjeta'
  const embed = params.get('embed') === '1'
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['tickets-portal', slug, vista], queryFn: async () => unwrap(await ticketsApi.getEvent(slug, compact ? null : vista)), retry: false })
  const event = query.data
  const ref = useRef(null)
  useReportHeight(embed, ref)
  const style = useMemo(() => accentStyle(event?.company?.accentColor), [event])
  const shell = (children) => <main ref={ref} style={style} className={`mx-auto flex w-full min-w-0 flex-col gap-6 px-4 ${compact ? 'max-w-xl py-3' : `max-w-6xl ${embed ? 'py-4' : 'py-6 sm:py-10'}`}`}>{children}</main>

  if (query.isPending) return shell(<><Skeleton className="h-72 w-full rounded-2xl" /><Skeleton className="h-48 w-full" /></>)
  if (query.isError) {
    return shell(<EmptyState icon={CalendarX2} title="Evento no disponible" description={ticketsError(query.error)} action={isNetworkError(query.error) ? <Button type="button" onClick={() => query.refetch()}>Reintentar</Button> : null} />)
  }
  if (embedBlocked(event.embed?.allowedOrigins)) {
    return shell(<EmptyState icon={ShieldAlert} title="Sitio no autorizado" description="Este sitio no está autorizado para mostrar los boletos de este evento. Puedes obtenerlos en la página del evento."
      action={<Button asChild><a href={`/app/p/boletos/${slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink />Abrir el evento</a></Button>} />)
  }
  if (compact) return shell(<CompactCard event={event} slug={slug} />)
  return shell(<EventPage event={event} slug={slug} embed={embed} onStale={() => client.invalidateQueries({ queryKey: ['tickets-portal', slug] })} />)
}

// Website "Tarjeta del evento": essentials and one action that opens the full page.
function CompactCard({ event, slug }) {
  const next = event.sessions[0]
  return (
    <article className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <EventHero event={event} compact />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{next ? `${event.sessions.length} ${event.sessions.length === 1 ? 'función' : 'funciones'} · desde ${longDate(next.startsAt, event.timezone)}` : 'Sin funciones próximas'}</p>
        <Button asChild><a href={`/app/p/boletos/${slug}`} target="_blank" rel="noopener noreferrer"><Ticket />{event.status === 'on_sale' ? 'Obtener boletos' : 'Ver evento'}</a></Button>
      </div>
    </article>
  )
}

function EventPage({ event, slug, embed, onStale }) {
  const tz = event.timezone
  const [sessionId, setSessionId] = useState(() => (event.sessions.length === 1 ? event.sessions[0].id : null))
  const [quantities, setQuantities] = useState({})
  const [step, setStep] = useState('select')
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [holders, setHolders] = useState([])
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState({})
  const [submit, setSubmit] = useState({ state: 'idle' })
  const [keyFor, newAttempt] = useAttemptKey()
  const panelRef = useRef(null)
  useEffect(() => { if (step !== 'select') panelRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }) }, [step])

  const onSale = event.status === 'on_sale'
  const session = event.sessions.find((s) => s.id === sessionId)
  const items = Object.entries(quantities).filter(([, q]) => q > 0).map(([typeId, quantity]) => ({ typeId, quantity }))
  const total = items.reduce((a, i) => a + i.quantity, 0)
  const freeTypes = event.types.filter((t) => t.free)
  const set = (k) => (e) => setBuyer((b) => ({ ...b, [k]: e.target.value }))

  function setQuantity(typeId, q) {
    setQuantities((prev) => ({ ...prev, [typeId]: Math.max(0, q) }))
  }
  function toDetails() {
    if (!session || !total) return
    setHolders((prev) => Array.from({ length: total }, (_, i) => prev[i] ?? { name: '', email: '' }))
    setStep('details')
  }
  function validate() {
    const e = {}
    if (buyer.name.trim().length < 2) e.name = 'Escribe tu nombre.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email.trim())) e.email = 'Escribe un correo válido.'
    if (event.policies.holderNameRequired) holders.forEach((h, i) => { if (!h.name.trim()) e[`holder${i}`] = 'Escribe el nombre.' })
    holders.forEach((h, i) => { if (h.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h.email.trim())) e[`holderEmail${i}`] = 'Correo no válido.' })
    if (!accepted) e.accepted = 'Acepta las condiciones del evento.'
    setErrors(e)
    return !Object.keys(e).length
  }
  async function confirm() {
    if (!validate() || submit.state === 'sending') return
    const data = {
      sessionId, items, acceptedPolicyVersion: event.policies.version,
      buyer: { name: buyer.name.trim(), email: buyer.email.trim(), phone: buyer.phone.trim() || null },
      holders: holders.map((h) => ({ name: h.name.trim() || null, email: h.email.trim() || null })),
    }
    setSubmit({ state: 'sending' })
    try {
      const res = await ticketsApi.createOrder(slug, data, keyFor(data), embed ? 'website' : null)
      setSubmit({ state: 'done', order: unwrap(res), credentials: res?.credentials ?? [], manageToken: res?.manageToken ?? null })
      setStep('done')
      onStale()
    } catch (error) {
      // A lost response retries with the same key (the server replays); anything else starts fresh.
      if (!isNetworkError(error)) newAttempt()
      if (['SOLD_OUT', 'SESSION_FULL', 'POLICY_CHANGED', 'SESSION_UNAVAILABLE'].includes(error?.code)) onStale()
      setSubmit({ state: 'error', message: ticketsError(error) })
    }
  }

  if (step === 'done') {
    return (
      <>
        <EventHero event={event} compact />
        <section className="space-y-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6" aria-live="polite">
          <SuccessBanner email={buyer.email.trim()} />
          {session ? <p className="text-sm">{longDate(session.startsAt, tz)}, {time(session.startsAt, tz)}{event.venue ? ` · ${event.venue}` : ''} · Orden <strong>{submit.order.reference}</strong></p> : null}
          <IssuedTickets credentials={submit.credentials} order={submit.order} />
          <div className="flex flex-wrap gap-2">
            {submit.manageToken ? (
              <Button asChild>{embed
                ? <a href={`/app/p/mis-boletos#${submit.manageToken}`} target="_blank" rel="noopener noreferrer">Ver mis boletos<ExternalLink /></a>
                : <Link to={`/app/p/mis-boletos#${submit.manageToken}`}>Ver mis boletos</Link>}</Button>
            ) : null}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Guarda el enlace «Ver mis boletos»: es personal y te permite consultar y reenviar tus boletos sin crear una cuenta.</p>
        </section>
      </>
    )
  }

  return (
    <>
      <EventHero event={event} />
      {event.preview ? <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Vista previa: así se verá la página. No se pueden obtener boletos desde aquí.</AlertDescription></Alert> : null}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {event.description ? (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Acerca del evento</h2>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[hsl(var(--foreground))]/85">{event.description}</p>
            </section>
          ) : null}
          {event.venue ? (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Lugar</h2>
              <p className="flex items-start gap-2 text-[15px]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />{event.venue}</p>
            </section>
          ) : null}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Condiciones</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[hsl(var(--foreground))]/85">
              <li>Máximo {event.policies.maxPerOrder} boletos por orden. Cada QR deja entrar una sola vez.</li>
              {event.policies.holderNameRequired ? <li>Cada boleto lleva el nombre de su asistente.</li> : null}
              <li>{event.policies.transferAllowed ? 'El organizador puede transferir un boleto a otra persona si se lo pides.' : 'Los boletos no se transfieren.'}</li>
              {event.policies.refundText ? <li className="whitespace-pre-wrap">{event.policies.refundText}</li> : null}
            </ul>
          </section>
        </div>

        <aside ref={panelRef} aria-label="Obtener boletos" className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm sm:p-5 lg:sticky lg:top-6">
          {!onSale ? (
            <div className="space-y-1">
              <p className="font-semibold">{STATUS_COPY[event.status]?.title}</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{STATUS_COPY[event.status]?.text}</p>
            </div>
          ) : step === 'select' ? (
            <>
              <h2 className="text-lg font-semibold">Obtener boletos</h2>
              <div className="space-y-2">
                <p className="text-sm font-medium">1. Elige la función</p>
                <SessionPicker sessions={event.sessions} timezone={tz} value={sessionId} onChange={(id) => { setSessionId(id); setQuantities({}) }} />
              </div>
              {session ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">2. Elige tus boletos</p>
                  {event.types.length ? event.types.map((t) => (
                    <TypeRow key={t.id} type={t} availability={t.availability[session.id]} quantity={quantities[t.id] ?? 0}
                      max={Math.max(0, Math.min(t.perOrderMax, event.policies.maxPerOrder - total + (quantities[t.id] ?? 0)))} onChange={(q) => setQuantity(t.id, q)} disabled={event.preview} />
                  )) : <p className="text-sm text-[hsl(var(--muted-foreground))]">Este evento todavía no tiene boletos a la venta.</p>}
                  {event.types.some((t) => !t.free) ? (
                    <p className="flex items-start gap-2 rounded-lg bg-[hsl(var(--muted)/0.6)] p-3 text-xs text-[hsl(var(--muted-foreground))]"><Store className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Los boletos con precio se compran en la taquilla del evento; aquí solo se obtienen los gratuitos.</p>
                  ) : null}
                </div>
              ) : null}
              <Button type="button" className="w-full" size="lg" disabled={!session || !total || event.preview || !freeTypes.length} onClick={toDetails}>
                <Ticket />{total ? `Continuar con ${total} ${total === 1 ? 'boleto' : 'boletos'}` : 'Elige tus boletos'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" aria-label="Volver a la selección" onClick={() => setStep('select')}><ArrowLeft /></Button>
                <h2 className="text-lg font-semibold">Tus datos</h2>
              </div>
              <OrderSummary event={event} session={session} items={items} />
              <TextField label="Nombre completo" required value={buyer.name} onChange={set('name')} error={errors.name} autoComplete="name" maxLength={160} />
              <TextField label="Correo electrónico" required type="email" inputMode="email" value={buyer.email} onChange={set('email')} error={errors.email} autoComplete="email" maxLength={254} hint="Aquí te enviaremos tus boletos." />
              <TextField label="Teléfono (opcional)" type="tel" inputMode="tel" value={buyer.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} />
              {total > 1 || event.policies.holderNameRequired ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Asistentes{event.policies.holderNameRequired ? '' : ' (opcional)'}</legend>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Si escribes el correo de un asistente, también le enviaremos su boleto.</p>
                  {holders.map((h, i) => (
                    <div key={i} className="grid gap-2 rounded-lg border border-[hsl(var(--border))] p-3 sm:grid-cols-2">
                      <TextField label={`Asistente ${i + 1}`} required={event.policies.holderNameRequired} value={h.name} error={errors[`holder${i}`]} maxLength={160}
                        onChange={(e) => setHolders((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <TextField label="Correo (opcional)" type="email" inputMode="email" value={h.email} error={errors[`holderEmail${i}`]} maxLength={254}
                        onChange={(e) => setHolders((list) => list.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                    </div>
                  ))}
                </fieldset>
              ) : null}
              <CheckboxField label="Acepto las condiciones del evento y el uso de mis datos para enviarme mis boletos." checked={accepted} onChange={(e) => setAccepted(e.target.checked)} error={errors.accepted} />
              {submit.state === 'error' ? <Alert variant="destructive" aria-live="polite"><AlertTriangle className="h-4 w-4" /><AlertDescription>{submit.message}</AlertDescription></Alert> : null}
              <Button type="button" className="w-full" size="lg" disabled={submit.state === 'sending'} onClick={confirm}>
                {submit.state === 'sending' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Ticket />}Confirmar y obtener boletos
              </Button>
            </>
          )}
        </aside>
      </div>
    </>
  )
}

function OrderSummary({ event, session, items }) {
  return (
    <div className="space-y-1 rounded-lg bg-[hsl(var(--muted)/0.6)] p-3 text-sm">
      <p className="font-medium">{longDate(session.startsAt, event.timezone)}, {time(session.startsAt, event.timezone)}</p>
      {items.map((i) => <p key={i.typeId} className="flex justify-between gap-2"><span>{i.quantity} × {event.types.find((t) => t.id === i.typeId)?.name}</span><span className="font-medium">Gratis</span></p>)}
    </div>
  )
}
