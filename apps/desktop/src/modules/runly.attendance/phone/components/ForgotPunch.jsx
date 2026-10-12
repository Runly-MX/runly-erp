import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@runly/ui'
import { buildOccurredAt, localDateInput, localTimeInput, MAX_CORRECTION_DAYS, requestCorrection } from '../lib/self-service.js'

const fieldClass = 'h-12 w-full rounded-xl border border-white/20 bg-white/5 px-3 text-base text-white [color-scheme:dark] focus:border-teal-400 focus:outline-none'

// "Olvidé checar": signed request for a missing punch; the admin reviews it.
export function ForgotPunch({ identity, onBack, onSent }) {
  const [direction, setDirection] = useState('in')
  const [date, setDate] = useState(() => localDateInput())
  const [time, setTime] = useState(() => localTimeInput())
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const today = new Date()
  const min = localDateInput(new Date(today.getTime() - MAX_CORRECTION_DAYS * 86_400_000))
  const max = localDateInput(today)

  const submit = async (event) => {
    event.preventDefault()
    const built = buildOccurredAt(date, time)
    if (built.error) { setError(built.error); return }
    setError('')
    setSending(true)
    try {
      await requestCorrection(identity, { direction, occurredAt: built.iso, reason })
      setSent(true)
      onSent?.()
      setTimeout(onBack, 2200)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-emerald-500/15 p-8 text-center ring-1 ring-emerald-400/40">
        <CheckCircle2 className="size-16 text-emerald-300" />
        <p className="text-lg font-semibold text-white">Solicitud enviada. Tu administrador la revisará.</p>
        <Button className="h-12 rounded-2xl bg-white/15 px-8 text-white hover:bg-white/25" onClick={onBack}>Listo</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4 pb-12">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 text-slate-300 hover:bg-white/10 hover:text-white" onClick={onBack}><ArrowLeft /> Volver</Button>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">Olvidé checar</h2>
        <p className="text-sm text-slate-400">Pide que se registre una checada que no hiciste. Solo los últimos {MAX_CORRECTION_DAYS} días.</p>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm text-slate-300">
          Fecha
          <input type="date" className={fieldClass} value={date} min={min} max={max} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          Hora
          <input type="time" className={fieldClass} value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>

      <label className="space-y-1 text-sm text-slate-300">
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
