import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react'
import { Button, SelectField, TextField, cn } from '@runly/ui'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { runly } from '../../../../lib/runly.js'
import { DEFAULT_RADIUS_M, formatCoords, hasCoords, osmUrl, radiusOptionsFor } from '../../lib/formHelpers.js'
import { FieldShell } from './FieldShell.jsx'

const GEO_ERRORS = {
  1: 'No diste permiso para usar tu ubicación. Búscala por dirección.',
  2: 'No se pudo determinar tu ubicación. Búscala por dirección.',
  3: 'La ubicación tardó demasiado. Intenta de nuevo o búscala por dirección.',
}

// Single "Ubicación" control for a site: address, search / current location, coordinates summary and radius.
// value: { address, latitude, longitude, radiusM }; radiusM '' = not chosen yet, null = unlimited.
export function SiteLocationField({ label = 'Ubicación', value, onChange }) {
  const token = useAuth().session?.access_token
  const loc = value ?? { address: '', latitude: null, longitude: null, radiusM: '' }
  const locRef = useRef(loc)
  locRef.current = loc
  const patch = (next) => onChange({ ...locRef.current, ...next })
  const located = hasCoords(loc.latitude, loc.longitude)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const searchId = useRef(0)

  // Debounced geocoding (400 ms); stale responses are ignored.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3 || !token) { setResults([]); setSearching(false); return undefined }
    const id = ++searchId.current
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const response = await runly.attendance.geocode(q, token)
        if (id !== searchId.current) return
        const rows = response?.data ?? response
        setResults(Array.isArray(rows) ? rows : [])
        setMessage(Array.isArray(rows) && rows.length ? '' : 'Sin resultados. Prueba con otra dirección o usa tu ubicación actual.')
      } catch {
        if (id === searchId.current) { setResults([]); setMessage('No se pudo buscar la dirección. Intenta de nuevo.') }
      } finally {
        if (id === searchId.current) setSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [query, token])

  const setPoint = (lat, lng, extra = {}) => {
    const current = locRef.current
    patch({ latitude: Number(lat), longitude: Number(lng), radiusM: current.radiusM === '' ? DEFAULT_RADIUS_M : current.radiusM, ...extra })
  }

  function pick(result) {
    setPoint(result.lat, result.lng, { address: result.label })
    setResults([]); setQuery(''); setMessage('')
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setMessage('Tu navegador no permite obtener la ubicación. Búscala por dirección.'); return }
    setLocating(true); setMessage('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setPoint(pos.coords.latitude, pos.coords.longitude) },
      (err) => { setLocating(false); setMessage(GEO_ERRORS[err.code] ?? GEO_ERRORS[2]) },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const clear = () => { setShowRaw(false); patch({ latitude: null, longitude: null, radiusM: '' }) }
  const radiusValue = loc.radiusM == null ? 'none' : String(loc.radiusM === '' ? DEFAULT_RADIUS_M : loc.radiusM)

  return (
    <FieldShell label={label}>
      <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-3">
        <div className="space-y-2">
          <TextField
            label="Dirección o lugar" value={loc.address ?? ''} placeholder="Escribe la dirección o el nombre del lugar"
            onChange={(e) => { patch({ address: e.target.value }); setQuery(e.target.value) }}
            icon={searching ? Loader2 : Search} autoComplete="off" hint="Elige una sugerencia para fijar la ubicación en el mapa."
          />
          {results.length ? (
            <ul className="max-h-48 divide-y divide-[hsl(var(--border))] overflow-y-auto rounded-lg border border-[hsl(var(--border))]" role="listbox" aria-label="Resultados">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lng},${i}`}>
                  <button type="button" role="option" aria-selected="false" onClick={() => pick(r)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))] max-sm:py-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                    <span className="min-w-0">{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}Usar mi ubicación actual
          </Button>
          {message ? <p className="text-xs text-[hsl(var(--muted-foreground))]" role="status">{message}</p> : null}
        </div>

        {located || (showRaw && loc.latitude !== null) ? (
          <div className="space-y-3 border-t border-[hsl(var(--border))] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm tabular-nums"><MapPin className="h-4 w-4 text-teal-600" aria-hidden="true" />{located ? formatCoords(loc.latitude, loc.longitude) : 'Coordenadas incompletas'}</span>
              {located ? <a
                href={osmUrl(loc.latitude, loc.longitude)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-[hsl(var(--primary))] underline-offset-2 hover:underline"
              >
                Abrir en el mapa<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a> : null}
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={clear}><X className="h-4 w-4" />Quitar</Button>
            </div>
            <SelectField
              label="Radio permitido" options={radiusOptionsFor(loc.radiusM)} value={radiusValue}
              onValueChange={(v) => patch({ radiusM: v === 'none' ? null : Number(v) })}
              hint="Las checadas fuera de este radio se marcan para revisión."
            />
            <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-xs text-[hsl(var(--muted-foreground))] underline-offset-2 hover:underline" aria-expanded={showRaw}>
              Editar coordenadas
            </button>
            <div className={cn('grid grid-cols-2 gap-3', !showRaw && 'hidden')}>
              <TextField label="Latitud" inputMode="decimal" value={String(loc.latitude ?? '')} onChange={(e) => patch({ latitude: e.target.value })} />
              <TextField label="Longitud" inputMode="decimal" value={String(loc.longitude ?? '')} onChange={(e) => patch({ longitude: e.target.value })} />
            </div>
          </div>
        ) : null}
      </div>
    </FieldShell>
  )
}
