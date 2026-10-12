import { useEffect, useState } from 'react'
import { Check, LogOut, X, Info, CloudOff } from 'lucide-react'

const TONES = {
  in: { ring: 'stroke-emerald-400', glow: 'bg-emerald-500/25', bg: 'from-emerald-950', text: 'text-emerald-300', bar: 'bg-emerald-400', Icon: Check },
  out: { ring: 'stroke-sky-400', glow: 'bg-sky-500/25', bg: 'from-sky-950', text: 'text-sky-300', bar: 'bg-sky-400', Icon: LogOut },
  reject: { ring: 'stroke-red-400', glow: 'bg-red-500/25', bg: 'from-red-950', text: 'text-red-300', bar: 'bg-red-400', Icon: X },
  info: { ring: 'stroke-amber-400', glow: 'bg-amber-500/25', bg: 'from-amber-950', text: 'text-amber-300', bar: 'bg-amber-400', Icon: Info },
}
const CIRCUMFERENCE = 2 * Math.PI * 70

function initials(name) {
  return String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

export function PunchOverlay({ result, onDismiss, durationMs = 4000 }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    setDrawn(false)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)))
    return () => cancelAnimationFrame(id)
  }, [result?.key])
  if (!result) return null
  const tone = TONES[result.kind] ?? TONES.reject
  const { Icon } = tone
  const time = result.time ? new Date(result.time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }) : null
  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={onDismiss}
      className={`fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center gap-6 bg-gradient-to-b ${tone.bg} to-slate-950 px-6 text-center`}
    >
      <div className="relative flex size-56 items-center justify-center">
        <span className={`absolute inset-4 animate-ping rounded-full ${tone.glow}`} />
        <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
          <circle cx="80" cy="80" r="70" fill="none" strokeWidth="8" className="stroke-white/10" />
          <circle
            cx="80" cy="80" r="70" fill="none" strokeWidth="8" strokeLinecap="round" className={tone.ring}
            style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: drawn ? 0 : CIRCUMFERENCE, transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }}
          />
        </svg>
        {result.person ? (
          <span className="relative flex size-32 items-center justify-center rounded-full bg-white/10 text-5xl font-semibold text-white">{initials(result.person)}</span>
        ) : (
          <Icon className={`relative size-20 ${tone.text}`} />
        )}
        {result.person && (
          <span className={`absolute -bottom-1 -right-1 flex size-14 items-center justify-center rounded-full bg-slate-950 ring-4 ring-slate-950 ${tone.text}`}><Icon className="size-8" /></span>
        )}
      </div>
      <div className="max-w-2xl">
        <p className={`text-[clamp(1.1rem,3vmin,1.6rem)] font-semibold uppercase tracking-[0.2em] ${tone.text}`}>{result.title}</p>
        {result.person && <p className="mt-3 text-[clamp(2rem,7vmin,4rem)] font-semibold leading-tight text-white">{result.person}</p>}
        {result.group && <p className="mt-1 text-[clamp(1rem,2.8vmin,1.5rem)] text-slate-300">{result.group}</p>}
        {time && <p className="mt-4 text-[clamp(1.4rem,4vmin,2.4rem)] font-light tabular-nums text-white/90">{time}</p>}
        {result.message && <p className="mt-3 text-[clamp(1rem,2.6vmin,1.4rem)] text-slate-200">{result.message}</p>}
        {result.smile && <p className="mt-4 animate-pulse text-[clamp(1.2rem,3.4vmin,2rem)] font-medium text-white">Sonríe a la cámara</p>}
        {result.offline &&<p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-slate-200"><CloudOff className="size-4" /> Sin conexión: se enviará al reconectar</p>}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/10">
        <div className={`h-full ${tone.bar}`} style={{ width: drawn ? '0%' : '100%', transition: `width ${durationMs}ms linear` }} />
      </div>
    </div>
  )
}
