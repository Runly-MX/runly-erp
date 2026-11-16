import { useState } from 'react'
import { Button, ErrorState, NumberStepper, SelectField } from '@runly/ui'
import { Copy } from 'lucide-react'
import { SLIDE_LIMITS, slideDuration } from '../../../../../../../shared/studio/motion.js'

export const TRANSITION_OPTIONS = [
  { value: 'none', label: 'Ninguna' },
  { value: 'fade', label: 'Fundido' },
  { value: 'slide-left', label: 'Deslizar a la izquierda' },
  { value: 'slide-right', label: 'Deslizar a la derecha' },
  { value: 'slide-up', label: 'Deslizar hacia arriba' },
  { value: 'slide-down', label: 'Deslizar hacia abajo' },
  { value: 'zoom', label: 'Acercar' },
]

const seconds = ms => Math.round(ms / 100) / 10
const Label = ({ children }) => <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{children}</p>

// "Diapositiva" section of the page panel: duration and entry transition used
// by the presentation player. Every change is one undo step (one page patch).
export function SlideSettings({ page, pageCount = 1, disabled = false, onChange, onApplyAll }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const transition = page.slide?.transition ?? { type: 'none', duration: SLIDE_LIMITS.defaultTransition, easing: 'ease-out' }
  async function run(action) {
    try { setBusy(true); setError(''); await action() } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const change = patch => run(() => onChange({ ...page.slide, ...patch }))
  const locked = disabled || busy
  return (
    <section aria-label="Diapositiva" className="space-y-3 border-t border-[hsl(var(--border))] pt-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Diapositiva</p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Se usa al presentar el diseño con reproducción automática.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Duración (s)</Label>
        <NumberStepper label="Duración de la diapositiva en segundos" value={seconds(slideDuration(page))} precision={1} step={0.5}
          min={SLIDE_LIMITS.minDuration / 1000} max={SLIDE_LIMITS.maxDuration / 1000} size="sm" disabled={locked} className="w-full"
          onChange={value => change({ duration: Math.round(value * 1000) })} />
      </div>
      <div className="space-y-1.5">
        <Label>Transición de entrada</Label>
        <SelectField aria-label="Transición de entrada" options={TRANSITION_OPTIONS} value={transition.type} disabled={locked}
          onValueChange={type => type && type !== transition.type && change({ transition: { ...transition, type } })} />
      </div>
      {transition.type !== 'none' ? (
        <div className="space-y-1.5">
          <Label>Duración de la transición (s)</Label>
          <NumberStepper label="Duración de la transición en segundos" value={seconds(transition.duration)} precision={1} step={0.1}
            min={0} max={SLIDE_LIMITS.maxTransition / 1000} size="sm" disabled={locked} className="w-full"
            onChange={value => change({ transition: { ...transition, duration: Math.round(value * 1000) } })} />
        </div>
      ) : null}
      {pageCount > 1 ? (
        <Button type="button" variant="outline" className="w-full gap-1.5" disabled={locked} onClick={() => run(() => onApplyAll(page.slide ?? {}))}>
          <Copy className="h-4 w-4" aria-hidden />Aplicar a todas las páginas
        </Button>
      ) : null}
      {error ? <ErrorState description={error} showReport={false} /> : null}
    </section>
  )
}
