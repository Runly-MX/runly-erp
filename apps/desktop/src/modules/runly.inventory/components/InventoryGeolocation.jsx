import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, LocateFixed, MapPin, X } from 'lucide-react'
import { Button, TextField } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { formatGeoPoint, googleMapsUrl, hasGeoPoint, parseCoordinates } from '../../../lib/geo-point.js'
import { GeoPointMap } from '../../../components/geo/GeoPointMap.jsx'
import { LocationPermissionHelp } from '../../../components/geo/LocationPermissionHelp.jsx'
import { useDeviceLocation } from '../../../components/geo/useDeviceLocation.js'
import { intakeRequest } from '../lib/intake.js'

const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6

// Map tiles come from the instance (OpenFreeMap by default, no API key);
// `enabled: false` or a failing style leaves coordinates + external link only.
export function useInventoryMapConfig() {
  const token = useAuth().session?.access_token
  const { activeCompanyId } = useActiveCompany()
  return useQuery({
    queryKey: ['inventory', 'map-config'],
    queryFn: () => intakeRequest({ apiBaseUrl: getApiUrl(), token, companyId: activeCompanyId, path: '/inventory/map-config' }),
    enabled: Boolean(token && activeCompanyId),
    staleTime: Infinity,
  })
}

function useMapStyle() {
  const config = useInventoryMapConfig().data
  const [failed, setFailed] = useState(false)
  return { styleUrl: config?.enabled && !failed ? config.styleUrl : null, onError: () => setFailed(true) }
}

function OpenInMapsLink({ latitude, longitude }) {
  return (
    <a href={googleMapsUrl(latitude, longitude)} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-[var(--brand-primary)] underline-offset-2 hover:underline">
      Abrir en Google Maps<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

// Item form section "Geolocalización" (fields latitude / longitude): current
// position from the device, pasted coordinates or map link, or a click on the map.
export function InventoryGeolocationSection({ value, onChange, errors = {} }) {
  const { latitude, longitude } = value ?? {}
  const located = hasGeoPoint(latitude, longitude)
  const map = useMapStyle()
  // The field shows the current point; `draft` holds what the user typed until it is applied.
  const current = located ? formatGeoPoint(latitude, longitude) : ''
  const [draft, setDraft] = useState(null)
  const text = draft ?? current
  const dirty = draft !== null && draft.trim() !== '' && draft.trim() !== current
  const [message, setMessage] = useState('')
  const device = useDeviceLocation()
  const locating = device.locating
  const setPoint = (lat, lng, note = '') => { onChange({ latitude: round6(lat), longitude: round6(lng) }); setDraft(null); setMessage(note) }

  async function locateMe() {
    setMessage('')
    const pos = await device.locate()
    if (pos) setPoint(pos.latitude, pos.longitude, `Precisión aproximada: ${Math.round(pos.accuracy)} m`)
  }
  const blocked = ['denied', 'insecure', 'unsupported'].includes(device.permission)

  function apply(raw) {
    const point = parseCoordinates(raw)
    if (!point) { setMessage('No reconocí las coordenadas. Usa el formato «19.432608, -99.133209» o pega un enlace de Google Maps.'); return false }
    setPoint(point.latitude, point.longitude, 'Ubicación actualizada. Guarda el activo para conservarla.')
    return true
  }

  return (
    <div data-no-enter-submit="" className="space-y-3">
      {/* Stacked on phones; one row from sm up. The input row never shrinks below its own width. */}
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={locateMe} disabled={locating || device.permission === 'insecure' || device.permission === 'unsupported'}>
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-1 h-4 w-4" />}
          Usar mi ubicación
        </Button>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField label="Coordenadas o enlace de mapa" icon={MapPin} value={text} autoComplete="off"
              placeholder="Ej. 19.432608, -99.133209"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onPaste={(e) => { if (apply(e.clipboardData.getData('text'))) e.preventDefault() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (dirty) apply(draft) } }} />
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => apply(draft)} disabled={!dirty}>Aplicar</Button>
        </div>
      </div>
      {blocked ? <LocationPermissionHelp permission={device.permission} locating={locating} onRetry={locateMe} /> : null}
      {message || device.message || errors.latitude || errors.longitude ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]" role="status">{errors.latitude || errors.longitude || message || device.message}</p>
      ) : null}
      {located ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm tabular-nums"><MapPin className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />{formatGeoPoint(latitude, longitude)}</span>
          <OpenInMapsLink latitude={latitude} longitude={longitude} />
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => { onChange({ latitude: null, longitude: null }); setDraft(null); setMessage('') }}>
            <X className="mr-1 h-4 w-4" />Quitar
          </Button>
        </div>
      ) : null}
      {map.styleUrl ? (
        <>
          <GeoPointMap styleUrl={map.styleUrl} latitude={latitude} longitude={longitude} onError={map.onError}
            onPick={(lat, lng) => setPoint(lat, lng)} />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Haz clic en el mapa o arrastra el marcador para ajustar el punto.</p>
        </>
      ) : null}
    </div>
  )
}

// Item detail section (registry key runly.inventory:GeolocationSection).
export function InventoryDetailGeolocationSection({ data }) {
  const { latitude, longitude } = data ?? {}
  const map = useMapStyle()
  if (!hasGeoPoint(latitude, longitude)) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin geolocalización. Puedes agregarla al editar el activo.</p>
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm tabular-nums"><MapPin className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />{formatGeoPoint(latitude, longitude)}</span>
        <OpenInMapsLink latitude={latitude} longitude={longitude} />
      </div>
      {map.styleUrl ? <GeoPointMap styleUrl={map.styleUrl} latitude={latitude} longitude={longitude} onError={map.onError}
        pin={{ color: data.category?.color, icon: data.category?.icon || 'package' }} /> : null}
    </div>
  )
}
