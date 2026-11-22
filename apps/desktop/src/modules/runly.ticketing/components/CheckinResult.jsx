import { Button, cn } from '@runly/ui'
import { AlertTriangle, Ban, CheckCircle2, CircleHelp, Clock, ScanLine, ShieldCheck, WifiOff } from 'lucide-react'
import { formatDateTime, formatTime } from '../../runly.bookings/lib/bookingsTime.js'
import { SCAN_RESULT } from '../lib/ticketingLabels.js'

const TONE = {
  success: { box: 'bg-emerald-600 text-white', icon: CheckCircle2, sub: 'text-emerald-50' },
  info: { box: 'bg-sky-600 text-white', icon: ShieldCheck, sub: 'text-sky-50' },
  warning: { box: 'bg-amber-500 text-slate-950', icon: AlertTriangle, sub: 'text-slate-900' },
  danger: { box: 'bg-red-600 text-white', icon: Ban, sub: 'text-red-50' },
  neutral: { box: 'bg-slate-700 text-white', icon: WifiOff, sub: 'text-slate-200' },
}
const ICON = { outside_window: Clock, unknown: CircleHelp, error: AlertTriangle, rate_limited: Clock }

const ago = (at) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000))
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : null
}

// The answer of the last scan, big enough to read from a step away. Never shows
// "Acceso permitido" unless the server registered the admission (kind 'ok').
export function CheckinResult({ result, timezone, deviceId, onAdmit, admitting, onDismiss }) {
  if (!result) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[hsl(var(--border))] p-6 text-center">
        <ScanLine className="size-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <p className="font-medium">Listo para escanear</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Acerca el QR del boleto a la cámara o escribe su código.</p>
      </div>
    )
  }
  const { kind, data } = result
  const label = SCAN_RESULT[kind] ?? SCAN_RESULT.error
  // A lost response retried from the same reader: the person may already be inside.
  const sameReader = kind === 'already_used' && data?.firstAdmission?.deviceId === deviceId && Date.now() - new Date(data.firstAdmission.at).getTime() < 30000
  const tone = TONE[label.tone]
  const Icon = kind === 'ok' ? CheckCircle2 : ICON[kind] ?? tone.icon
  const t = data?.ticket
  const lines = []
  if (kind === 'already_used' && data?.firstAdmission) {
    const f = data.firstAdmission
    lines.push(`Entró a las ${formatTime(f.at, timezone)}${ago(f.at) ? ` (${ago(f.at)})` : ''}${f.operatorName ? ` · ${f.operatorName}` : ''}${f.deviceId === deviceId ? ' · este lector' : ''}`)
    if (sameReader) lines.push('Se registró en este lector hace un momento: si es la misma persona, ya puede pasar.')
  }
  if (kind === 'wrong_session') lines.push(data?.ticketSession ? `Su función: ${formatDateTime(data.ticketSession.startsAt, timezone)}` : 'Corresponde a otro evento.')
  if (kind === 'outside_window' && data?.window) lines.push(`Admisión de ${formatDateTime(data.window.opensAt, timezone)} a ${formatTime(data.window.closesAt, timezone)}`)
  if ((kind === 'error') && result.message) lines.push(result.message)

  return (
    <div role="status" aria-live="assertive" className={cn('relative overflow-hidden rounded-2xl p-5 shadow-sm', tone.box)}>
      <div className="flex items-start gap-4">
        <Icon className="size-12 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-2xl leading-tight font-bold sm:text-3xl">{sameReader ? 'Ya registrado' : label.title}</p>
          {kind !== 'ok' && label.text ? <p className={cn('mt-1 text-sm', tone.sub)}>{label.text}</p> : null}
          {t ? (
            <div className="mt-3 space-y-0.5">
              {t.holderName ? <p className="truncate text-lg font-semibold">{t.holderName}</p> : null}
              <p className={cn('text-sm', tone.sub)}>{t.typeName} · <span className="font-mono tracking-wide">{t.code}</span>{result.manual ? ' · código escrito' : ''}</p>
            </div>
          ) : null}
          {lines.map((line) => <p key={line} className={cn('mt-2 text-sm font-medium', tone.sub)}>{line}</p>)}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {kind === 'valid' && onAdmit ? (
          <Button type="button" onClick={onAdmit} disabled={admitting} className="bg-white text-sky-800 hover:bg-sky-50">Registrar entrada</Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDismiss} className="bg-black/15 text-current hover:bg-black/25 hover:text-current">Listo</Button>
      </div>
    </div>
  )
}

export function RecentScans({ items, timezone }) {
  if (!items?.length) return <p className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">Aún no hay lecturas en esta función.</p>
  return (
    <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Lecturas recientes">
      {items.map((r) => {
        const label = SCAN_RESULT[r.reason] ?? SCAN_RESULT.error
        const dot = { success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-red-500', info: 'bg-sky-500', neutral: 'bg-slate-400' }[label.tone]
        return (
          <li key={r.id} className="flex items-center gap-3 py-2.5">
            <span className={cn('size-2.5 shrink-0 rounded-full', dot)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.reason === 'ok' ? (r.holderName || r.typeName || 'Entrada') : label.title}</p>
              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                {[r.reason !== 'ok' ? r.holderName : null, r.typeName, r.code, r.method === 'code' ? 'código escrito' : null, r.operatorName].filter(Boolean).join(' · ') || 'Sin datos del boleto'}
              </p>
            </div>
            <time className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted-foreground))]" dateTime={r.at}>{formatTime(r.at, timezone)}</time>
          </li>
        )
      })}
    </ul>
  )
}
