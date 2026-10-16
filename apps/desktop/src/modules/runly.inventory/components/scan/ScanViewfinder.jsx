import {
  AlertTriangle, CameraOff, CheckCircle2, CopyCheck, Keyboard, Loader2, Pause, Play, RefreshCw, SearchX, Settings, ShieldAlert,
} from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { CAMERA_STATUS_LABEL } from '../../lib/scan-kiosk.js'

// Visual layer over the camera video: scan frame with corner brackets, live
// status chip, read feedback banner (top edge, never over the code) and the
// paused / no-permission / no-camera panels with a recovery path.

const TONE = {
  ok: { frame: 'border-emerald-400', glow: 'shadow-[inset_0_0_0_4px_rgb(52_211_153/0.9)]', banner: 'bg-emerald-700 text-white', icon: CheckCircle2 },
  duplicate: { frame: 'border-amber-300', glow: 'shadow-[inset_0_0_0_4px_rgb(252_211_77/0.9)]', banner: 'bg-amber-300 text-amber-950', icon: CopyCheck },
  missing: { frame: 'border-red-400', glow: 'shadow-[inset_0_0_0_4px_rgb(248_113_113/0.9)]', banner: 'bg-red-700 text-white', icon: SearchX },
}

const CHIP_DOT = {
  scanning: 'bg-emerald-400',
  starting: 'bg-sky-300',
  paused: 'bg-amber-300',
  denied: 'bg-red-400',
  unavailable: 'bg-red-400',
  failed: 'bg-red-400',
}

function Corner({ className }) {
  return <span aria-hidden="true" className={cn('absolute size-7 border-white drop-shadow-[0_0_2px_rgb(0_0_0/0.85)] transition-colors duration-150 motion-reduce:transition-none sm:size-9', className)} />
}

export function ScanFrame({ tone }) {
  const color = TONE[tone]?.frame
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-[14%] inset-y-[16%] rounded-md shadow-[0_0_0_9999px_rgb(2_6_23/0.45)]">
      <Corner className={cn('left-0 top-0 rounded-tl-md border-l-4 border-t-4', color)} />
      <Corner className={cn('right-0 top-0 rounded-tr-md border-r-4 border-t-4', color)} />
      <Corner className={cn('bottom-0 left-0 rounded-bl-md border-b-4 border-l-4', color)} />
      <Corner className={cn('bottom-0 right-0 rounded-br-md border-b-4 border-r-4', color)} />
      <span className="absolute inset-x-[10%] top-1/2 h-px bg-white/45" />
    </div>
  )
}

export function StatusChip({ status }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-md bg-black/60 px-2.5 text-xs font-semibold text-white backdrop-blur-sm">
      {status === 'starting' ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : <span aria-hidden="true" className={cn('size-2 rounded-full', CHIP_DOT[status] ?? 'bg-slate-300', status === 'scanning' && 'motion-safe:animate-pulse')} />}
      {CAMERA_STATUS_LABEL[status]}
    </span>
  )
}

// feedback: { tone: 'ok'|'duplicate'|'missing', title, detail } | null
export function FeedbackBanner({ feedback }) {
  if (!feedback) return null
  const tone = TONE[feedback.tone] ?? TONE.missing
  const Icon = tone.icon
  return (
    <div className={cn('pointer-events-none absolute inset-x-2 top-2 flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 shadow-lg', tone.banner)}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold">{feedback.title}</span>
        {feedback.detail ? <span className="opacity-90"> · {feedback.detail}</span> : null}
      </p>
    </div>
  )
}

export const edgeGlow = (tone) => TONE[tone]?.glow ?? null

const RECOVERY = {
  denied: {
    icon: ShieldAlert,
    title: 'Sin permiso para usar la cámara',
    body: 'Permite el acceso a la cámara en el navegador (icono del candado junto a la dirección) o en los ajustes del teléfono y vuelve a intentarlo.',
  },
  unavailable: {
    icon: CameraOff,
    title: 'No hay cámara disponible',
    body: 'Este equipo o navegador no tiene una cámara que Runly pueda usar. Escribe el código o usa un lector USB o Bluetooth.',
  },
  failed: {
    icon: AlertTriangle,
    title: 'No se pudo abrir la cámara',
    body: 'Puede estar en uso por otra aplicación. Ciérrala y vuelve a intentarlo, o escribe el código.',
  },
}

// Paused or error panel, centered over the (dark) viewfinder.
export function ViewfinderPanel({ status, onResume, onRetry, onSettings, onManual }) {
  if (status === 'paused') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center text-white">
        <Pause className="size-9 text-white/80" aria-hidden="true" />
        <p className="text-sm font-medium">Lectura en pausa</p>
        <Button type="button" variant="secondary" className="h-11 px-5" onClick={onResume}><Play className="mr-2 size-4" />Reanudar</Button>
      </div>
    )
  }
  const info = RECOVERY[status]
  if (!info) return null
  const Icon = info.icon
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-slate-950 p-5 text-center text-slate-100" role="alert">
      <Icon className="size-9 shrink-0 text-slate-300" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <p className="text-base font-semibold">{info.title}</p>
        <p className="text-sm leading-relaxed text-slate-300">{info.body}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {status !== 'unavailable' ? <Button type="button" variant="secondary" className="h-11" onClick={onRetry}><RefreshCw className="mr-2 size-4" />Reintentar</Button> : null}
        {status === 'denied' && onSettings ? <Button type="button" variant="secondary" className="h-11" onClick={onSettings}><Settings className="mr-2 size-4" />Abrir ajustes</Button> : null}
        <Button type="button" variant="outline" className="h-11 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={onManual}>
          <Keyboard className="mr-2 size-4" />Escribir código
        </Button>
      </div>
    </div>
  )
}
