import { cn } from '@runly/ui'
import { Flag } from 'lucide-react'
import { navState } from '../../lib/lmsAnswers.js'

const STATE_CLASS = {
  answered: 'border-transparent bg-primary/12 text-primary',
  unanswered: 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.6)]',
  flagged: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300',
}
const STATE_LABEL = { answered: 'respondida', unanswered: 'sin responder', flagged: 'marcada para revisar' }

// Question buttons of a one-at-a-time attempt: answered, unanswered and
// "Revisar después" states; the current one is a solid fill.
export function QuizNavigator({ questions, answers, flags, current, onGo }) {
  return (
    <nav aria-label="Preguntas del examen" className="space-y-2">
      <ol className="flex flex-wrap gap-1.5">
        {questions.map((question, index) => {
          const state = navState(question, answers[question.id], flags.has(question.id))
          const active = index === current
          return (
            <li key={question.id}>
              <button
                type="button" onClick={() => onGo(index)} aria-current={active ? 'step' : undefined}
                aria-label={`Pregunta ${index + 1}, ${STATE_LABEL[state]}`}
                className={cn(
                  'relative flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium tabular-nums transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                  active ? 'border-transparent bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : STATE_CLASS[state],
                )}
              >
                {index + 1}
                {state === 'flagged' ? <Flag className="absolute -right-1 -top-1 h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" /> : null}
              </button>
            </li>
          )
        })}
      </ol>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/35" aria-hidden="true" />Respondida</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-[hsl(var(--border))]" aria-hidden="true" />Sin responder</span>
        <span className="flex items-center gap-1.5"><Flag className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />Revisar después</span>
      </p>
    </nav>
  )
}
