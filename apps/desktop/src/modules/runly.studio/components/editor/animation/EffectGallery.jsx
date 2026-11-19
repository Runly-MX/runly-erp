import { useMemo, useState } from 'react'
import { Button, Input, cn } from '@runly/ui'
import { Check, Play, Search, Trash2 } from 'lucide-react'
import { EFFECTS_BY_KIND, EFFECT_GROUPS } from '../../../lib/effect-catalog.js'
import { EffectThumb } from './EffectThumb.jsx'

const normalize = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Visual gallery of one kind of effect. Tapping or clicking a card only previews it (on the
// card and on the real element); applying is a separate button, so trying effects never
// writes the design. Hover also plays the card on desktop.
export function EffectGallery({ kind, applied, disabled, reducedMotion, onPreview, onApply, onRemove }) {
  const options = EFFECTS_BY_KIND[kind]
  const [query, setQuery] = useState(''), [candidate, setCandidate] = useState(null), [hovered, setHovered] = useState(null), [replay, setReplay] = useState(0)
  const visible = useMemo(() => {
    const words = normalize(query.trim())
    return words ? options.filter(option => normalize(`${option.label} ${option.group}`).includes(words)) : options
  }, [options, query])
  const groups = EFFECT_GROUPS.map(group => [group, visible.filter(option => option.group === group)]).filter(([, list]) => list.length)
  const chosen = options.find(option => option.value === candidate)
  const preview = value => { setCandidate(value); setReplay(count => count + 1); if (!reducedMotion) onPreview(value) }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden />
        <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar efecto" aria-label="Buscar efecto" className="pl-8" />
      </div>
      {reducedMotion ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Tu sistema pide reducir el movimiento: las miniaturas muestran la estela del efecto sin reproducirlo.</p> : null}
      {groups.length ? groups.map(([group, list]) => (
        <section key={group} aria-label={group} className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {list.map(option => {
              const isApplied = applied === option.value, isCandidate = candidate === option.value
              return (
                <button key={option.value} type="button" data-effect-card={option.value} aria-pressed={isCandidate} aria-label={`${option.label}${isApplied ? ' (aplicado)' : ''}`}
                  onClick={() => preview(option.value)}
                  onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(option.value) }} onPointerLeave={() => setHovered(null)}
                  className={cn('group relative flex min-h-[4.75rem] flex-col items-stretch gap-1 rounded-md border p-1 text-left text-[11px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                    isCandidate ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
                  <span className="aspect-[16/10] w-full overflow-hidden rounded-[5px]">
                    <EffectThumb key={isCandidate ? `${option.value}:${replay}` : option.value} kind={kind} choice={option.value} playing={!reducedMotion && (hovered === option.value || isCandidate)} />
                  </span>
                  <span className="line-clamp-2 px-0.5">{option.label}</span>
                  {isApplied ? <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fuchsia-600 text-white"><Check className="h-3 w-3" aria-hidden /></span> : null}
                </button>
              )
            })}
          </div>
        </section>
      )) : <p className="text-sm text-[hsl(var(--muted-foreground))]">Ningún efecto coincide con «{query}».</p>}
      {/* Decision bar: preview again, apply the card being tried, or remove the applied effect. */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-1.5 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1 py-2">
        <p className="w-full truncate text-xs">{chosen ? <><span className="text-[hsl(var(--muted-foreground))]">Probando: </span><span className="font-medium">{chosen.label}</span></> : <span className="text-[hsl(var(--muted-foreground))]">Toca un efecto para verlo en el elemento.</span>}</p>
        {chosen ? <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => preview(chosen.value)}><Play className="h-3.5 w-3.5" aria-hidden />Reproducir de nuevo</Button> : null}
        {chosen && chosen.value !== applied ? <Button type="button" size="sm" className="gap-1" disabled={disabled} onClick={() => onApply(chosen.value)}><Check className="h-3.5 w-3.5" aria-hidden />Aplicar</Button> : null}
        {applied !== 'none' ? <Button type="button" size="sm" variant="ghost" className="gap-1 text-destructive" disabled={disabled} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" aria-hidden />Quitar</Button> : null}
      </div>
    </div>
  )
}
