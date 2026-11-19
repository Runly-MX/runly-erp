import { useState } from 'react'
import { Button, ErrorState, NumberStepper, SelectField } from '@runly/ui'
import { Check, Copy, Eye, Trash2 } from 'lucide-react'
import { SLIDE_LIMITS, slideDuration } from '../../../../../../../shared/studio/motion.js'
import { TRANSITION_OPTIONS, TransitionGallery } from './TransitionGallery.jsx'
import { TransitionPreviewDialog } from './TransitionPreviewDialog.jsx'

export { TRANSITION_OPTIONS }
const EASING_OPTIONS = [
  { value: 'ease-out', label: 'Desacelerar' }, { value: 'ease-in', label: 'Acelerar' }, { value: 'ease-in-out', label: 'Acelerar y desacelerar' },
  { value: 'ease', label: 'Suave' }, { value: 'linear', label: 'Lineal' },
]
const seconds = ms => Math.round(ms / 100) / 10
const Label = ({ children }) => <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{children}</p>
const reducedMotionQuery = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// "Diapositiva" section of the page panel: duration and entry transition used by the
// presentation player. Trying a transition card plays it; Aplicar writes one undo step.
export function SlideSettings({ page, pageCount = 1, disabled = false, editor, onChange, onApplyAll }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [candidate, setCandidate] = useState(null), [previewing, setPreviewing] = useState(false)
  const [reducedMotion] = useState(reducedMotionQuery)
  const transition = page.slide?.transition ?? { type: 'none', duration: SLIDE_LIMITS.defaultTransition, easing: 'ease-out' }
  async function run(action) {
    try { setBusy(true); setError(''); await action() } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const change = patch => run(() => onChange({ ...page.slide, ...patch }))
  const locked = disabled || busy
  const tried = candidate ?? transition.type, label = TRANSITION_OPTIONS.find(option => option.value === tried)?.label
  const shown = { ...transition, type: tried, duration: transition.type === 'none' && tried !== 'none' ? SLIDE_LIMITS.defaultTransition : transition.duration }
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
      <p className="text-xs font-medium">Transición de entrada</p>
      <TransitionGallery applied={transition.type} candidate={candidate} reducedMotion={reducedMotion} onCandidate={setCandidate} />
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-1.5 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1 py-2">
        <p className="min-w-0 flex-1 truncate text-xs"><span className="text-[hsl(var(--muted-foreground))]">{candidate && candidate !== transition.type ? 'Probando: ' : 'Aplicada: '}</span><span className="font-medium">{label}</span></p>
        {tried !== 'none' && editor ? <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => setPreviewing(true)}><Eye className="h-3.5 w-3.5" aria-hidden />Vista previa</Button> : null}
        {candidate && candidate !== transition.type ? <Button type="button" size="sm" className="gap-1" disabled={locked} onClick={() => change({ transition: shown }).then(() => setCandidate(null))}><Check className="h-3.5 w-3.5" aria-hidden />Aplicar</Button> : null}
        {transition.type !== 'none' ? <Button type="button" size="sm" variant="ghost" className="gap-1 text-destructive" disabled={locked} onClick={() => { setCandidate(null); change({ transition: { ...transition, type: 'none' } }) }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Quitar</Button> : null}
      </div>
      {transition.type !== 'none' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Duración (s)</Label>
            <NumberStepper label="Duración de la transición en segundos" value={seconds(transition.duration)} precision={1} step={0.1}
              min={0} max={SLIDE_LIMITS.maxTransition / 1000} size="sm" disabled={locked} className="w-full"
              onChange={value => change({ transition: { ...transition, duration: Math.round(value * 1000) } })} />
          </div>
          <SelectField label="Curva" options={EASING_OPTIONS} value={transition.easing} disabled={locked}
            onValueChange={easing => easing && easing !== transition.easing && change({ transition: { ...transition, easing } })} />
        </div>
      ) : null}
      {pageCount > 1 ? (
        <Button type="button" variant="outline" className="w-full gap-1.5" disabled={locked} onClick={() => run(() => onApplyAll(page.slide ?? {}))}>
          <Copy className="h-4 w-4" aria-hidden />Aplicar a todas las páginas
        </Button>
      ) : null}
      {error ? <ErrorState description={error} showReport={false} /> : null}
      {previewing ? <TransitionPreviewDialog open onOpenChange={setPreviewing} editor={editor} pageId={page.id} transition={shown} /> : null}
    </section>
  )
}
