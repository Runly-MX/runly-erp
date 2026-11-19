import { useEffect, useState } from 'react'
import { cn } from '@runly/ui'
import { Check } from 'lucide-react'
import { transitionAt } from '../../../../../../../shared/studio/motion.js'
import { layerStyle } from '../../../lib/stage-layers.js'

const DIRS = [['left', 'a la izquierda'], ['right', 'a la derecha'], ['up', 'hacia arriba'], ['down', 'hacia abajo']]
const directional = (prefix, verb, group) => DIRS.map(([dir, words]) => ({ value: `${prefix}-${dir}`, label: `${verb} ${words}`, group }))
export const TRANSITION_OPTIONS = Object.freeze([
  { value: 'none', label: 'Ninguna', group: 'Básicas' }, { value: 'fade', label: 'Fundido', group: 'Básicas' }, { value: 'fade-black', label: 'Fundido a negro', group: 'Básicas' },
  ...directional('slide', 'Empujar', 'Empujar'), ...directional('cover', 'Cubrir', 'Cubrir'), ...directional('uncover', 'Descubrir', 'Descubrir'),
  ...directional('wipe', 'Barrido', 'Barrido'),
  { value: 'split-vertical', label: 'Dividir vertical', group: 'Barrido' }, { value: 'split-horizontal', label: 'Dividir horizontal', group: 'Barrido' },
  { value: 'zoom', label: 'Acercar', group: 'Zoom' }, { value: 'zoom-out', label: 'Alejar', group: 'Zoom' },
])
const GROUPS = ['Básicas', 'Empujar', 'Cubrir', 'Descubrir', 'Barrido', 'Zoom']
const LENGTH = 900

// Two cards (A leaving, B arriving) drawn with the same layers as Presentar.
export function TransitionThumb({ type, playing }) {
  const [progress, setProgress] = useState(0.45)
  useEffect(() => {
    if (!playing) { setProgress(0.45); return undefined }
    let frame
    const origin = performance.now()
    const loop = () => { const p = Math.min(1, (performance.now() - origin) / LENGTH); setProgress(p); if (p < 1) frame = requestAnimationFrame(loop) }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing, type])
  const layers = transitionAt({ type, duration: LENGTH, easing: 'ease-in-out' }, progress)
  const card = (role, className, letter) => (
    <span className={cn('absolute inset-0 flex items-center justify-center text-sm font-semibold', className)} style={{ ...layerStyle(layers[role]), zIndex: layers.front === role ? 2 : 1 }}>{letter}</span>
  )
  return (
    <span aria-hidden className="relative block aspect-[16/10] w-full overflow-hidden rounded-[5px] bg-black">
      {card('outgoing', 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', 'A')}
      {card('incoming', 'bg-fuchsia-500 text-white', 'B')}
    </span>
  )
}

// Cards per group; a tap plays the card, Aplicar (in SlideSettings) writes the choice.
export function TransitionGallery({ applied, candidate, onCandidate, reducedMotion }) {
  const [hovered, setHovered] = useState(null), [replay, setReplay] = useState(0)
  return (
    <div className="space-y-2.5">
      {GROUPS.map(group => (
        <section key={group} aria-label={group} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TRANSITION_OPTIONS.filter(option => option.group === group).map(option => {
              const isApplied = applied === option.value, isCandidate = candidate === option.value
              return (
                <button key={option.value} type="button" data-transition-card={option.value} aria-pressed={isCandidate} aria-label={`${option.label}${isApplied ? ' (aplicada)' : ''}`}
                  onClick={() => { onCandidate(option.value); setReplay(count => count + 1) }}
                  onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(option.value) }} onPointerLeave={() => setHovered(null)}
                  className={cn('relative flex min-h-[4.75rem] flex-col gap-1 rounded-md border p-1 text-left text-[11px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                    isCandidate ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
                  <TransitionThumb key={isCandidate ? `${option.value}:${replay}` : option.value} type={option.value} playing={!reducedMotion && (hovered === option.value || isCandidate)} />
                  <span className="line-clamp-2 px-0.5">{option.label}</span>
                  {isApplied ? <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fuchsia-600 text-white"><Check className="h-3 w-3" aria-hidden /></span> : null}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
