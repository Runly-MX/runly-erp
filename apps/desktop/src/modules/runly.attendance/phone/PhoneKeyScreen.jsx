import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { EnrollForm } from './components/EnrollForm.jsx'
import { KeyCard } from './components/KeyCard.jsx'
import { PhoneHome } from './components/PhoneHome.jsx'
import { ScanFlow } from './components/ScanFlow.jsx'
import { phoneStore } from './lib/phone-store.js'
import { registerAttendanceWorker } from '../kiosk/lib/register-sw.js'
import { RunlyWatermark } from '../components/RunlyWatermark.jsx'

// Public page at /app/attendance/phone, installable as the "Checador" mini app.
// Not enrolled: activation form. Enrolled: scan the kiosk (primary) or show the rotating QR.
export default function PhoneKeyScreen() {
  const [params] = useSearchParams()
  const [identity, setIdentity] = useState(undefined) // undefined = loading, null = not enrolled
  const [view, setView] = useState('home') // home | scan | qr

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

  return (
    <div className="min-h-dvh bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(13,148,136,0.22),transparent_60%)] px-4 pb-16 pt-8 text-slate-50">
      <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-md flex-col items-center justify-center">
        {identity === undefined ? (
          <Loader2 className="size-10 animate-spin text-teal-400" aria-label="Cargando" />
        ) : !identity ? (
          <EnrollForm initialCode={(params.get('c') ?? '').toUpperCase()} onEnrolled={setIdentity} />
        ) : view === 'scan' ? (
          <ScanFlow identity={identity} onClose={() => setView('home')} />
        ) : view === 'qr' ? (
          <KeyCard identity={identity} onBack={() => setView('home')} />
        ) : (
          <PhoneHome identity={identity} onScan={() => setView('scan')} onShowQr={() => setView('qr')} onRemove={remove} />
        )}
      </div>
      <RunlyWatermark />
    </div>
  )
}
