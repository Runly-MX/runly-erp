import { formToPreview } from '../../lib/lmsQuestionForm.js'
import { QuizQuestionField } from '../quiz/QuizQuestionField.jsx'

const noop = () => {}

// "Vista del alumno": the question being edited as the learner sees it,
// read-only (the real attempt shuffles options and ordering items).
export function QuestionPreview({ form, index }) {
  const question = formToPreview(form)
  return (
    <div className="space-y-2" aria-label="Vista del alumno">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Así verá el alumno esta pregunta. {['single', 'multiple', 'ordering', 'matching'].includes(form.kind) ? 'En el examen el orden se mezcla.' : ''}
      </p>
      <div className="pointer-events-none select-none" inert>
        <QuizQuestionField question={question} index={index} answer={null} onAnswer={noop} disabled />
      </div>
    </div>
  )
}
