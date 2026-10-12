import { useEffect, useState } from 'react'
import { Button, ErrorState } from '@runly/ui/primitives'
import { Camera, Mic, Bell, Bluetooth, Radio, Monitor } from 'lucide-react'
import { invoke } from './manager.js'

const features = [
  { key: 'notifications', title: 'Notificaciones', icon: Bell, description: 'Avisos y llamadas entrantes de la instancia activa.' },
  { key: 'camera', title: 'Cámara y video', icon: Camera, description: 'Videollamadas, fotos y escaneo en los módulos.' },
  { key: 'microphone', title: 'Micrófono', icon: Mic, description: 'Llamadas y grabación de audio cuando lo solicites.' },
  { key: 'bluetooth', title: 'Bluetooth', icon: Bluetooth, description: 'Audio y consulta de dispositivos emparejados. El escaneo BLE requiere una integración adicional.' },
  { key: 'nfc', title: 'NFC', icon: Radio, description: 'Lectura del identificador y tecnologías de una etiqueta cercana.' },
  { key: 'screen', title: 'Compartir pantalla', icon: Monitor, description: 'Disponible durante una llamada. Android pide autorización cada vez.' },
]
const labels = { granted: 'Autorizado', prompt: 'Por activar', denied: 'No autorizado', blocked: 'Revisar en ajustes', unsupported: 'No disponible', 'per-session': 'Permiso por sesión' }

export function DevicePanel() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  useEffect(() => {
    let mounted = true
    const refresh = () => invoke('host_device', { action: 'status' }).then((value) => { if (mounted) setStatus(value) }).catch(() => { if (mounted) setError('No se pudieron leer los permisos.') })
    refresh()
    window.addEventListener('focus', refresh)
    const visibility = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', visibility)
    return () => { mounted = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility); invoke('host_device', { action: 'nfc-stop' }).catch(() => {}) }
  }, [])
  async function perform(key, action) {
    if (busy) return
    setBusy(key || 'settings'); setError(''); setResult('')
    try {
      const value = await invoke('host_device', { action, permission: key })
      if (action === 'request') setStatus(value)
      if (action === 'bluetooth-paired') setResult(value.devices.length ? value.devices.map((device) => device.name).join(' · ') : 'No hay dispositivos Bluetooth emparejados. Agrégalos desde los ajustes de Android.')
      if (action === 'nfc-read') setResult(`Etiqueta detectada: ${value.id}`)
    } catch (failure) {
      setError(String(failure).includes('NFC_TIMEOUT') ? 'No se detectó una etiqueta. Acércala al lector y vuelve a intentar.' : String(failure).includes('NFC_CANCELLED') ? 'Lectura cancelada.' : 'No se pudo activar la función. Revisa los ajustes de Android e intenta de nuevo.')
    } finally { setBusy('') }
  }
  return (
    <section className="space-y-3" aria-label="Funciones del dispositivo">
      {error && <div role="alert"><ErrorState title="Revisa los permisos" description={error} showReport={false} /></div>}
      {result && <p role="status" className="rounded-xl border border-border p-4 text-sm break-all">{result}</p>}
      {features.map(({ key, title, icon: Icon, description }) => {
        const feature = status?.[key]
        return <article key={key} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex gap-3"><Icon size={20} className="mt-1 shrink-0 text-primary" /><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p></div></div>
          <p className="text-xs text-muted-foreground">{feature ? labels[feature.state] : 'Comprobando…'}{feature?.available && feature.enabled === false ? ' · Desactivado en Android' : ''}</p>
          <div className="flex flex-wrap gap-2">
            {feature?.available && !['granted', 'per-session', 'blocked'].includes(feature.state) && <Button variant="outline" disabled={!!busy} onClick={() => perform(key, 'request')}>Activar</Button>}
            {feature?.available && key !== 'screen' && <Button variant="ghost" disabled={!!busy} onClick={() => perform(feature.state === 'blocked' ? '' : key, 'settings')}>Ajustes de Android</Button>}
            {feature?.enabled && feature.state === 'granted' && ['bluetooth', 'nfc'].includes(key) && <Button variant="outline" disabled={!!busy} onClick={() => perform(key, key === 'nfc' ? 'nfc-read' : 'bluetooth-paired')}>{busy === key ? 'Esperando…' : key === 'nfc' ? 'Probar lectura' : 'Ver emparejados'}</Button>}
            {busy === 'nfc' && key === 'nfc' && <Button variant="ghost" onClick={() => invoke('host_device', { action: 'nfc-stop' }).catch(() => {})}>Cancelar lectura</Button>}
          </div>
        </article>
      })}
      <p className="text-xs text-muted-foreground leading-relaxed pt-3">Los permisos se conceden a la app Android. Cambiar de instancia no cambia los permisos del sistema. Puedes usar Runly aunque rechaces funciones opcionales.</p>
    </section>
  )
}
