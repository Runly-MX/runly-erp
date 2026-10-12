import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CameraOff, CheckCircle2, Loader2, LogOut, X } from 'lucide-react'
import { Button } from '@runly/ui'
import { beep, haptic } from '../../kiosk/lib/feedback.js'
import { currentPosition, isChallenge, postPhonePunch, signChallenge } from '../lib/phone-punch.js'

const timeFormat = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

// Back-camera reader (zxing, same approach as the kiosk scanner). Calls onText for every read.
function Scanner({ onText, paused }) {
  const videoRef = useRef(null)
  const pausedRef = useRef(paused)
  const handlerRef = useRef(onText)
  const [error, setError] = useState(null)
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { handlerRef.current = onText }, [onText])

  useEffect(() => {
    let controls = null
    let stopped = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 })
        controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, (result) => {
          if (result && !pausedRef.current) handlerRef.current(result.getText())
        })
        if (stopped) controls.stop()
      } catch (e) {
        if (!stopped) setError(e?.message === 'unsupported' ? 'Este navegador no permite usar la cámara.' : 'No se pudo abrir la cámara. Revisa el permiso del navegador.')
      }
    })()
    return () => { stopped = true; controls?.stop() }
  }, [])

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
      <video ref={videoRef} muted playsInline className="size-full object-cover" />
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
          <CameraOff className="size-10 text-slate-500" />
          <p>{error}</p>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-[14%] rounded-3xl border-2 border-teal-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
      )}
    </div>
  )
}

function ResultView({ result, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 7000)
    return () => clearTimeout(id)
  }, [onDone])
  const isIn = result.direction === 'in'
  const Icon = isIn ? CheckCircle2 : LogOut
  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-8 text-center text-white ${isIn ? 'bg-emerald-600' : 'bg-blue-600'}`} role="status">
      <Icon className="size-24" />
      <h2 className="text-3xl font-bold">{isIn ? 'Entrada registrada' : 'Salida registrada'}</h2>
      <p className="text-2xl font-semibold">{result.name}</p>
      <p className="text-lg opacity-90">{result.kioskName}</p>
      <p className="text-5xl font-bold tabular-nums">{timeFormat(result.occurredAt)}</p>
      <Button size="lg" className="mt-6 h-14 rounded-2xl bg-white/20 px-10 text-lg text-white hover:bg-white/30" onClick={onDone}>Listo</Button>
    </div>
  )
}

// Full scan-and-punch flow. identity = { personId, privateKey }.
export function ScanFlow({ identity, onClose }) {
  const [phase, setPhase] = useState('scanning') // scanning | sending | result | error
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const [hint, setHint] = useState('')
  const busyRef = useRef(false)
  const positionRef = useRef(null)

  // Ask for location while the camera warms up so the punch itself never waits on it.
  useEffect(() => { positionRef.current = currentPosition(4000) }, [])

  const handleText = useCallback(async (text) => {
    if (busyRef.current) return
    const challenge = text.trim()
    if (!isChallenge(challenge)) {
      setHint('Ese no es el código del kiosko. Escanea el que aparece en su pantalla.')
      return
    }
    busyRef.current = true
    setHint('')
    setPhase('sending')
    try {
      const [signature, position] = await Promise.all([
        signChallenge(identity.personId, challenge, identity.privateKey),
        positionRef.current ?? Promise.resolve(null),
      ])
      const data = await postPhonePunch({ challenge, personId: identity.personId, signature, position })
      haptic([60, 40, 60])
      beep(data.direction)
      setResult(data)
      setPhase('result')
    } catch (e) {
      haptic(200)
      beep('error')
      setMessage(e.message)
      setPhase('error')
    }
  }, [identity])

  const retry = () => { busyRef.current = false; setPhase('scanning') }

  if (phase === 'result') return <ResultView result={result} onDone={onClose} />

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Escanear kiosko</h2>
        <Button variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Cerrar"><X /></Button>
      </div>
      {phase === 'error' ? (
        <div role="alert" className="flex w-full flex-col items-center gap-4 rounded-3xl bg-red-500/15 p-6 text-center ring-1 ring-red-400/40">
          <AlertTriangle className="size-12 text-red-300" />
          <p className="text-lg text-red-50">{message}</p>
          <Button size="lg" className="h-12 rounded-2xl bg-white/15 text-white hover:bg-white/25" onClick={retry}>Intentar de nuevo</Button>
        </div>
      ) : (
        <>
          <Scanner onText={handleText} paused={phase !== 'scanning'} />
          {phase === 'sending'
            ? <p className="flex items-center gap-2 text-slate-200"><Loader2 className="size-5 animate-spin" /> Registrando…</p>
            : <p className="text-center text-slate-300">{hint || 'Apunta la cámara al código QR que muestra el kiosko.'}</p>}
        </>
      )}
    </div>
  )
}
