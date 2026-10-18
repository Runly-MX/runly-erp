import { Badge, MarkdownViewer } from '@runly/ui'
import { resultStatus } from '../../lib/lmsAnswers.js'
import { QuestionKindTag } from '../quiz-builder/QuestionTypePicker.jsx'
import { AnswerReview } from './AnswerReview.jsx'

const pointsText = (value) => `${value} ${Number(value) === 1 ? 'punto' : 'puntos'}`
const BADGES = {
  correct: <Badge variant="success">Correcta</Badge>,
  partial: <Badge variant="warning">Parcial</Badge>,
  wrong: <Badge variant="destructive">Incorrecta</Badge>,
  pending: <Badge variant="secondary">Por calificar</Badge>,
}

// A question with the learner's answer and, when revealed, the correct answer,
// awarded points and explanation. `children` is the grader's points slot.
export function QuestionReview({ question, answer, index, children }) {
  const awarded = question.awardedPoints
  const status = resultStatus(question)
  return (
    <article className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4">
      <header className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Pregunta {index + 1}</p>
        <QuestionKindTag kind={question.kind} />
        <span className="ml-auto flex items-center gap-2">
          {status ? BADGES[status] : null}
          <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
            {awarded === null || awarded === undefined ? pointsText(question.points) : `${awarded} de ${pointsText(question.points)}`}
          </span>
        </span>
      </header>
      <MarkdownViewer value={question.prompt} className="text-[15px]" />
      <AnswerReview question={question} answer={answer} />
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
