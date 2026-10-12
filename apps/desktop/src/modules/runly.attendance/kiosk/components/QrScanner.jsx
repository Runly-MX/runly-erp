import { useEffect, useRef, useState } from 'react'
import { SwitchCamera, CameraOff } from 'lucide-react'
import { Button } from '@runly/ui'

// Camera QR reader (zxing). Identical consecutive reads are debounced; the
// parent decides what a code means.
export function QrScanner({ onResult, paused }) {
  const videoRef = useRef(null)
  const pausedRef = useRef(paused)
  const handlerRef = useRef(onResult)
  const [facing, setFacing] = useState('user')
  const [error, setError] = useState(null)

  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { handlerRef.current = onResult }, [onResult])

  useEffect(() => {
    let controls = null
    let stopped = false
    let lastText = ''
    let lastAt = 0
    setError(null)
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 })
        controls = await reader.decodeFromConstraints({ video: { facingMode: facing } }, videoRef.current, (result) => {
          if (!result || pausedRef.current) return
          const text = result.getText()
          const now = Date.now()
          if (text === lastText && now - lastAt < 3000) return
          lastText = text
          lastAt = now
          handlerRef.current(text)
        })
        if (stopped) controls.stop()
      } catch (e) {
        if (!stopped) setError(e?.message === 'unsupported' ? 'Este navegador no permite usar la cámara.' : 'No se pudo abrir la cámara. Revisa el permiso del navegador.')
      }
    })()
    return () => { stopped = true; controls?.stop() }
  }, [facing])

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
        <video ref={videoRef} muted playsInline className={`size-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
            <CameraOff className="size-10 text-slate-500" />
            <p>{error}</p>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-[14%] rounded-3xl border-2 border-teal-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
        )}
      </div>
      <p className="text-center text-slate-300">Muestra el código QR de tu teléfono frente a la cámara.</p>
      <Button variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
        <SwitchCamera /> Cambiar cámara
      </Button>
    </div>
  )
}
