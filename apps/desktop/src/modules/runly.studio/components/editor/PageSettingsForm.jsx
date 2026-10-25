import { useState } from 'react'
import { Button, CheckboxField, ErrorState, NumberStepper, cn } from '@runly/ui'
import { Loader2 } from 'lucide-react'
import { STUDIO_FORMATS } from '../../lib/formats.js'
import { StudioColorPicker } from './StudioColorPicker.jsx'

const PRESETS = STUDIO_FORMATS.filter((format, index, all) => all.findIndex(other => other.width === format.width && other.height === format.height) === index)

// Size + background for a page. Used by the "Página" panel (resize) and the
// custom-size dialog on the home (create).
export function PageSettingsForm({ page, onApply, creating = false, disabled = false, onDone }) {
  const [draft, setDraft] = useState(page), [scale, setScale] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const changed = draft.width !== page.width || draft.height !== page.height || draft.background !== page.background
  async function apply() {
    try { setBusy(true); setError(''); await onApply(draft, scale); onDone?.() }
    catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-5">
      <section aria-label="Formatos" className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Formatos</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map(format => {
            const active = draft.width === format.width && draft.height === format.height
            return (
              <button key={format.key} type="button" disabled={disabled} aria-pressed={active}
                onClick={() => setDraft(current => ({ ...current, width: format.width, height: format.height }))}
                className={cn('min-h-11 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50',
                  active ? 'border-transparent bg-fuchsia-600 text-white' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
                <span className="block truncate text-xs font-semibold">{format.label}</span>
                <span className={cn('block text-[11px] tabular-nums', active ? 'text-white/80' : 'text-[hsl(var(--muted-foreground))]')}>{format.width} × {format.height}</span>
              </button>
            )
          })}
        </div>
      </section>
      <section aria-label="Medidas" className="grid grid-cols-2 gap-3">
        {[['width', 'Ancho (px)'], ['height', 'Alto (px)']].map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
            <NumberStepper label={label} value={draft[key]} min={32} max={4096} step={10} size="sm" disabled={disabled}
              onChange={value => setDraft(current => ({ ...current, [key]: value }))} className="w-full" />
          </div>
        ))}
      </section>
      <section aria-label="Fondo" className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Fondo</p>
        <StudioColorPicker value={draft.background} disabled={disabled} onChange={background => setDraft(current => ({ ...current, background }))} />
      </section>
      {!creating ? <CheckboxField label="Escalar contenido proporcionalmente" checked={scale} onChange={event => setScale(event.target.checked)} disabled={disabled}
        hint="Si no lo marcas, los elementos conservan su posición y tamaño." /> : null}
      {error ? <ErrorState description={error} showReport={false} /> : null}
      <Button className="w-full" disabled={disabled || busy || (!creating && !changed)} onClick={apply}>
        {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
        {creating ? 'Crear con este tamaño' : 'Aplicar cambios'}
      </Button>
    </div>
  )
}
