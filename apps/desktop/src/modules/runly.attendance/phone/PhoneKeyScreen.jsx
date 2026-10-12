import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { EnrollForm } from './components/EnrollForm.jsx'
import { ForgotPunch } from './components/ForgotPunch.jsx'
import { KeyCard } from './components/KeyCard.jsx'
import { MyHours } from './components/MyHours.jsx'
import { PhoneHome } from './components/PhoneHome.jsx'
import { ScanFlow } from './components/ScanFlow.jsx'
import { REVOKED_NOTICE } from './lib/self-service.js'
import { phoneStore } from './lib/phone-store.js'
import { useMyHours } from './lib/use-my-hours.js'
import { registerAttendanceWorker } from '../kiosk/lib/register-sw.js'
import { RunlyWatermark } from '../components/RunlyWatermark.jsx'

const VIEW_TITLES = { scan: 'Escanear kiosko', qr: 'Mi QR', hours: 'Mis horas', forgot: 'Olvidé checar' }

// Sticky top app bar shared by every sub-view: back on the left, title in the middle, optional action on the right.
function AppBar({ title, onBack, action }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto grid h-14 w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 justify-self-start rounded-xl px-2 text-base text-slate-200 hover:bg-white/10">
          <ArrowLeft className="size-5" /> Volver
        </button>
        <h1 className="truncate text-base font-semibold text-white">{title}</h1>
        <div className="justify-self-end">{action}</div>
      </div>
    </header>
  )
}

// Public page at /app/attendance/phone, installable as the "Checador" mini app.
// Not enrolled: activation form. Enrolled: scan the kiosk (primary) or show the rotating QR.
export default function PhoneKeyScreen() {
  const [params] = useSearchParams()
  const [identity, setIdentity] = useState(undefined) // undefined = loading, null = not enrolled
  const [view, setView] = useState('home') // home | scan | qr | hours | forgot
  const [revokedNotice, setRevokedNotice] = useState(false)

  // The server no longer recognises this phone: drop the key and go back to the activation form.
  const handleRevoked = useCallback(async () => {
    await phoneStore.clear().catch(() => {})
    setView('home')
    setIdentity(null)
    setRevokedNotice(true)
  }, [])

  const hours = useMyHours(identity, handleRevoked)

  useEffect(() => {
    registerAttendanceWorker('/app/attendance/')
    const previous = document.title
    document.title = 'Checador'
    phoneStore.load().then(setIdentity).catch(() => setIdentity(null))
    return () => { document.title = previous }
  }, [])

  const remove = async () => {
    await phoneStore.clear()
    setView('home')
    setIdentity(null)
  }

  const back = () => setView('home')
  const subView = identity && view !== 'home' ? view : null

  const refreshAction = subView === 'hours' ? (
    <button type="button" onClick={hours.refresh} disabled={hours.loading} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-base text-slate-200 hover:bg-white/10 disabled:opacity-60">
      {hours.loading ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />} Actualizar
    </button>
  ) : null

  return (
    <div className="min-h-dvh bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(13,148,136,0.22),transparent_60%)] text-slate-50">
      {subView ? (
        <>
          <AppBar title={VIEW_TITLES[subView]} onBack={back} action={refreshAction} />
          <main className="mx-auto w-full max-w-md px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5">
            {subView === 'scan' ? (
              <ScanFlow identity={identity} onClose={back} onRevoked={handleRevoked} />
            ) : subView === 'qr' ? (
              <KeyCard identity={identity} />
            ) : subView === 'hours' ? (
              <MyHours hours={hours} />
            ) : (
              <ForgotPunch identity={identity} onBack={back} onSent={hours.refresh} onRevoked={handleRevoked} />
            )}
          </main>
        </>
      ) : (
        <div className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
          <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md flex-col items-center justify-center">
            {identity === undefined ? (
              <Loader2 className="size-10 animate-spin text-teal-400" aria-label="Cargando" />
            ) : !identity ? (
              <EnrollForm
                initialCode={(params.get('c') ?? '').toUpperCase()}
                onEnrolled={(next) => { setRevokedNotice(false); setIdentity(next) }}
                notice={revokedNotice ? REVOKED_NOTICE : null}
                onDismissNotice={() => setRevokedNotice(false)}
              />
            ) : (
              <PhoneHome
                identity={identity}
                hours={hours}
                onScan={() => setView('scan')}
                onShowQr={() => setView('qr')}
                onShowHours={() => setView('hours')}
                onForgot={() => setView('forgot')}
                onRemove={remove}
              />
            )}
          </div>
        </div>
      )}
      <RunlyWatermark />
    </div>
  )
}
