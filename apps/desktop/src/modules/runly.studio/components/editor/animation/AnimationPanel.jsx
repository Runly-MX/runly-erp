import { useState } from 'react'
import { Button, ErrorState, NumberStepper, SelectField } from '@runly/ui'
import { Play, Sparkles, Trash2 } from 'lucide-react'
import { MOTION_LIMITS } from '../../../../../../../shared/studio/motion.js'

export const ENTER_OPTIONS = [
  { value: 'none', label: 'Ninguna' }, { value: 'appear', label: 'Aparecer' }, { value: 'fade', label: 'Desvanecer' },
  { value: 'slide-up', label: 'Deslizar hacia arriba' }, { value: 'slide-down', label: 'Deslizar hacia abajo' },
  { value: 'slide-left', label: 'Deslizar a la izquierda' }, { value: 'slide-right', label: 'Deslizar a la derecha' },
  { value: 'slide-fade-up', label: 'Deslizar y desvanecer hacia arriba' }, { value: 'slide-fade-down', label: 'Deslizar y desvanecer hacia abajo' },
  { value: 'slide-fade-left', label: 'Deslizar y desvanecer a la izquierda' }, { value: 'slide-fade-right', label: 'Deslizar y desvanecer a la derecha' },
  { value: 'zoom-in', label: 'Escalar desde pequeño' }, { value: 'zoom-out', label: 'Escalar desde grande' },
  { value: 'rotate', label: 'Girar' }, { value: 'pop', label: 'Rebotar' },
]
const EXIT_OPTIONS = ENTER_OPTIONS.map(option => (option.value === 'appear' ? { ...option, label: 'Desaparecer' } : option))
const EMPHASIS_OPTIONS = [{ value: 'none', label: 'Ninguno' }, { value: 'pulse', label: 'Pulso' }, { value: 'spin', label: 'Girar' }, { value: 'shake', label: 'Sacudir' }, { value: 'bounce', label: 'Saltar' }]
const EASING_OPTIONS = [
  { value: 'ease-out', label: 'Desacelerar' }, { value: 'ease-in', label: 'Acelerar' }, { value: 'ease-in-out', label: 'Acelerar y desacelerar' },
  { value: 'ease', label: 'Suave' }, { value: 'linear', label: 'Lineal' },
]
const seconds = ms => Math.round(ms / 100) / 10
const Label = ({ children }) => <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{children}</p>

// "Aparecer"/"Desaparecer" is a fade without duration: same contract, no new preset.
const choiceOf = effect => (!effect ? 'none' : effect.preset === 'fade' && effect.duration === 0 ? 'appear' : effect.preset)
function effectFor(choice, previous, defaults) {
  if (choice === 'none') return undefined
  if (choice === 'appear') return { ...defaults, ...previous, preset: 'fade', duration: 0 }
  return { ...defaults, ...previous, preset: choice, duration: previous?.duration || defaults.duration }
}

