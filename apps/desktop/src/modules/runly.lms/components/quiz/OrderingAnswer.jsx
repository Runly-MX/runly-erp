import { Button, SortableList, cn } from '@runly/ui'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { orderedIds } from '../../lib/lmsAnswers.js'
import { DragHandle } from '../curriculum/DragHandle.jsx'

// Ordering question: drag the rows (pointer or keyboard on the grip) or use
// the arrow buttons. The first change saves the whole order.
export function OrderingAnswer({ question, answer, onAnswer, disabled }) {
  const byId = new Map((question.options ?? []).map((option) => [option.id, option]))
  const ids = orderedIds(question, answer)
  const rows = ids.map((id) => byId.get(id)).filter(Boolean)
  const move = (from, to) => {
    if (to < 0 || to >= ids.length) return
    const next = [...ids]
    const [id] = next.splice(from, 1)
    next.splice(to, 0, id)
    onAnswer({ order: next })
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Arrastra los elementos o usa las flechas para ponerlos en el orden correcto.</p>
      <div className="space-y-1.5" role="list" aria-label="Elementos para ordenar">
        <SortableList
          items={rows} disabled={disabled} labelOf={(row) => row.text}
          onReorder={(next) => onAnswer({ order: next.map((row) => row.id) })}
          renderItem={(row, { dragHandleProps, isDragging, index }) => (
            <div role="listitem" className={cn('flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-1.5 pl-1 pr-1.5', isDragging && 'shadow-md')}>
              {!disabled ? <DragHandle handleProps={dragHandleProps} label={`Mover «${row.text}»`} /> : null}
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}.</span>
              <span className={cn('min-w-0 flex-1 text-sm', disabled && 'pl-2')}>{row.text}</span>
              {!disabled ? (
                <span className="flex shrink-0">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Subir «${row.text}»`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bajar «${row.text}»`} disabled={index === rows.length - 1} onClick={() => move(index, index + 1)}><ArrowDown /></Button>
                </span>
              ) : null}
            </div>
          )}
        />
      </div>
    </div>
  )
}
