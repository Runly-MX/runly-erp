import { useState } from 'react'
import { BarChart3, ChevronRight, ClipboardList, QrCode, ScanLine, Trash2, UserRoundCheck } from 'lucide-react'
import { Button, ConfirmDialog } from '@runly/ui'
import { InstallButton } from './InstallButton.jsx'
import { groupRequests, hoursPreview, loadSeenRequests } from '../lib/self-service.js'

// Main screen of the installed Checador: scan the kiosk (primary), show my QR (fallback),
// my hours and the forgotten-punch request.
export function PhoneHome({ identity, hours, onScan, onShowQr, onShowHours, onRequests, onForgot, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const preview = hoursPreview(hours?.data)
  const requests = groupRequests(hours?.data?.corrections, loadSeenRequests(identity.personId))
  const requestsNote = requests.unseen.length ? `${requests.unseen.length} con respuesta nueva` : requests.pending.length ? `${requests.pending.length} en revisión` : 'Da seguimiento a tus solicitudes'
  const allowCorrections = hours?.data ? hours.data.allowCorrections !== false : true
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm text-slate-400">Hola</p>
        <h1 className="text-2xl font-semibold text-white">{identity.name}</h1>
        <p className="text-sm text-slate-400">Código {identity.code}</p>
      </div>

      <div className="w-full space-y-2">
        <Button size="lg" className="h-20 w-full rounded-3xl bg-teal-600 text-xl text-white hover:bg-teal-500" onClick={onScan}>
          <ScanLine className="size-7" /> Escanear kiosko
        </Button>
        <p className="px-2 text-center text-sm text-slate-400">Con internet: escanea el código del kiosko. Es lo más seguro y toma tu foto.</p>
      </div>

      <div className="w-full space-y-2">
        <Button variant="outline" size="lg" className="h-14 w-full rounded-2xl border-white/20 bg-transparent text-lg text-white hover:bg-white/10" onClick={onShowQr}>
          <QrCode className="size-5" /> Mostrar mi QR
        </Button>
        <p className="px-2 text-center text-sm text-slate-400">Sin señal o si el kiosko no tiene escaneo: muestra tu QR a su cámara.</p>
      </div>

      <div className="w-full space-y-3">
        <button
          type="button"
          onClick={onShowHours}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-teal-500/15 px-4 py-3 text-left ring-1 ring-teal-400/40 transition hover:bg-teal-500/25"
        >
          <BarChart3 className="size-6 shrink-0 text-teal-300" />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold text-white">Mis horas</span>
            <span className="block truncate text-sm text-teal-100/80">{preview || 'Revisa tu semana y tus checadas'}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-teal-300" />
        </button>
        {allowCorrections || hours?.data?.corrections?.length ? (
          <button
            type="button"
            onClick={onRequests}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 ring-white/20 transition hover:bg-white/10"
          >
            <ClipboardList className="size-5 shrink-0 text-slate-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium text-white">Mis solicitudes</span>
              <span className={`block truncate text-sm ${requests.unseen.length ? 'text-teal-300' : 'text-slate-400'}`}>{requestsNote}</span>
            </span>
            {requests.unseen.length ? <span className="min-w-6 rounded-full bg-teal-500 px-2 py-0.5 text-center text-sm font-semibold text-white">{requests.unseen.length}</span> : null}
            <ChevronRight className="size-5 shrink-0 text-slate-400" />
          </button>
        ) : null}
        {allowCorrections ? (
          <button
            type="button"
            onClick={onForgot}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 ring-white/20 transition hover:bg-white/10"
          >
            <UserRoundCheck className="size-5 shrink-0 text-slate-300" />
            <span className="min-w-0 flex-1 text-base font-medium text-white">Olvidé checar</span>
            <ChevronRight className="size-5 shrink-0 text-slate-400" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-2">
        <InstallButton />
        <Button variant="ghost" className="text-slate-400 hover:bg-white/10 hover:text-red-300" onClick={() => setConfirmRemove(true)}><Trash2 /> Quitar este teléfono</Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Quitar este teléfono"
        description="Se borrará la llave guardada en este dispositivo. Para volver a usarlo necesitarás una invitación nueva de tu administrador."
        confirmLabel="Quitar"
        onConfirm={onRemove}
      />
    </div>
  )
}
