import { useState } from 'react'
import { Button, TextField, cn } from '@runly/ui'
import { Barcode, QrCode } from 'lucide-react'
import { draggable } from '../../../lib/studio-drag.js'
import { CODE_LABELS } from '../../../lib/studio-codes.js'
import { CODE_PRESETS } from '../../../lib/element-library.js'

const ICONS = { qr: QrCode, code128: Barcode }
const ROW = 'flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 text-left text-sm transition-colors hover:border-fuchsia-500/40 hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50'

// "Códigos dinámicos": QR / barcode blocks whose content is a rule with {{campo}}
// placeholders, filled per record from the Datos panel. `presets` is already filtered by the search.
export function DynamicCodes({ presets, showRule, disabled, columns = [], onAddCode }) {
  const [rule, setRule] = useState('')
  const size = kind => (kind === 'qr' ? { width: 240, height: 240 } : { width: 480, height: 144 })
  const add = (kind, value, point) => onAddCode(kind, value, point)
  return (
    <div className="space-y-2">
      {presets.map(({ key, kind, label, value }) => {
        const Icon = ICONS[kind]
        return (
          <button key={key} type="button" disabled={disabled} className={ROW} onClick={() => add(kind, value)}
            {...draggable({ kind: 'element', label: CODE_LABELS[kind], size: size(kind), insert: point => add(kind, value, point) })}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{label}</span><span className="block truncate font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{value}</span></span>
          </button>
        )
      })}
      {showRule ? (
        <div className="space-y-2 rounded-xl border border-dashed border-[hsl(var(--border))] p-3">
          <TextField id="studio-code-rule" label="Regla personalizada" value={rule} maxLength={300} disabled={disabled} placeholder="https://mi-empresa.com/{{Folio}}" autoComplete="off"
            onChange={event => setRule(event.target.value)} hint="Mezcla texto fijo y campos entre {{ }}; cada registro genera su propio código." />
          {columns.length ? (
            <div className="flex flex-wrap gap-1">
              {columns.map(column => <button key={column} type="button" disabled={disabled} onClick={() => setRule(current => `${current}{{${column}}}`)}
                className={cn('rounded-md border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-[11px] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]')}>{`{{${column}}}`}</button>)}
            </div>
          ) : <p className="text-xs text-[hsl(var(--muted-foreground))]">Conecta datos en el panel Datos para ver sus columnas aquí.</p>}
          <div className="grid grid-cols-2 gap-2">
            {['qr', 'code128'].map(kind => { const Icon = ICONS[kind]; return (
              <Button key={kind} type="button" variant="outline" size="sm" disabled={disabled || !rule.trim()} onClick={() => add(kind, rule.trim())} className="gap-1.5"><Icon className="h-4 w-4" aria-hidden />{CODE_LABELS[kind]}</Button>
            ) })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
