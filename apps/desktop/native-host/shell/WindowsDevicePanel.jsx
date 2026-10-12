import { useEffect, useRef, useState } from 'react'
import { Button, ErrorState } from '@runly/ui/primitives'
import { Camera, Mic, Bell, Bluetooth, Monitor, Volume2, ExternalLink } from 'lucide-react'
import { invoke } from './manager.js'

const features = [
  { key: 'camera', title: 'Cámara', icon: Camera, description: 'Videollamadas, fotografías y escaneo. La instancia pedirá acceso cuando uses la cámara.', test: true },
  { key: 'microphone', title: 'Micrófono', icon: Mic, description: 'Llamadas y notas de voz. La instancia pedirá acceso al iniciar la captura.', test: true },
  { key: 'bluetooth', title: 'Bluetooth', icon: Bluetooth, description: 'Empareja audífonos y dispositivos en Windows. La conexión BLE de lectores u otros accesorios necesita una integración específica.' },
  { key: 'sound', title: 'Salida de audio', icon: Volume2, description: 'Elige tus bocinas o audífonos, incluidos los conectados por Bluetooth.' },
  { key: 'notifications', title: 'Notificaciones', icon: Bell, description: 'Controla los avisos de Runly y el modo No molestar desde Windows.' },
  { key: 'screen', title: 'Compartir pantalla', icon: Monitor, description: 'Selecciona una pantalla o ventana al compartir en una llamada. El acceso se solicita cada vez.' },
]

export function WindowsDevicePanel() {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [level, setLevel] = useState(0)
  const stream = useRef(null)
  const video = useRef(null)
  const audio = useRef(null)
  const meter = useRef(null)
  const mounted = useRef(true)
  const stop = () => {
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null
    clearInterval(meter.current); meter.current = null
    audio.current?.close().catch(() => {}); audio.current = null
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop() } }, [])
  async function perform(key, test = false) {
    if (busy) return
    setBusy(key); setError(''); setResult(''); stop()
    try {
      if (!test) await invoke('host_device', { action: 'settings', permission: key })
      else {
        const media = await navigator.mediaDevices.getUserMedia(key === 'camera' ? { video: true } : { audio: true })
        if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return }
        stream.current = media
        if (key === 'camera') video.current.srcObject = media
        else {
          const context = new AudioContext()
          audio.current = context
          await context.resume()
          if (!mounted.current) { stop(); return }
          const analyser = context.createAnalyser()
          context.createMediaStreamSource(media).connect(analyser)
          const values = new Uint8Array(analyser.fftSize)
          meter.current = setInterval(() => {
            analyser.getByteTimeDomainData(values)
            setLevel(Math.min(100, Math.round(Math.max(...values.map((value) => Math.abs(value - 128))) * 3)))
          }, 100)
        }
        setResult(key === 'camera' ? 'Cámara disponible. Esta prueba no concede acceso a las instancias.' : 'Micrófono disponible. Esta prueba no concede acceso a las instancias.')
      }
    } catch (failure) {
      stop()
      if (mounted.current) setError(failure.name === 'NotAllowedError' ? 'El acceso fue rechazado. Revisa los ajustes de privacidad y el permiso de esta pantalla.' : failure.name === 'NotFoundError' ? 'No se encontró el dispositivo. Conéctalo y vuelve a probar.' : 'No se pudo completar. Revisa los ajustes de Windows e intenta de nuevo.')
    } finally { if (mounted.current) setBusy('') }
  }
  return (
    <section className="space-y-4" aria-label="Funciones de Windows">
      <p className="text-sm text-muted-foreground leading-relaxed">Puedes conectar tu instancia sin activar estas funciones. Windows y cada instancia administran sus propios permisos.</p>
      {error && <div role="alert"><ErrorState title="Revisa tu dispositivo" description={error} showReport={false} /></div>}
      <div hidden={!result} className="rounded-2xl border border-border p-4 space-y-3">
        <p role="status" className="text-sm">{result}</p>
        <video ref={video} autoPlay muted playsInline className="w-full max-h-48 rounded-xl" hidden={!result.startsWith('Cámara')} />
        {result.startsWith('Micrófono') && <div className="space-y-2"><p className="text-xs text-muted-foreground">Habla para comprobar la señal del micrófono.</p><div role="meter" aria-label="Señal del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${level}%` }} /></div></div>}
        <Button variant="outline" onClick={() => { stop(); setResult('') }}>Terminar prueba</Button>
      </div>
      {features.map(({ key, title, icon: Icon, description, test }) => (
        <article key={key} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex gap-3"><Icon size={20} className="shrink-0 mt-1 text-primary" /><div className="min-w-0"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p></div></div>
          {key !== 'screen' && <div className="flex flex-wrap gap-2 mt-4">
            {test && <Button variant="outline" disabled={!!busy} onClick={() => perform(key, true)}>{busy === key ? 'Comprobando…' : `Probar ${title.toLowerCase()}`}</Button>}
            <Button variant="ghost" disabled={!!busy} onClick={() => perform(key)}><ExternalLink size={14} />Ajustes de Windows</Button>
          </div>}
        </article>
      ))}
    </section>
  )
}
