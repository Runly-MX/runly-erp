import { useState } from 'react'
import { Button, ErrorState, NumberStepper, SegmentedControl, SelectField } from '@runly/ui'
import { Play, Sparkles, Trash2 } from 'lucide-react'
import { MOTION_LIMITS } from '../../../../../../../shared/studio/motion.js'
import { EFFECTS_BY_KIND, EFFECT_DEFAULTS, choiceOf, effectFor } from '../../../lib/effect-catalog.js'
import { EffectGallery } from './EffectGallery.jsx'

const EASING_OPTIONS = [
  { value: 'ease-out', label: 'Desacelerar' }, { value: 'ease-in', label: 'Acelerar' }, { value: 'ease-in-out', label: 'Acelerar y desacelerar' },
  { value: 'ease', label: 'Suave' }, { value: 'linear', label: 'Lineal' },
]
const KIND_TITLES = { enter: 'Entrada', emphasis: 'Énfasis', exit: 'Salida' }
const seconds = ms => Math.round(ms / 100) / 10
const Label = ({ children }) => <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{children}</p>
const reducedMotionQuery = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Duration, delay, curve and repetitions of the applied effect (one undo step per change).
function EffectTiming({ title, value, emphasis, slideDuration, disabled, onChange }) {
  const appear = choiceOf(value) === 'appear', set = patch => onChange({ ...value, ...patch })
  const overrun = value.delay + value.duration > slideDuration
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md border border-[hsl(var(--border))] p-3">
      {!appear ? (
        <div className="space-y-1.5">
          <Label>Duración (s)</Label>
          <NumberStepper label={`${title}: duración en segundos`} value={seconds(value.duration)} precision={1} step={0.1} min={0.1} max={MOTION_LIMITS.maxEffectDuration / 1000}
            size="sm" disabled={disabled} className="w-full" onChange={next => set({ duration: Math.round(next * 1000) })} />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label>Retraso (s)</Label>
        <NumberStepper label={`${title}: retraso en segundos`} value={seconds(value.delay)} precision={1} step={0.1} min={0} max={MOTION_LIMITS.maxDelay / 1000}
          size="sm" disabled={disabled} className="w-full" onChange={next => set({ delay: Math.round(next * 1000) })} />
      </div>
      {emphasis ? (
        <div className="space-y-1.5">
          <Label>Repeticiones</Label>
          <NumberStepper label={`${title}: repeticiones`} value={value.repeat} min={1} max={MOTION_LIMITS.repeat} size="sm" disabled={disabled} className="w-full" onChange={repeat => set({ repeat })} />
        </div>
      ) : null}
      {!appear ? (
        <div className="col-span-2">
          <SelectField label="Curva" options={EASING_OPTIONS} value={value.easing} disabled={disabled} onValueChange={easing => easing && easing !== value.easing && set({ easing })} />
        </div>
      ) : null}
      {overrun ? <p className="col-span-2 text-xs text-amber-700 dark:text-amber-300">Termina después de la diapositiva ({seconds(slideDuration)} s): al presentar se recorta, sin cambiar estos valores.</p> : null}
    </div>
  )
}

// Animation of the selected element (or every member of the selected group): a gallery per
// kind; trying a card previews it on the element without writing, Aplicar writes one undo step.
export function AnimationPanel({ targets, slideDuration, disabled, lockedReason, onApply, onPreview, onPreviewEffect }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [kind, setKind] = useState('enter'), [reducedMotion] = useState(reducedMotionQuery)
  const item = targets[0]
  if (!item) return <p className="text-sm text-[hsl(var(--muted-foreground))]">Selecciona un elemento para animarlo.</p>
  async function run(patch) {
    try { setBusy(true); setError(''); await onApply(patch) } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const locked = disabled || busy || Boolean(lockedReason)
  const animated = targets.some(target => target.enter || target.exit || target.emphasis)
  const defaults = kind === 'exit' ? { ...EFFECT_DEFAULTS.exit, delay: Math.max(0, slideDuration - 800) } : EFFECT_DEFAULTS[kind]
  const value = item[kind], applied = choiceOf(value)
  const tabs = Object.entries(KIND_TITLES).map(([key, label]) => ({ value: key, label: item[key] ? `${label} •` : label }))
  return (
    <div className="space-y-4">
      {targets.length > 1 ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Se aplica a los {targets.length} elementos del grupo; giran y escalan alrededor del centro del grupo.</p> : null}
      {lockedReason ? <p className="rounded-md bg-[hsl(var(--muted))] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">{lockedReason}</p> : null}
      <SegmentedControl ariaLabel="Tipo de efecto" size="sm" options={tabs} value={kind} onChange={setKind} />
      {value ? (
        <div className="space-y-2">
          <p className="text-xs"><span className="text-[hsl(var(--muted-foreground))]">Aplicado: </span><span className="font-medium">{EFFECTS_BY_KIND[kind].find(option => option.value === applied)?.label}</span></p>
          <EffectTiming key={kind} title={KIND_TITLES[kind]} value={value} emphasis={kind === 'emphasis'} slideDuration={slideDuration} disabled={locked} onChange={next => run({ [kind]: next })} />
        </div>
      ) : null}
      <EffectGallery key={kind} kind={kind} applied={applied} disabled={locked} reducedMotion={reducedMotion}
        onPreview={choice => onPreviewEffect?.({ kind, effect: effectFor(choice, value, defaults) })}
        onApply={choice => run({ [kind]: effectFor(choice, value, defaults) })} onRemove={() => run({ [kind]: undefined })} />
      {item.keyframes ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Tiene {item.keyframes.length} keyframes de movimiento; se conservan y se reproducen al presentar.</p> : null}
      <div className="grid gap-2">
        <Button type="button" variant="outline" className="gap-1.5" onClick={onPreview}><Play className="h-4 w-4" aria-hidden />Previsualizar página</Button>
        {animated ? <Button type="button" variant="ghost" className="gap-1.5 text-destructive" disabled={locked} onClick={() => run({ enter: undefined, exit: undefined, emphasis: undefined })}><Trash2 className="h-4 w-4" aria-hidden />Quitar todas las animaciones</Button> : null}
      </div>
      {error ? <ErrorState description={error} showReport={false} /> : null}
    </div>
  )
}

const nameOf = (kind, effect) => EFFECTS_BY_KIND[kind].find(option => option.value === choiceOf(effect))?.label
export const EFFECT_KINDS = Object.freeze(Object.entries(KIND_TITLES))
// Kind and preset in the words of the panel (timeline labels).
export const effectLabel = (kind, effect) => `${KIND_TITLES[kind]}: ${nameOf(kind, effect)}`
// Inspector entry: what the selection does and a button to open the Animación panel.
export function AnimationSummary({ item, disabled, onOpen }) {
  const parts = Object.entries(KIND_TITLES).map(([kind, title]) => [title, item?.[kind] ? nameOf(kind, item[kind]) : null]).filter(([, name]) => name)
  return (
    <div className="space-y-2">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{parts.length ? parts.map(([kind, name]) => `${kind}: ${name}`).join(' · ') : 'Sin animación'}</p>
      <Button type="button" variant="outline" className="w-full gap-1.5" disabled={disabled} onClick={onOpen}><Sparkles className="h-4 w-4" aria-hidden />Animar</Button>
    </div>
  )
}
