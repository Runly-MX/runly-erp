import { ChoiceCardGroup } from '@runly/ui'
import {
  Brackets, CircleDot, Hash, Link2, ListChecks, ListOrdered, PenLine, TextCursorInput, ToggleLeft,
} from 'lucide-react'
import { QUESTION_KINDS } from '../../lib/lmsQuestionForm.js'
import { QUESTION_KIND_DESCRIPTIONS, QUESTION_KIND_LABELS } from '../../lib/lmsLabels.js'

export const QUESTION_KIND_ICONS = {
  single: CircleDot,
  multiple: ListChecks,
  true_false: ToggleLeft,
  short: TextCursorInput,
  numeric: Hash,
  fill_blank: Brackets,
  ordering: ListOrdered,
  matching: Link2,
  open: PenLine,
}

const OPTIONS = QUESTION_KINDS.map((kind) => ({
  value: kind,
  label: QUESTION_KIND_LABELS[kind],
  description: QUESTION_KIND_DESCRIPTIONS[kind],
  icon: QUESTION_KIND_ICONS[kind],
}))

// Grid of question types: icon, name and one line of what the learner does.
export function QuestionTypePicker({ value, onChange }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">¿Qué tipo de pregunta quieres agregar?</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Podrás cambiarlo después.</p>
      </div>
      <ChoiceCardGroup
        options={OPTIONS} value={value} onChange={onChange} ariaLabel="Tipo de pregunta"
        className="grid-cols-1 min-[420px]:grid-cols-2 2xl:grid-cols-3"
      />
    </div>
  )
}

// Small icon + label of a question type (list cards, form header, review).
export function QuestionKindTag({ kind, className }) {
  const Icon = QUESTION_KIND_ICONS[kind] ?? CircleDot
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] ${className ?? ''}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{QUESTION_KIND_LABELS[kind] ?? kind}</span>
    </span>
  )
}
