import { useEffect, useRef, useState } from 'react'
import { Button } from '@runly/ui'
import { CameraOff, Loader2, SwitchCamera } from 'lucide-react'

// Continuous camera QR reader for the gate (zxing, as in Attendance). The back camera
// by default; "Cambiar cámara" cycles every camera the device reports. While `paused`
// (a scan is being answered) reads are dropped, and the same text is ignored while it
// stays in view so one QR held in front of the lens is sent once,
// until it has been out of view for a few seconds.
// shortcut: lives in Boletos (zxing is a desktop dependency, not @runly/ui); extract when a third gate needs it.
const SAME_CODE_MS = 4000

function cameraError(error) {
  if (typeof window !== 'undefined' && !window.isSecureContext) return { title: 'La cámara requiere HTTPS', text: 'Abre Runly desde su dirección segura (https://) o usa la entrada manual.' }
  const name = error?.name
  if (error?.message === 'unsupported') return { title: 'Este navegador no puede usar la cámara', text: 'Prueba con Chrome, Safari o Edge actualizados, o usa la entrada manual.' }
  if (name === 'NotAllowedError' || name === 'SecurityError') return { title: 'Permiso de cámara denegado', text: 'Permite la cámara en la configuración del sitio de tu navegador (icono junto a la dirección) y vuelve a intentarlo.' }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { title: 'No se encontró una cámara', text: 'Conecta una cámara o usa la entrada manual.' }
  if (name === 'NotReadableError') return { title: 'La cámara está ocupada', text: 'Cierra otras apps o pestañas que la estén usando y reintenta.' }
  return { title: 'No se pudo abrir la cámara', text: 'Revisa el permiso del navegador y reintenta.' }
}

export function CheckinScanner({ onText, paused }) {
  const videoRef = useRef(null)
  const pausedRef = useRef(paused)
  const handlerRef = useRef(onText)
  const [cameras, setCameras] = useState([])
  const [index, setIndex] = useState(-1) // -1: let the browser pick the back camera
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { handlerRef.current = onText }, [onText])

  useEffect(() => {
    let controls = null
    let stopped = false
    let lastText = ''
    let lastAt = 0
    setError(null)
    setStarting(true)
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 100 })
        const deviceId = index >= 0 ? cameras[index]?.deviceId : null
        const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }
        controls = await reader.decodeFromConstraints({ video }, videoRef.current, (result) => {
          if (!result || pausedRef.current) return
          const text = result.getText()
          const now = Date.now()
          // Sliding: a QR that stays in view keeps being ignored; shown again later, it is sent.
          if (text === lastText && now - lastAt < SAME_CODE_MS) { lastAt = now; return }
          lastText = text
          lastAt = now
          handlerRef.current(text)
        })
        if (stopped) { controls.stop(); return }
        setStarting(false)
        // Labels and the list are only complete once permission was granted.
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
        if (!stopped) setCameras((prev) => (prev.length === list.length ? prev : list))
      } catch (e) {
        if (!stopped) { setError(cameraError(e)); setStarting(false) }
      }
    })()
    return () => { stopped = true; controls?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameras is read for the chosen index only
  }, [index, attempt])

  const next = () => setIndex((i) => (cameras.length ? (i + 1) % cameras.length : -1))

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black ring-1 ring-black/10 dark:ring-white/10 sm:aspect-video lg:aspect-[4/3]">
      <video ref={videoRef} muted playsInline aria-label="Vista de la cámara" className="size-full object-cover" />
      {error ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-200">
          <CameraOff className="size-10 text-slate-400" aria-hidden="true" />
          <p className="text-base font-semibold text-white">{error.title}</p>
          <p className="max-w-sm text-sm text-slate-300">{error.text}</p>
          <Button type="button" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setAttempt((a) => a + 1)}>Reintentar</Button>
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.4)]" aria-hidden="true" />
          {starting ? <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-200"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />Abriendo cámara…</div> : null}
          {paused ? <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-black/60 px-3 py-1 text-xs font-medium text-white">Validando…</div> : null}
        </>
      )}
      {cameras.length > 1 && !error ? (
        <Button type="button" size="sm" variant="outline" onClick={next} className="absolute right-3 bottom-3 border-white/30 bg-black/50 text-white hover:bg-black/70 hover:text-white">
          <SwitchCamera />Cambiar cámara
        </Button>
      ) : null}
    </div>
  )
}
