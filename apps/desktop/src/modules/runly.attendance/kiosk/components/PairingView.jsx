import { Loader2, ShieldAlert, WifiOff, Lock, MonitorSmartphone } from 'lucide-react'
import { Button } from '@runly/ui'

const MESSAGES = {
  unavailable: { Icon: ShieldAlert, title: 'Kiosko no disponible', text: 'Este enlace ya no es válido o el kiosko fue desactivado. Pide un enlace nuevo a un administrador.' },
  revoked: { Icon: Lock, title: 'Kiosko revocado', text: 'Este dispositivo ya no tiene acceso. Pide a un administrador que restablezca el kiosko en Asistencia > Kioskos.' },
  already: { Icon: MonitorSmartphone, title: 'Kiosko ya emparejado', text: 'Este kiosko ya está emparejado con otro dispositivo. Pide a un administrador que lo restablezca para usarlo aquí.' },
  offline: { Icon: WifiOff, title: 'Se necesita conexión', text: 'Conéctate a internet una vez para emparejar este dispositivo. Después podrá trabajar sin conexión.', retry: true },
}

export function PairingView({ phase, pairing, onRetry }) {
  if (phase === 'loading') {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="size-10 animate-spin text-teal-400" aria-label="Cargando" /></div>
  }
  if (phase === 'pairing' && pairing?.recovering) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Loader2 className="size-10 animate-spin text-teal-400" aria-hidden="true" />
        <p className="text-xl text-white">Recuperando el emparejamiento…</p>
      </div>
    )
  }
  if (phase === 'pairing' && pairing) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-teal-300">Emparejar kiosko{pairing.kioskName ? ` · ${pairing.kioskName}` : ''}</p>
        {pairing.expired ? (
          <>
            <p className="text-2xl text-white">El código venció.</p>
            <Button size="lg" className="bg-teal-600 text-white hover:bg-teal-500" onClick={onRetry}>Generar un código nuevo</Button>
          </>
        ) : (
          <>
            <div className="flex gap-2 sm:gap-3" aria-label={`Código de emparejamiento ${pairing.code.split('').join(' ')}`}>
              {pairing.code.split('').map((digit, i) => (
                <span key={i} className="flex h-[clamp(4.5rem,18vmin,9rem)] w-[clamp(3rem,12vmin,6.5rem)] items-center justify-center rounded-2xl bg-white/[0.07] text-[clamp(2.8rem,12vmin,6rem)] font-semibold tabular-nums text-white ring-1 ring-teal-400/40">{digit}</span>
              ))}
            </div>
            <p className="max-w-lg text-[clamp(1.1rem,2.8vmin,1.6rem)] text-slate-200">Pide a un administrador que apruebe este código en <strong className="text-teal-300">Asistencia &gt; Kioskos</strong>.</p>
            <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> Esperando aprobación…</p>
          </>
        )}
      </div>
    )
  }
  const info = MESSAGES[phase] ?? MESSAGES.unavailable
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
      <info.Icon className="size-16 text-slate-400" />
      <h1 className="text-3xl font-semibold text-white">{info.title}</h1>
      <p className="text-lg text-slate-300">{info.text}</p>
      {info.retry && <Button size="lg" className="bg-teal-600 text-white hover:bg-teal-500" onClick={onRetry}>Reintentar</Button>}
    </div>
  )
}
