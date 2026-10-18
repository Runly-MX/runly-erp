import { Button, CheckboxField, MarkdownViewer, NumberField, RadioGroupField, TextField, TextareaField, cn } from '@runly/ui'
import { Flag } from 'lucide-react'
import { selectOption } from '../../lib/lmsEval.js'
import { FillBlankAnswer } from './FillBlankAnswer.jsx'
import { MatchingAnswer } from './MatchingAnswer.jsx'
import { OrderingAnswer } from './OrderingAnswer.jsx'

const pointsText = (value) => `${value} ${Number(value) === 1 ? 'punto' : 'puntos'}`
const NUMBER_LIMIT = 1_000_000_000

function MultipleAnswer({ question, chosen, answer, onAnswer, disabled }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Elige todas las respuestas correctas.{question.partialCredit ? ' Cada acierto suma y cada opción incorrecta resta.' : ''}
      </p>
      <ul className="space-y-2">
        {(question.options ?? []).map((option) => {
          const checked = chosen.includes(option.id)
          return (
            <li key={option.id} className={cn('rounded-md border px-3.5 py-3', checked ? 'border-transparent bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.4)]')}>
              <CheckboxField
                id={`lms-q-${question.id}-${option.id}`} label={option.text} checked={checked} disabled={disabled}
                onChange={() => onAnswer(selectOption(question, answer, option.id))}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function AnswerInput({ question, index, answer, onAnswer, disabled }) {
  const chosen = answer?.optionIds ?? []
  switch (question.kind) {
    case 'single':
    case 'true_false':
      return (
        <RadioGroupField
          name={`lms-q-${question.id}`} value={chosen[0] ?? null}
          onChange={(optionId) => { if (!disabled) onAnswer(selectOption(question, answer, optionId)) }}
          options={(question.options ?? []).map((option) => ({ value: option.id, label: option.text }))}
        />
      )
    case 'multiple':
      return <MultipleAnswer question={question} chosen={chosen} answer={answer} onAnswer={onAnswer} disabled={disabled} />
    case 'short':
      return (
        <TextField
          aria-label={`Respuesta a la pregunta ${index + 1}`} placeholder="Escribe tu respuesta…" maxLength={1000} disabled={disabled} icon={null}
          autoComplete="off" value={answer?.text ?? ''} onChange={(event) => onAnswer({ text: event.target.value })}
        />
      )
    case 'numeric':
      return (
        <div className="max-w-60">
          <NumberField
            label="Tu respuesta" value={answer?.value ?? ''} disabled={disabled} min={-NUMBER_LIMIT} max={NUMBER_LIMIT}
            onChange={(event) => onAnswer({ value: String(event.target.value ?? '') })} hint="Usa punto para los decimales."
          />
        </div>
      )
    case 'ordering':
      return <OrderingAnswer question={question} answer={answer} onAnswer={onAnswer} disabled={disabled} />
    case 'matching':
      return <MatchingAnswer question={question} answer={answer} onAnswer={onAnswer} disabled={disabled} />
    case 'fill_blank':
      return null // rendered in place of the prompt
    default:
      return (
        <TextareaField
          aria-label={`Respuesta a la pregunta ${index + 1}`} placeholder="Escribe tu respuesta…" rows={5} maxLength={10000} disabled={disabled}
          value={answer?.text ?? ''} onChange={(event) => onAnswer({ text: event.target.value })}
        />
      )
  }
}

// One question of an attempt with its input. `onToggleFlag` shows the
// "Revisar después" toggle; `total` adds "de N" to the heading.
export function QuizQuestionField({ question, index, total, answer, onAnswer, disabled, flagged = false, onToggleFlag }) {
  const fill = question.kind === 'fill_blank'
  return (
    <section className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4" aria-labelledby={`lms-q-${question.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        <p id={`lms-q-${question.id}`} className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Pregunta {index + 1}{total ? ` de ${total}` : ''}
        </p>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{pointsText(question.points)}</span>
          {onToggleFlag ? (
            <Button
              type="button" variant="ghost" size="sm" aria-pressed={flagged} onClick={onToggleFlag}
              className={cn('h-7 px-2 text-xs', flagged ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300' : 'text-[hsl(var(--muted-foreground))]')}
            >
              <Flag className={cn(flagged && 'fill-current')} />{flagged ? 'Marcada para revisar' : 'Revisar después'}
            </Button>
          ) : null}
        </span>
      </header>
      {fill ? (
        <>
          <FillBlankAnswer question={question} answer={answer} onAnswer={onAnswer} disabled={disabled} index={index} />
          {question.partialCredit ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Cada espacio correcto suma su parte.</p> : null}
        </>
      ) : <MarkdownViewer value={question.prompt} className="text-[15px]" />}
      <AnswerInput question={question} index={index} answer={answer} onAnswer={onAnswer} disabled={disabled} />
    </section>
  )
}
