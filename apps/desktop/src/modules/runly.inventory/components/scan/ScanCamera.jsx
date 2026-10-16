import { useEffect, useRef, useState } from 'react'
import { Flashlight, FlashlightOff, Pause, Play, SwitchCamera, Volume2, VolumeX } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { native } from '../../../../native/index.js'
import { cameraErrorKind, cameraStatus } from '../../lib/scan-kiosk.js'
import { FeedbackBanner, ScanFrame, StatusChip, ViewfinderPanel, edgeGlow } from './ScanViewfinder.jsx'

const REPEAT_WINDOW_MS = 2500
const SCAN_FORMATS = ['QR_CODE', 'DATA_MATRIX', 'CODE_128', 'CODE_39', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'ITF']

// The Android app asks for the OS camera permission through its bridge; in a
// browser or the desktop shell getUserMedia prompts by itself.
async function ensureNativeCameraPermission() {
  try { if (native.isMobile()) await native.device.requestPermission('camera') } catch { /* older app or web: getUserMedia decides */ }
}
const openNativeSettings = () => native.device.openSettings('camera').catch(() => {})

function OverlayButton({ label, pressed, onClick, children }) {
  return (
    <Button type="button" size="icon" variant="ghost" onClick={onClick} aria-label={label} aria-pressed={pressed} title={label}
      className="size-11 rounded-md bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 hover:text-white focus-visible:ring-2 focus-visible:ring-white">
      {children}
    </Button>
  )
}

// Continuous QR + barcode reader (zxing multi-format, back camera first).
// The same text read again within REPEAT_WINDOW_MS is ignored so one code in
// front of the lens is a single read; the parent decides what it means.
// Paused = the reader and the camera stream are stopped (light and battery).
export function ScanCamera({
  paused = false, onPausedChange, onRead, tone = null, feedback = null, muted = false, onMutedChange, onStatusChange, onManual, className,
}) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const handlerRef = useRef(onRead)
  const [deviceId, setDeviceId] = useState(null)
  const [devices, setDevices] = useState([])
  const [torch, setTorch] = useState({ supported: false, on: false })
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const status = cameraStatus({ enabled: true, paused, starting, error })

  useEffect(() => { handlerRef.current = onRead }, [onRead])
  useEffect(() => { onStatusChange?.(status) }, [status, onStatusChange])

  useEffect(() => {
    if (paused) return undefined
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
        const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 300 })
        // Label QR plus the barcodes found on asset/serial stickers (fewer formats = faster, quieter).
        reader.possibleFormats = SCAN_FORMATS.map((name) => BarcodeFormat[name])
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
        if (!stopped) setError(cameraErrorKind(e))
      } finally {
        if (!stopped) setStarting(false)
      }
    })()
    return () => {
      stopped = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [paused, deviceId, attempt])

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

  const live = status === 'scanning' || status === 'starting'
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-slate-950', className)}>
      <video ref={videoRef} muted playsInline className={cn('size-full object-cover', !live && 'invisible')} aria-label="Vista de la cámara" />
      {live ? <ScanFrame tone={tone} /> : null}
      {live && tone ? <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 rounded-lg', edgeGlow(tone))} /> : null}
      <ViewfinderPanel status={status} onResume={() => onPausedChange?.(false)} onRetry={() => setAttempt((n) => n + 1)}
        onSettings={native.isMobile() ? openNativeSettings : null} onManual={onManual} />

      {feedback ? <FeedbackBanner feedback={feedback} /> : (
        <div className="pointer-events-none absolute left-2 top-2"><StatusChip status={status} /></div>
      )}

      {status !== 'denied' && status !== 'unavailable' && status !== 'failed' ? (
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-2">
          <OverlayButton label={paused ? 'Reanudar lectura' : 'Pausar lectura'} pressed={paused} onClick={() => onPausedChange?.(!paused)}>
            {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
          </OverlayButton>
          <span className="flex-1" />
          {torch.supported && !paused ? (
            <OverlayButton label={torch.on ? 'Apagar linterna' : 'Encender linterna'} pressed={torch.on} onClick={toggleTorch}>
              {torch.on ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
            </OverlayButton>
          ) : null}
          {devices.length > 1 && !paused ? (
            <OverlayButton label="Cambiar cámara" onClick={switchCamera}><SwitchCamera className="size-5" /></OverlayButton>
          ) : null}
          <OverlayButton label={muted ? 'Activar sonido' : 'Silenciar'} pressed={muted} onClick={() => onMutedChange?.(!muted)}>
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </OverlayButton>
        </div>
      ) : null}
    </div>
  )
}
