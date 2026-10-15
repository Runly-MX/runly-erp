import { useEffect, useRef, useState } from 'react'
import { CameraOff, Flashlight, FlashlightOff, SwitchCamera } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { native } from '../../../../native/index.js'

const REPEAT_WINDOW_MS = 2500
const FLASH_RING = {
  ok: 'border-emerald-400',
  duplicate: 'border-amber-400',
  missing: 'border-red-400',
}

// The Android app asks for the OS camera permission through its bridge; in a
// browser or the desktop shell getUserMedia prompts by itself.
async function ensureNativeCameraPermission() {
  try { if (native.isMobile()) await native.device.requestPermission('camera') } catch { /* older app or web: getUserMedia decides */ }
}

// Continuous QR + barcode reader (zxing multi-format, back camera first).
// The same text read again within REPEAT_WINDOW_MS is ignored so one code in
// front of the lens is a single read; the parent decides what it means.
export function ScanCamera({ active = true, onRead, flash = null, className }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const handlerRef = useRef(onRead)
  const [deviceId, setDeviceId] = useState(null)
  const [devices, setDevices] = useState([])
  const [torch, setTorch] = useState({ supported: false, on: false })
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => { handlerRef.current = onRead }, [onRead])

  useEffect(() => {
    if (!active) return undefined
    let stopped = false
    let lastText = ''
    let lastAt = 0
    setError(null)
    setStarting(true)
    setTorch({ supported: false, on: false })
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        await ensureNativeCameraPermission()
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 300 })
        const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }
        const controls = await reader.decodeFromConstraints({ video }, videoRef.current, (result) => {
          if (!result) return
          const text = result.getText()
          const now = Date.now()
          if (text === lastText && now - lastAt < REPEAT_WINDOW_MS) { lastAt = now; return }
          lastText = text
          lastAt = now
          handlerRef.current?.(text)
        })
        if (stopped) { controls.stop(); return }
        controlsRef.current = controls
        setTorch({ supported: typeof controls.switchTorch === 'function', on: false })
        // Labels (and so the device list) are only available after the permission.
        const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
        if (!stopped) setDevices(inputs)
      } catch (e) {
        if (stopped) return
        const name = e?.name ?? e?.message
        setError(name === 'unsupported'
          ? 'Este navegador no permite usar la cámara. Usa el campo de código o un lector USB.'
          : name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara en el navegador o en los ajustes del teléfono.'
            : 'No se pudo abrir la cámara. Usa el campo de código o un lector USB.')
      } finally {
        if (!stopped) setStarting(false)
      }
    })()
    return () => {
      stopped = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [active, deviceId])

  async function toggleTorch() {
    const next = !torch.on
    try {
      await controlsRef.current?.switchTorch?.(next)
      setTorch((t) => ({ ...t, on: next }))
    } catch {
      setTorch({ supported: false, on: false })
    }
  }

  function switchCamera() {
    if (devices.length < 2) return
    const current = controlsRef.current?.streamVideoSettingsGet?.((track) => [track])?.deviceId ?? deviceId
    const index = devices.findIndex((d) => d.deviceId === current)
    setDeviceId(devices[(index + 1) % devices.length].deviceId)
  }

  return (
    <div className={cn('relative overflow-hidden rounded-md bg-black', className)}>
      <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label="Vista de la cámara" />
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-200">
          <CameraOff className="size-10 text-slate-400" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-[12%] rounded-md border-2 shadow-[0_0_0_9999px_rgba(2,6,23,0.4)] transition-colors duration-200 motion-reduce:transition-none',
            FLASH_RING[flash] ?? 'border-white/70',
          )}
        />
      )}
      {starting && !error ? <p className="absolute inset-x-0 top-3 text-center text-xs text-white/80">Abriendo la cámara…</p> : null}
      {!error ? (
        <div className="absolute bottom-3 right-3 flex gap-2">
          {torch.supported ? (
            <Button type="button" size="icon" variant="secondary" className="size-11" onClick={toggleTorch}
              aria-pressed={torch.on} aria-label={torch.on ? 'Apagar linterna' : 'Encender linterna'}>
              {torch.on ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
            </Button>
          ) : null}
          {devices.length > 1 ? (
            <Button type="button" size="icon" variant="secondary" className="size-11" onClick={switchCamera} aria-label="Cambiar cámara">
              <SwitchCamera className="size-5" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