function EffectEditor({ title, value, options, defaults, emphasis = false, slideDuration, disabled, onChange }) {
  const choice = choiceOf(value), set = patch => onChange({ ...value, ...patch })
  const overrun = value && value.delay + value.duration > slideDuration
  return (
    <section aria-label={title} className="space-y-3 border-b border-[hsl(var(--border))] pb-4 last:border-b-0">
      <SelectField label={title} options={options} value={choice} disabled={disabled} onValueChange={next => next && next !== choice && onChange(effectFor(next, value, defaults))} />
      {value ? (
        <div className="grid grid-cols-2 gap-3">
          {choice !== 'appear' ? (
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
          {choice !== 'appear' ? (
            <div className="col-span-2">
              <SelectField label="Curva" options={EASING_OPTIONS} value={value.easing} disabled={disabled} onValueChange={easing => easing && easing !== value.easing && set({ easing })} />
            </div>
          ) : null}
          {overrun ? <p className="col-span-2 text-xs text-amber-700 dark:text-amber-300">Termina después de la diapositiva ({seconds(slideDuration)} s): al presentar se recorta, sin cambiar estos valores.</p> : null}
        </div>
      ) : null}
    </section>
  )
}

// Animation properties of the selected element (or every member of the selected
// group): one undo step per change. Keyframes are kept but edited in the timeline (phase 3).
export function AnimationPanel({ targets, slideDuration, disabled, lockedReason, onApply, onPreview }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const item = targets[0]
  if (!item) return <p className="text-sm text-[hsl(var(--muted-foreground))]">Selecciona un elemento para animarlo.</p>
  async function run(patch) {
    try { setBusy(true); setError(''); await onApply(patch) } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const locked = disabled || busy || Boolean(lockedReason)
  const animated = targets.some(target => target.enter || target.exit || target.emphasis)
  const exitDefaults = { delay: Math.max(0, slideDuration - 800), duration: 600, easing: 'ease-in' }
  return (
    <div className="space-y-4">
      {targets.length > 1 ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Se aplica a los {targets.length} elementos del grupo; giran y escalan alrededor del centro del grupo.</p> : null}
      {lockedReason ? <p className="rounded-md bg-[hsl(var(--muted))] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">{lockedReason}</p> : null}
      <EffectEditor title="Entrada" value={item.enter} options={ENTER_OPTIONS} defaults={{ delay: 0, duration: 600, easing: 'ease-out' }} slideDuration={slideDuration} disabled={locked} onChange={enter => run({ enter })} />
      <EffectEditor title="Énfasis" value={item.emphasis} options={EMPHASIS_OPTIONS} defaults={{ delay: 1000, duration: 800, easing: 'ease-in-out', repeat: 1 }} emphasis slideDuration={slideDuration} disabled={locked} onChange={emphasis => run({ emphasis })} />
      <EffectEditor title="Salida" value={item.exit} options={EXIT_OPTIONS} defaults={exitDefaults} slideDuration={slideDuration} disabled={locked} onChange={exit => run({ exit })} />
      {item.keyframes ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Tiene {item.keyframes.length} keyframes de movimiento; se conservan y se reproducen al presentar.</p> : null}
      <div className="grid gap-2">
        <Button type="button" variant="outline" className="gap-1.5" onClick={onPreview}><Play className="h-4 w-4" aria-hidden />Previsualizar página</Button>
        {animated ? <Button type="button" variant="ghost" className="gap-1.5 text-destructive" disabled={locked} onClick={() => run({ enter: undefined, exit: undefined, emphasis: undefined })}><Trash2 className="h-4 w-4" aria-hidden />Quitar animaciones</Button> : null}
      </div>
      {error ? <ErrorState description={error} showReport={false} /> : null}
    </div>
  )
}

const nameOf = (options, effect) => options.find(option => option.value === choiceOf(effect))?.label
export const EFFECT_KINDS = Object.freeze([['enter', 'Entrada', ENTER_OPTIONS], ['emphasis', 'Énfasis', EMPHASIS_OPTIONS], ['exit', 'Salida', EXIT_OPTIONS]])
// Kind and preset in the words of the panel (timeline labels).
export const effectLabel = (kind, effect) => { const [, title, options] = EFFECT_KINDS.find(entry => entry[0] === kind); return `${title}: ${nameOf(options, effect)}` }
// Inspector entry: what the selection does and a button to open the Animación panel.
export function AnimationSummary({ item, disabled, onOpen }) {
  const parts = [['Entrada', nameOf(ENTER_OPTIONS, item?.enter)], ['Énfasis', nameOf(EMPHASIS_OPTIONS, item?.emphasis)], ['Salida', nameOf(EXIT_OPTIONS, item?.exit)]].filter(([, name]) => name && item)
  return (
    <div className="space-y-2">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{parts.length ? parts.map(([kind, name]) => `${kind}: ${name}`).join(' · ') : 'Sin animación'}</p>
      <Button type="button" variant="outline" className="w-full gap-1.5" disabled={disabled} onClick={onOpen}><Sparkles className="h-4 w-4" aria-hidden />Animar</Button>
    </div>
  )
}
