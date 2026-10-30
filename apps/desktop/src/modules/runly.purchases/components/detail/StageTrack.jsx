import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown } from 'lucide-react'
import { cn } from '@runly/ui'
import { stageMeta } from '../../lib/purchases-constants.js'
import { columnsBreakpoint, stageSummary } from '../../lib/stage-summary.js'

// Compact progress of one document through the company's enabled stages (the
// API's stageMap already drops the stages whose capability is off). Never
// scrolls sideways: a segmented bar with every stage, the labels in equal
// columns once they fit (see columnsBreakpoint), and below that a summary
// plus a disclosure listing them. Labels wrap; nothing relies on tooltips.

const STATE_TEXT = { done: 'Completada', current: 'En curso', blocked: 'Bloqueada', skipped: 'No aplica', pending: 'Pendiente' }
const SEGMENT = {
  done: 'bg-emerald-600 dark:bg-emerald-400',
  current: 'bg-(--brand-primary)',
  blocked: 'bg-rose-600 dark:bg-rose-400',
  skipped: 'bg-[repeating-linear-gradient(135deg,hsl(var(--border))_0_3px,transparent_3px_6px)]',
  pending: 'bg-[hsl(var(--border))]',
}
const STATE_COLOR = {
  done: 'text-emerald-700 dark:text-emerald-300',
  current: 'text-(--brand-primary-computed)',
  blocked: 'text-rose-700 dark:text-rose-300',
  skipped: 'text-[hsl(var(--muted-foreground))]',
  pending: 'text-[hsl(var(--muted-foreground))]',
}

const labelOf = (stage) => stage.label ?? stageMeta(stage.type).label

function StateIcon({ stage, className }) {
  if (stage.state === 'done') return <Check className={className} strokeWidth={3} aria-hidden />
  if (stage.state === 'blocked') return <AlertTriangle className={className} aria-hidden />
  const Icon = stageMeta(stage.type).icon
  return <Icon className={className} aria-hidden />
}

function RefChip({ stageRef, onOpenRef, touch }) {
  return (
    <button type="button" onClick={() => onOpenRef?.(stageRef)}
      className={cn('rounded-md bg-[hsl(var(--muted))] font-medium tabular-nums text-[hsl(var(--foreground))] transition-colors hover:bg-(--brand-primary)/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/40',
        touch ? 'min-h-10 px-2.5 text-xs' : 'px-1.5 py-0.5 text-[11px]')}>
      {stageRef.number ?? 'Ver'}
    </button>
  )
}

// Classes per breakpoint from which the stages show as labelled columns.
const AT = {
  sm: { columns: 'hidden sm:block', compact: 'sm:hidden', reader: 'sr-only sm:hidden' },
  md: { columns: 'hidden md:block', compact: 'md:hidden', reader: 'sr-only md:hidden' },
  lg: { columns: 'hidden lg:block', compact: 'lg:hidden', reader: 'sr-only lg:hidden' },
}

export function StageTrack({ stages = [], onOpenRef }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())
  if (!stages.length) return null
  const summary = stageSummary(stages, labelOf)
  const at = AT[columnsBreakpoint(stages.length)]
  const toggleRefs = (key) => setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })

  return (
    <div className="space-y-2.5" lang="es">
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('min-w-0 text-sm font-semibold', STATE_COLOR[summary.tone])}>{summary.text}</p>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className={cn('-my-2 flex min-h-11 shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/40', at.compact)}>
          {open ? 'Ocultar etapas' : 'Ver etapas'}
          <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      <ol className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} aria-label="Etapas del proceso">
        {stages.map((stage, index) => {
          const key = stage.type + index
          const refs = stage.refs ?? []
          const showAll = expanded.has(key)
          return (
            <li key={key} className="min-w-0" data-stage={stage.type}>
              <span aria-hidden className={cn('block h-1.5 rounded-full', SEGMENT[stage.state] ?? SEGMENT.pending)} />
              <div className={cn('mt-2 min-w-0', at.columns)}>
                <p className="flex min-w-0 items-start gap-1 text-xs font-medium leading-snug text-[hsl(var(--foreground))]">
                  <StateIcon stage={stage} className={cn('mt-px h-3.5 w-3.5 shrink-0', STATE_COLOR[stage.state])} />
                  <span className="min-w-0 break-words [hyphens:auto]" data-stage-label="">{labelOf(stage)}</span>
                </p>
                <p className={cn('text-[11px] leading-snug', STATE_COLOR[stage.state])}>{STATE_TEXT[stage.state] ?? ''}</p>
                {refs.length ? (
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                    {(showAll ? refs : refs.slice(0, 1)).map((ref) => <RefChip key={ref.id} stageRef={ref} onOpenRef={onOpenRef} />)}
                    {refs.length > 1 ? (
                      <button type="button" onClick={() => toggleRefs(key)} aria-expanded={showAll}
                        aria-label={showAll ? `Mostrar menos referencias de ${labelOf(stage)}` : `Ver ${refs.length - 1} referencias más de ${labelOf(stage)}`}
                        className="rounded-md px-1 py-0.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/40">
                        {showAll ? 'Menos' : `+${refs.length - 1}`}
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <span className={at.reader}>{`${labelOf(stage)}: ${STATE_TEXT[stage.state] ?? ''}`}</span>
            </li>
          )
        })}
      </ol>

      {open ? (
        <ol className={cn('divide-y divide-[hsl(var(--border))]', at.compact)} aria-label="Detalle de etapas">
          {stages.map((stage, index) => (
            <li key={stage.type + index} className="flex items-start gap-3 py-2.5">
              <StateIcon stage={stage} className={cn('mt-0.5 h-4 w-4 shrink-0', STATE_COLOR[stage.state])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{labelOf(stage)}</p>
                <p className={cn('text-xs', STATE_COLOR[stage.state])}>{STATE_TEXT[stage.state] ?? ''}</p>
              </div>
              {stage.refs?.length ? (
                <span className="flex max-w-[45%] flex-wrap justify-end gap-1">
                  {stage.refs.map((ref) => <RefChip key={ref.id} stageRef={ref} onOpenRef={onOpenRef} touch />)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
