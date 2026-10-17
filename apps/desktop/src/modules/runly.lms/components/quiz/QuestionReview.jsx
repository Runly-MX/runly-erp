import { Badge, MarkdownViewer, cn } from '@runly/ui'
import { CheckCircle2, Circle, CircleDot, XCircle } from 'lucide-react'
import { QUESTION_KIND_LABELS } from '../../lib/lmsLabels.js'

const pointsText = (value) => `${value} ${Number(value) === 1 ? 'punto' : 'puntos'}`

function ResultBadge({ question }) {
  if (question.correct === true) return <Badge variant="success">Correcta</Badge>
  if (question.correct === false) return <Badge variant="destructive">Incorrecta</Badge>
  if (question.kind === 'open' && (question.awardedPoints === null || question.awardedPoints === undefined)) return <Badge variant="secondary">Por calificar</Badge>
  return null
}

function OptionLine({ option, selected }) {
  const known = typeof option.correct === 'boolean'
  const Icon = known && option.correct ? CheckCircle2 : known && selected ? XCircle : selected ? CircleDot : Circle
  const tone = known && option.correct
    ? 'text-emerald-600 dark:text-emerald-400'
    : known && selected ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'
  return (
    <li className={cn('flex items-start gap-2.5 rounded-md px-3 py-2 text-sm', selected && 'bg-[hsl(var(--muted))] font-medium')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden="true" />
      <span className="min-w-0 flex-1">{option.text}</span>
      {selected ? <span className="shrink-0 text-xs font-normal text-[hsl(var(--muted-foreground))]">Respuesta elegida</span> : null}
    </li>
  )
}

// A question with the learner's answer and, when revealed, the correct options,
// awarded points and explanation. `children` is the grader's points slot.
export function QuestionReview({ question, answer, index, children }) {
  const selected = new Set(answer?.optionIds ?? [])
  const awarded = question.awardedPoints
  return (
    <article className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4">
      <header className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Pregunta {index + 1} · {QUESTION_KIND_LABELS[question.kind] ?? question.kind}
        </p>
        <span className="ml-auto flex items-center gap-2">
          <ResultBadge question={question} />
          <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
            {awarded === null || awarded === undefined ? pointsText(question.points) : `${awarded} de ${pointsText(question.points)}`}
          </span>
        </span>
      </header>
      <MarkdownViewer value={question.prompt} className="text-[15px]" />
      {question.kind === 'open' ? (
        answer?.text?.trim()
          ? <p className="whitespace-pre-wrap rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm">{answer.text}</p>
          : <p className="text-sm italic text-[hsl(var(--muted-foreground))]">Sin respuesta.</p>
      ) : (
        <ul className="space-y-1">
          {(question.options ?? []).map((option) => <OptionLine key={option.id} option={option} selected={selected.has(option.id)} />)}
        </ul>
      )}
      {question.explanation?.trim() ? (
        <div className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Explicación</p>
          <MarkdownViewer value={question.explanation} />
        </div>
      ) : null}
      {children}
    </article>
  )
}

// True when the payload carries correct flags (the quiz reveals answers).
export const isRevealed = (questions) => (questions ?? []).some((question) => typeof question.correct === 'boolean'
  || question.awardedPoints !== undefined || (question.options ?? []).some((option) => typeof option.correct === 'boolean'))
