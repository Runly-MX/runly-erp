import { useEffect } from 'react'
import { CheckCircle2, Clock, Plus, XCircle } from 'lucide-react'
import { Button } from '@runly/ui'
import { CORRECTION_STATUS, formatDateTime, groupRequests, loadSeenRequests, saveSeenRequests } from '../lib/self-service.js'

const TONES = {
  amber: { box: 'bg-amber-400/15 ring-amber-300/30', text: 'text-amber-200', icon: Clock },
  green: { box: 'bg-emerald-400/15 ring-emerald-300/30', text: 'text-emerald-200', icon: CheckCircle2 },
  gray: { box: 'bg-white/5 ring-white/10', text: 'text-slate-300', icon: XCircle },
}

function RequestRow({ request, isNew }) {
  const status = CORRECTION_STATUS[request.status] ?? CORRECTION_STATUS.pending
  const tone = TONES[status.tone] ?? TONES.gray
  const Icon = tone.icon
  return (
    <li className={`space-y-1 rounded-2xl p-3 ring-1 ${tone.box}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-white">{request.direction === 'in' ? 'Entrada' : 'Salida'} · {formatDateTime(request.occurredAt)}</p>
        <span className={`inline-flex shrink-0 items-center gap-1 text-sm font-medium ${tone.text}`}><Icon className="size-4" /> {status.label}</span>
      </div>
      {request.reason ? <p className="text-sm text-slate-400">{request.reason}</p> : null}
      {request.resolutionNote ? <p className="text-sm text-slate-200">Respuesta: {request.resolutionNote}</p> : null}
      <p className="text-xs text-slate-500">
        Enviada {formatDateTime(request.requestedAt)}{request.resolvedAt ? ` · Respondida ${formatDateTime(request.resolvedAt)}` : ''}
        {isNew ? <span className="ml-2 rounded-full bg-teal-500/30 px-2 py-0.5 text-teal-100">Nueva respuesta</span> : null}
      </p>
    </li>
  )
}

function Group({ title, items, unseen, empty }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}{items.length ? ` (${items.length})` : ''}</h2>
      {items.length ? (
        <ul className="space-y-2">{items.map((r) => <RequestRow key={r.id} request={r} isNew={unseen.has(r.id)} />)}</ul>
      ) : <p className="rounded-2xl bg-white/5 p-3 text-sm text-slate-400 ring-1 ring-white/10">{empty}</p>}
    </section>
  )
}

// Follow-up of the person's forgotten-punch requests: what is waiting and how each one was answered.
// Opening it marks the answers as read (the badge on the home screen clears).
export function MyRequests({ identity, hours, onNew, allowNew = true }) {
  const seen = loadSeenRequests(identity.personId)
  const { pending, resolved, unseen } = groupRequests(hours.data?.corrections, seen)
  const unseenIds = new Set(unseen.map((r) => r.id))

  useEffect(() => {
    if (unseen.length) saveSeenRequests(identity.personId, [...seen, ...unseen.map((r) => r.id)])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.personId, unseen.length])

  if (!hours.data && hours.error) return <p role="alert" className="rounded-2xl bg-red-500/15 p-4 text-sm text-red-100 ring-1 ring-red-400/40">{hours.error}</p>
  return (
    <div className="flex w-full flex-col gap-5">
      {allowNew ? (
        <Button className="h-12 w-full rounded-2xl bg-teal-600 text-base text-white hover:bg-teal-500" onClick={onNew}><Plus /> Nueva solicitud</Button>
      ) : null}
      <Group title="En revisión" items={pending} unseen={unseenIds} empty="No tienes solicitudes pendientes." />
      <Group title="Respondidas" items={resolved} unseen={unseenIds} empty="Aún no te han respondido ninguna solicitud." />
      {hours.error ? <p className="text-center text-xs text-amber-200">Sin conexión: mostrando lo último que se guardó.</p> : null}
    </div>
  )
}
