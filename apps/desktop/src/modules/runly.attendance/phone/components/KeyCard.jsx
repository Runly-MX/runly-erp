import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildPhonePayload, ROTATE_SECONDS } from '../lib/phone-key.js'
import { requestWakeLock } from '../../kiosk/lib/feedback.js'

const RING = 2 * Math.PI * 28

export function KeyCard({ identity }) {
  const [qr, setQr] = useState(null)
  const [issuedAt, setIssuedAt] = useState(0)
  const [remaining, setRemaining] = useState(ROTATE_SECONDS)

  const rotate = useCallback(async () => {
    const now = Date.now()
    const { payload } = await buildPhonePayload(identity.personId, identity.privateKey, now)
    setQr(await QRCode.toDataURL(payload, { margin: 1, width: 560, errorCorrectionLevel: 'M' }))
    setIssuedAt(now)
  }, [identity])

  useEffect(() => { rotate() }, [rotate])
  useEffect(() => {
    const id = setInterval(() => {
      if (!issuedAt) return
      const left = ROTATE_SECONDS - (Date.now() - issuedAt) / 1000
      if (left <= 0) rotate()
      else setRemaining(left)
    }, 250)
    return () => clearInterval(id)
  }, [issuedAt, rotate])

  useEffect(() => {
    let lock = null
    let cancelled = false
    const acquire = async () => { lock = await requestWakeLock(); if (cancelled) lock?.release?.() }
    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') { acquire(); rotate() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      lock?.release?.()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [rotate])

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5">
      <div className="w-full rounded-[2rem] bg-white p-5 text-slate-900 shadow-[0_0_80px_rgba(13,148,136,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{identity.name}</p>
            <p className="text-sm text-slate-600">Código {identity.code}</p>
          </div>
          <div className="relative flex size-16 shrink-0 items-center justify-center" aria-label={`El código cambia en ${Math.ceil(remaining)} segundos`}>
            <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className="stroke-slate-200" />
              <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-teal-600" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - remaining / ROTATE_SECONDS), transition: 'stroke-dashoffset 250ms linear' }} />
            </svg>
            <span className="text-lg font-semibold tabular-nums text-teal-700">{Math.ceil(remaining)}</span>
          </div>
        </div>
        <div className="mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-white">
          {qr ? <img src={qr} alt="Código QR de asistencia" className="size-full" /> : <div className="size-full animate-pulse bg-slate-100" />}
        </div>
        <p className="mt-3 text-center text-sm text-slate-600">Acércalo a la cámara del kiosko. Funciona sin internet, pero no toma tu foto.</p>
      </div>
    </div>
  )
}
