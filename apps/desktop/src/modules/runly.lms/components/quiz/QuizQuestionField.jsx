import { CheckboxField, MarkdownViewer, RadioGroupField, TextareaField, cn } from '@runly/ui'
import { selectOption } from '../../lib/lmsEval.js'

const pointsText = (value) => `${value} ${Number(value) === 1 ? 'punto' : 'puntos'}`

// One question of an attempt with its input: radio rows for single and true/false,
// checkbox rows for multiple, a textarea for open answers.
export function QuizQuestionField({ question, index, answer, onAnswer, disabled }) {
  const chosen = answer?.optionIds ?? []
  return (
    <section className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4" aria-labelledby={`lms-q-${question.id}`}>
      <header className="flex items-center gap-2">
        <p id={`lms-q-${question.id}`} className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Pregunta {index + 1}</p>
        <span className="ml-auto text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{pointsText(question.points)}</span>
      </header>
      <MarkdownViewer value={question.prompt} className="text-[15px]" />

      {question.kind === 'single' || question.kind === 'true_false' ? (
        <RadioGroupField
          name={`lms-q-${question.id}`}
          value={chosen[0] ?? null}
          onChange={(optionId) => { if (!disabled) onAnswer(selectOption(question, answer, optionId)) }}
          options={(question.options ?? []).map((option) => ({ value: option.id, label: option.text }))}
        />
      ) : null}

      {question.kind === 'multiple' ? (
        <div className="space-y-2">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Elige todas las respuestas correctas.</p>
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
      ) : null}

      {question.kind === 'open' ? (
        <TextareaField
          aria-label={`Respuesta a la pregunta ${index + 1}`} placeholder="Escribe tu respuesta…" rows={5} maxLength={10000} disabled={disabled}
          value={answer?.text ?? ''} onChange={(event) => onAnswer({ text: event.target.value })}
        />
      ) : null}
    </section>
  )
}
