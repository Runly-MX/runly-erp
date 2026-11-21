import { Button, EmptyState, SectionCard } from '@runly/ui'
import { CalendarDays, CalendarPlus, Ticket } from 'lucide-react'
import { formatDateTime } from '../../runly.bookings/lib/bookingsTime.js'
import { MUTED } from '../lib/ticketingLabels.js'
import { Stat } from './shared.jsx'

// Totals of the event and, per function, how its seats are split.
export function EventOverview({ event, onGo }) {
  const sessions = (event.sessions ?? []).filter((s) => s.status === 'scheduled')
  const sum = (pick) => sessions.reduce((a, s) => a + pick(s), 0)
  const capacity = sum((s) => s.capacity), sold = sum((s) => s.stats.sold), reserved = sum((s) => s.stats.reserved)
  const cancelled = sum((s) => s.stats.cancelled), free = sum((s) => s.available)
  const ready = sessions.length > 0 && (event.types ?? []).some((t) => t.enabled)

  return (
    <div className="space-y-4">
      {!ready ? (
        <SectionCard title="Para empezar a emitir" icon={Ticket} description="Un boleto necesita una función (fecha, hora y cupo de la sala) y un tipo de boleto.">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={sessions.length ? 'outline' : 'primary'} onClick={() => onGo('sessions')}><CalendarPlus />{sessions.length ? 'Funciones listas' : 'Agregar función'}</Button>
            <Button type="button" variant={(event.types ?? []).length ? 'outline' : 'primary'} onClick={() => onGo('types')}><Ticket />{(event.types ?? []).length ? 'Tipos listos' : 'Agregar tipo de boleto'}</Button>
          </div>
        </SectionCard>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Lugares" value={capacity} hint={`${sessions.length} ${sessions.length === 1 ? 'función' : 'funciones'}`} />
        <Stat label="Disponibles" value={free} />
        <Stat label="Apartados por pagar" value={reserved} tone={reserved ? 'warning' : undefined} />
        <Stat label="Vendidos o emitidos" value={sold} />
        <Stat label="Cancelados" value={cancelled} />
      </div>
      <SectionCard title="Funciones" icon={CalendarDays} description="Ocupación de cada función: vendidos, apartados y libres.">
        {!sessions.length ? <EmptyState icon={CalendarDays} title="Sin funciones" description="Agrega la primera en la pestaña Funciones." /> : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {sessions.map((s) => <SessionRow key={s.id} session={s} timezone={event.timezone} />)}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

// Stacked bar: sold, held for payment, free (out of the room capacity).
export function SessionRow({ session: s, timezone, action }) {
  const pct = (n) => `${s.capacity ? (n / s.capacity) * 100 : 0}%`
  const others = Math.max(0, s.seatsTaken - s.stats.sold - s.stats.reserved)
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 sm:w-64">
        <p className="truncate text-sm font-medium">{formatDateTime(s.startsAt, timezone ?? 'UTC')}</p>
        <p className={MUTED}>{s.capacity} lugares</p>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]" role="img" aria-label={`${s.stats.sold} vendidos, ${s.stats.reserved} apartados, ${s.available} libres`}>
          <span className="bg-[hsl(var(--primary))]" style={{ width: pct(s.stats.sold + others) }} />
          <span className="bg-amber-500" style={{ width: pct(s.stats.reserved) }} />
        </div>
        <p className="flex flex-wrap gap-x-4 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />{s.stats.sold} vendidos</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />{s.stats.reserved} apartados</span>
          <span className="font-medium text-[hsl(var(--foreground))]">{s.available} libres</span>
          {s.stats.cancelled ? <span>{s.stats.cancelled} cancelados</span> : null}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  )
}
