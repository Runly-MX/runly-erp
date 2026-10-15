import { ExternalLink } from 'lucide-react'
import { Badge, Button } from '@runly/ui'
import { itemUrl } from './InventoryIdentifierConflict.jsx'

const MATCH_LABEL = { serialNumber: 'número de serie', assetTag: 'número de activo' }

// Side-by-side "current vs detected" fields for one existing item.
export function InventoryChangesDiff({ changes = [], incomingLabel = 'Detectado' }) {
  if (!changes.length) return <p className="text-xs text-muted-foreground">No hay datos nuevos que cambiar en este equipo.</p>
  return (
    <div className="grid grid-cols-[minmax(7rem,auto)_1fr_1fr] gap-x-3 gap-y-1 text-xs">
      <span className="font-medium text-muted-foreground">Campo</span>
      <span className="font-medium text-muted-foreground">Actual</span>
      <span className="font-medium text-muted-foreground">{incomingLabel}</span>
      {changes.map((change) => (
        <div key={change.field} className="contents">
          <span>{change.label}</span>
          <span className="break-words text-muted-foreground">{change.current || 'Vacío'}</span>
          <span className="break-words font-medium">{change.incoming}</span>
        </div>
      ))}
    </div>
  )
}

// "Registro con IA": units matching an ACTIVE item are suggested as updates.
// `modeOf(index)` is 'update' | 'skip'; `onMode(index, mode)` changes it.
export function InventoryMatchPanel({ matches, modeOf, onMode, disabled }) {
  if (!matches.length) return null
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">Estos equipos ya existen en tu inventario</p>
        <p className="text-xs text-muted-foreground">No se crean duplicados. Actualiza el equipo existente con lo detectado o desactiva la unidad (Omitir).</p>
      </div>
      {matches.map((match) => {
        const mode = modeOf(match.index) === 'skip' ? 'skip' : 'update'
        return (
          <div key={match.index} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                Equipo {match.index + 1} coincide por {MATCH_LABEL[match.matchedBy]} con{' '}
                <a className="inline-flex items-center gap-1 font-medium underline" href={itemUrl(match.item.id)} target="_blank" rel="noreferrer">
                  {match.item.name}{match.item.assetTag ? ` · N.º ${match.item.assetTag}` : ''}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={disabled} variant={mode === 'update' ? 'default' : 'outline'} onClick={() => onMode(match.index, 'update')}>Actualizar equipo existente</Button>
                <Button type="button" size="sm" disabled={disabled} variant={mode === 'skip' ? 'default' : 'outline'} onClick={() => onMode(match.index, 'skip')}>Omitir</Button>
              </div>
            </div>
            {mode === 'update' ? <InventoryChangesDiff changes={match.changes} /> : <Badge variant="outline">Se omitirá esta unidad</Badge>}
          </div>
        )
      })}
    </div>
  )
}
