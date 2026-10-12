import { RefreshCw } from 'lucide-react'
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@runly/ui'

export function StatusPill({ online, pending, onClick }) {
  const label = online ? (pending ? `En línea · ${pending} por enviar` : 'En línea') : `Sin conexión · ${pending} pendientes`
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${online ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : 'bg-amber-500/15 text-amber-200 ring-amber-400/40'}`}
      aria-label={`Estado: ${label}. Abrir diagnóstico`}
    >
      <span className={`size-2.5 rounded-full ${online ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
      {label}
    </button>
  )
}

export function DiagnosticsSheet({ open, onOpenChange, kiosk, online, pending, rejected, onSync, photos = 0, geoStatus = null, notes = [] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!bg-slate-900 !text-slate-100 border-slate-700 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Diagnóstico del kiosko</SheetTitle>
          <SheetDescription className="text-slate-400">{kiosk?.name ?? 'Kiosko'} · {online ? 'conectado' : 'sin conexión'}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <p className="text-sm">Checadas pendientes de enviar: <strong>{pending}</strong></p>
          {(kiosk?.requireSelfie || photos > 0) && <p className="text-sm">{photos} fotos pendientes de enviar</p>}
          {kiosk?.geofence && geoStatus === 'denied' && <p className="text-xs text-slate-400">Ubicación no permitida en este dispositivo: las checadas se envían sin coordenadas.</p>}
          {kiosk?.geofence && geoStatus === 'unavailable' && <p className="text-xs text-slate-400">Ubicación no disponible: las checadas se envían sin coordenadas.</p>}
          <Button className="bg-teal-600 text-white hover:bg-teal-500" onClick={onSync}><RefreshCw /> Sincronizar ahora</Button>
          {notes.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-400">
              {notes.map((n, i) => <li key={`${n.at}-${i}`}>{new Date(n.at).toLocaleTimeString('es-MX')} · {n.text}</li>)}
            </ul>
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-300">Checadas rechazadas por el servidor</p>
            {rejected.length === 0 ? (
              <p className="text-sm text-slate-500">Ninguna.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {rejected.map((r, i) => (
                  <li key={`${r.id}-${i}`} className="rounded-lg bg-white/5 p-2">
                    <p className="font-medium text-red-300">{r.reason}</p>
                    <p className="text-xs text-slate-400">{r.person ?? 'Persona desconocida'} · {r.deviceTime ? new Date(r.deviceTime).toLocaleString('es-MX') : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
