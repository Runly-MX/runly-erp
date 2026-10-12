import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@runly/ui'
import {
  buildDayOptions, buildMinuteOptions, buildOccurredAt, defaultTimeParts, HOUR_OPTIONS, isRevokedError, MAX_CORRECTION_DAYS, requestCorrection,
} from '../lib/self-service.js'

const selectClass = 'h-12 w-full min-w-0 appearance-none rounded-xl border border-white/20 bg-slate-900 pl-3 pr-9 text-base text-white [color-scheme:dark] focus:border-teal-400 focus:outline-none'

function SelectBox({ label, value, onChange, children }) {
  return (
    <label className="block min-w-0 space-y-1 text-sm text-slate-300">
      {label}
      <span className="relative block">
        <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </span>
    </label>
  )
}

// "Olvidé checar": signed request for a missing punch; the admin reviews it.
export function ForgotPunch({ identity, onBack, onSent, onRevoked }) {
  const [direction, setDirection] = useState('in')
  const days = useMemo(() => buildDayOptions(), [])
  const [date, setDate] = useState(() => days[0].value)
  const [{ hour, minute }, setTime] = useState(() => defaultTimeParts())
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const built = buildOccurredAt(date, `${hour}:${minute}`)
    if (built.error) { setError(built.error); return }
    setError('')
    setSending(true)
    try {
      await requestCorrection(identity, { direction, occurredAt: built.iso, reason })
      setSent(true)
      onSent?.()
      setTimeout(onBack, 2200)
    } catch (e) {
      if (isRevokedError(e)) { onRevoked?.(); return }
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex w-full flex-col items-center gap-4 rounded-3xl bg-emerald-500/15 p-8 text-center ring-1 ring-emerald-400/40">
        <CheckCircle2 className="size-16 text-emerald-300" />
        <p className="text-lg font-semibold text-white">Solicitud enviada. Tu administrador la revisará.</p>
        <Button className="h-12 rounded-2xl bg-white/15 px-8 text-white hover:bg-white/25" onClick={onBack}>Listo</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full min-w-0 flex-col gap-4">
      <p className="text-sm text-slate-400">Pide que se registre una checada que no hiciste. Solo los últimos {MAX_CORRECTION_DAYS} días.</p>

      <div role="radiogroup" aria-label="Tipo de checada" className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1">
        {[['in', 'Entrada'], ['out', 'Salida']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={direction === value}
            onClick={() => setDirection(value)}
            className={`min-h-12 rounded-xl text-base font-semibold transition ${direction === value ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <SelectBox label="Día" value={date} onChange={setDate}>
        {days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </SelectBox>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
        <SelectBox label="Hora" value={hour} onChange={(v) => setTime((t) => ({ ...t, hour: v }))}>
          {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
        </SelectBox>
        <SelectBox label="Minuto" value={minute} onChange={(v) => setTime((t) => ({ ...t, minute: v }))}>
          {buildMinuteOptions(minute).map((m) => <option key={m} value={m}>{m}</option>)}
        </SelectBox>
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl border-white/20 bg-transparent px-3 text-white hover:bg-white/10"
          onClick={() => { setDate(days[0].value); setTime(defaultTimeParts(new Date(), true)) }}
        >
          Ahora
        </Button>
      </div>

      <label className="block min-w-0 space-y-1 text-sm text-slate-300">
        Motivo (opcional)
        <textarea
          className="min-h-24 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-base text-white focus:border-teal-400 focus:outline-none"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. Se me descompuso el teléfono"
        />
      </label>

      {error ? <p role="alert" className="rounded-xl bg-red-500/15 p-3 text-sm text-red-100 ring-1 ring-red-400/40">{error}</p> : null}

      <Button type="submit" size="lg" disabled={sending} className="h-14 w-full rounded-2xl bg-teal-600 text-lg text-white hover:bg-teal-500">
        {sending ? <><Loader2 className="animate-spin" /> Enviando…</> : 'Enviar solicitud'}
      </Button>
    </form>
  )
}
