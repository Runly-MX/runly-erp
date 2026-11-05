import { Loader2, MapPinOff, RotateCcw } from 'lucide-react'
import { Button } from '@runly/ui'
import { isTauriRuntime } from '../../lib/systemNotifications.js'

function deniedSteps() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (isTauriRuntime()) return 'Abre Configuración de Windows > Privacidad y seguridad > Ubicación, activa «Servicios de ubicación» y «Permitir que las aplicaciones de escritorio accedan a tu ubicación».'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'Abre Ajustes > Privacidad y seguridad > Localización, activa la localización y elige «Al usar la app» para tu navegador. Después recarga esta página.'
  if (/Android/i.test(ua)) return 'Toca el ícono junto a la dirección (candado o ajustes) > Permisos > Ubicación > Permitir. Revisa también que la ubicación del teléfono esté encendida.'
  return 'Haz clic en el ícono junto a la dirección (candado o ajustes) > Ubicación > Permitir. Si no aparece, búscalo en la configuración de sitios del navegador.'
}

// Shown when the device location can't be requested: how to allow it again,
// plus a retry that works as soon as the user changes the setting.
export function LocationPermissionHelp({ permission, locating, onRetry }) {
  if (permission !== 'denied' && permission !== 'insecure' && permission !== 'unsupported') return null
  const text = permission === 'insecure'
    ? 'La ubicación del dispositivo solo funciona con conexión segura (https). Pega las coordenadas o marca el punto en el mapa.'
    : permission === 'unsupported'
      ? 'Este dispositivo no permite obtener la ubicación. Pega las coordenadas o marca el punto en el mapa.'
      : deniedSteps()
  return (
    <div role="status" className="flex flex-wrap items-start gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
      <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{permission === 'denied' ? 'El permiso de ubicación está bloqueado' : 'Ubicación no disponible'}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{text}</p>
      </div>
      {permission === 'denied' ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={locating}>
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
          Volver a intentar
        </Button>
      ) : null}
    </div>
  )
}
