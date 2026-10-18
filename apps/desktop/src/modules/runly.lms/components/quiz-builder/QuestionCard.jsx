import { Button, cn } from '@runly/ui'
import { Copy, Trash2 } from 'lucide-react'
import { promptPreview } from '../../lib/lmsQuestionForm.js'
import { DragHandle } from '../curriculum/DragHandle.jsx'
import { QuestionKindTag } from './QuestionTypePicker.jsx'

const pointsLabel = (points) => `${points} ${Number(points) === 1 ? 'punto' : 'puntos'}`

// A question in the builder list: grip, number, type, prompt preview, points
// and quick actions. The selected card is a flat fill.
export function QuestionCard({ question, index, selected, handleProps, isDragging, readOnly, busy, onSelect, onDuplicate, onDelete }) {
  return (
    <div
      className={cn(
        'flex items-stretch gap-1 rounded-md border bg-[hsl(var(--background))] transition-colors',
        selected ? 'border-transparent bg-[hsl(var(--muted))]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.5)]',
        isDragging && 'shadow-md',
      )}
    >
      {!readOnly ? <DragHandle handleProps={handleProps} label={`Mover la pregunta ${index + 1}`} className="self-center" /> : null}
      <button
        type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined}
        className={cn('flex min-w-0 flex-1 items-start gap-2.5 rounded-md py-2.5 pr-1 text-left focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]', readOnly && 'pl-3')}
      >
        <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] px-1 text-xs font-semibold tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={cn('block truncate text-sm', selected && 'font-medium')}>{promptPreview(question.prompt)}</span>
          <span className="flex min-w-0 items-center gap-2">
            <QuestionKindTag kind={question.kind} />
            <span className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">· {pointsLabel(question.points)}</span>
          </span>
        </span>
      </button>
      {!readOnly ? (
        <span className="flex shrink-0 items-center pr-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicar la pregunta ${index + 1}`} title="Duplicar" onClick={onDuplicate} disabled={busy}>
            <Copy />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar la pregunta ${index + 1}`} title="Eliminar" onClick={onDelete} className="text-[hsl(var(--destructive))]">
            <Trash2 />
          </Button>
        </span>
      ) : null}
    </div>
  )
}
