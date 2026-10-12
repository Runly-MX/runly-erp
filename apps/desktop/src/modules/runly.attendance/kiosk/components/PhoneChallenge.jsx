import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildKioskChallenge, CHALLENGE_REFRESH_MS } from '../lib/kiosk-challenge.js'

const RADIUS = 46
const CIRC = 2 * Math.PI * RADIUS

// "Con mi teléfono": large QR the employee's phone scans. Computed offline from
// the roster's qrSecret and renewed every 25 s (the server accepts 120 s).
export function PhoneChallenge({ secret, kioskId }) {
  const [qr, setQr] = useState(null)
  const [bornAt, setBornAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!secret || !kioskId) return undefined
    let cancelled = false
    const renew = async () => {
      try {
        const challenge = await buildKioskChallenge({ secret, kioskId })
        const url = await QRCode.toDataURL(challenge.text, { margin: 1, width: 560, errorCorrectionLevel: 'M' })
        if (cancelled) return
        setQr(url); setBornAt(Date.now()); setFailed(false)
      } catch { if (!cancelled) setFailed(true) }
    }
    renew()
    const id = setInterval(renew, CHALLENGE_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [secret, kioskId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  if (!secret || !kioskId) {
    return <p className="mx-auto max-w-sm rounded-2xl bg-white/[0.06] p-5 text-center text-slate-200 ring-1 ring-white/10">Para usar este modo, conecta el kiosko a internet una vez para actualizar su configuración.</p>
  }
  const left = Math.min(1, Math.max(0, 1 - (now - bornAt) / CHALLENGE_REFRESH_MS))
  const seconds = Math.ceil((left * CHALLENGE_REFRESH_MS) / 1000)
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <div className="relative rounded-3xl bg-white p-3 shadow-xl">
        {qr && !failed ? <img src={qr} alt="Código para escanear con tu teléfono" className="size-[min(60vw,42vh,22rem)]" draggable="false" /> : <div className="size-[min(60vw,42vh,22rem)] animate-pulse rounded-xl bg-slate-200" />}
        <svg viewBox="0 0 100 100" className="absolute -right-3 -top-3 size-12 -rotate-90 rounded-full bg-slate-900" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#2dd4bf" strokeWidth="8" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - left)} />
        </svg>
        <span className="absolute -right-3 -top-3 flex size-12 items-center justify-center text-xs font-semibold tabular-nums text-white">{seconds}</span>
      </div>
      <p className="text-base text-slate-100">Abre la app Checador en tu teléfono y escanea este código.</p>
      <p className="text-sm text-slate-400">Necesitas internet en tu teléfono.</p>
    </div>
  )
}
