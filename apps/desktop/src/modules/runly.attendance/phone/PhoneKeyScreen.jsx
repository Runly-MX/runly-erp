import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { EnrollForm } from './components/EnrollForm.jsx'
import { KeyCard } from './components/KeyCard.jsx'
import { phoneStore } from './lib/phone-store.js'
import { registerAttendanceWorker } from '../kiosk/lib/register-sw.js'

// Public page at /app/attendance/phone: enroll once, then show the rotating QR.
export default function PhoneKeyScreen() {
  const [params] = useSearchParams()
  const [identity, setIdentity] = useState(undefined) // undefined = loading, null = not enrolled

  useEffect(() => {
    registerAttendanceWorker('/app/attendance/')
    const previous = document.title
    document.title = 'Llave de asistencia'
    phoneStore.load().then(setIdentity).catch(() => setIdentity(null))
    return () => { document.title = previous }
  }, [])

  const remove = async () => {
    await phoneStore.clear()
    setIdentity(null)
  }

  return (
    <div className="min-h-dvh bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(13,148,136,0.22),transparent_60%)] px-4 py-8 text-slate-50">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col items-center justify-center">
        {identity === undefined ? (
          <Loader2 className="size-10 animate-spin text-teal-400" aria-label="Cargando" />
        ) : identity ? (
          <KeyCard identity={identity} onRemove={remove} />
        ) : (
          <EnrollForm initialCode={(params.get('c') ?? '').toUpperCase()} onEnrolled={setIdentity} />
        )}
      </div>
    </div>
  )
}
