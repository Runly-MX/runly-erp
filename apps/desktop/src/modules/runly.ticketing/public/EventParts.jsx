import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button, StatusPill, cn } from '@runly/ui'
import { CalendarDays, CheckCircle2, Clock3, MapPin, Minus, Plus, Ticket } from 'lucide-react'
import { dayLabel, dayNumber, longDate, money, monthShort, shortDate, time } from './ticketPortalLib.js'

// Cover with the event's essentials over it; without a cover, the business accent fills in.
export function EventHero({ event, compact = false }) {
  const tz = event.timezone
  const first = event.sessions[0]
  return (
    <header className={cn('relative isolate overflow-hidden rounded-2xl bg-(--brand-primary) text-white shadow-sm', compact ? 'min-h-48' : 'min-h-64 sm:min-h-80')}>
      {event.coverUrl
        ? <img src={event.coverUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        : <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.28),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(0,0,0,0.35),transparent_50%)]" />}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/5" />
      <div className={cn('flex h-full flex-col justify-end gap-3', compact ? 'min-h-48 p-4' : 'min-h-64 p-5 sm:min-h-80 sm:p-8')}>
        <div className="flex items-center gap-2 text-sm text-white/85">
          {event.company.logoUrl ? <img src={event.company.logoUrl} alt="" className="h-7 w-7 rounded-md bg-white object-contain p-0.5" /> : null}
          <span className="truncate">Organiza {event.company.name}</span>
        </div>
        <h1 className={cn('font-semibold leading-tight tracking-tight [text-wrap:balance]', compact ? 'text-2xl' : 'text-3xl sm:text-5xl')}>{event.title}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          {first ? <Chip icon={CalendarDays}>{event.sessions.length > 1 ? `${shortDate(first.startsAt, tz)} y ${event.sessions.length - 1} más` : `${longDate(first.startsAt, tz)}, ${time(first.startsAt, tz)}`}</Chip> : null}
          {event.venue ? <Chip icon={MapPin}>{event.venue}</Chip> : null}
        </div>
      </div>
    </header>
  )
}
const Chip = ({ icon: Icon, children }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{children}</span></span>
)

const AVAILABILITY = {
  sold_out: { label: 'Agotado', tone: 'danger' },
  few: (left) => ({ label: left === 1 ? 'Queda 1' : `Quedan ${left}`, tone: 'warning' }),
  available: { label: 'Disponible', tone: 'success' },
}
export function availabilityPill(a) {
  if (!a) return null
  const meta = a.state === 'few' ? AVAILABILITY.few(a.left) : AVAILABILITY[a.state]
  return <StatusPill tone={meta.tone} size="sm">{meta.label}</StatusPill>
}

// Functions as date tiles (radio group); sold-out ones stay visible but disabled.
export function SessionPicker({ sessions, timezone, value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Función" className="grid min-w-0 grid-cols-1 gap-2">
      {sessions.map((s) => {
        const active = s.id === value
        const soldOut = s.state === 'sold_out'
        return (
          <button key={s.id} type="button" role="radio" aria-checked={active} disabled={soldOut} onClick={() => onChange(s.id)}
            className={cn('flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55',
              active ? 'border-(--brand-primary) bg-(--brand-primary)/8' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.5)]')}>
            <span className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg leading-none', active ? 'bg-(--brand-primary) text-(--brand-primary-foreground)' : 'bg-[hsl(var(--muted))]')}>
              <span className="text-xl font-semibold">{dayNumber(s.startsAt, timezone)}</span>
              <span className="text-[11px] uppercase tracking-wide">{monthShort(s.startsAt, timezone)}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold [text-wrap:pretty]">{dayLabel(s.startsAt, timezone)}</span>
              <span className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{time(s.startsAt, timezone)} a {time(s.endsAt, timezone)}</span>
            </span>
            {availabilityPill(s)}
          </button>
        )
      })}
    </div>
  )
}

// One row per ticket type: price or "Gratis", availability for the chosen function and a stepper.
export function TypeRow({ type, availability, quantity, max, onChange, disabled }) {
  const paid = !type.free
  const closed = type.sale !== 'open'
  const soldOut = availability?.state === 'sold_out'
  const limit = Math.min(max, availability?.state === 'few' ? availability.left : max)
  const blocked = disabled || paid || closed || soldOut
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{type.name}{availabilityPill(!paid && !closed ? availability : null)}</p>
        {type.description ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{type.description}</p> : null}
        <p className="mt-1 text-sm font-medium">{paid ? <>{money(type.price, type.currency) ?? 'Con precio'} <span className="font-normal text-[hsl(var(--muted-foreground))]">· se compra en taquilla</span></> : 'Gratis'}</p>
        {closed ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{type.sale === 'not_started' ? 'La venta todavía no empieza.' : 'La venta terminó.'}</p> : null}
      </div>
      {blocked ? null : (
        <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${type.name}`}>
          <Button type="button" variant="outline" size="icon" aria-label={`Quitar un boleto ${type.name}`} disabled={quantity <= 0} onClick={() => onChange(quantity - 1)}><Minus /></Button>
          <output className="w-9 text-center text-base font-semibold tabular-nums" aria-live="polite">{quantity}</output>
          <Button type="button" variant="outline" size="icon" aria-label={`Agregar un boleto ${type.name}`} disabled={quantity >= limit} onClick={() => onChange(quantity + 1)}><Plus /></Button>
        </div>
      )}
    </div>
  )
}

// The QR codes the visitor just obtained (once; the email carries them too).
export function IssuedTickets({ credentials, order }) {
  const [images, setImages] = useState({})
  useEffect(() => {
    let alive = true
    Promise.all((credentials ?? []).map(async (c) => [c.ticketId, await QRCode.toDataURL(c.qr, { margin: 1, width: 320, errorCorrectionLevel: 'M' })]))
      .then((pairs) => { if (alive) setImages(Object.fromEntries(pairs)) })
    return () => { alive = false }
  }, [credentials])
  if (!credentials?.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {credentials.map((c, i) => {
        const ticket = order.tickets.find((t) => t.id === c.ticketId)
        return (
          <figure key={c.ticketId} className="flex flex-col items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-center text-slate-900">
            <figcaption className="text-xs font-medium uppercase tracking-wide text-slate-500">Boleto {i + 1} de {credentials.length}{ticket ? ` · ${ticket.type}` : ''}</figcaption>
            {images[c.ticketId] ? <img src={images[c.ticketId]} alt={`Código QR del boleto ${i + 1}`} className="h-48 w-48" /> : <div className="h-48 w-48 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />}
            <p className="text-sm font-semibold">{ticket?.holderName}</p>
          </figure>
        )
      })}
    </div>
  )
}

export function SuccessBanner({ email }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold">¡Listo, tus boletos están emitidos!</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Te enviamos una copia a <strong className="text-[hsl(var(--foreground))]">{email}</strong>. Muestra el código QR en la entrada; cada uno sirve una sola vez.</p>
      </div>
    </div>
  )
}

export const TicketIcon = Ticket
