import { Alert, AlertDescription, ChoiceCardGroup, NumberField, SelectField, SwitchField } from '@runly/ui'
import { RectangleHorizontal, Rows3 } from 'lucide-react'
import { useQuestions } from '../../hooks/useLmsEval.js'
import { QUIZ_LAYOUT_LABELS, SHOW_ANSWERS_LABELS, toOptions } from '../../lib/lmsLabels.js'
import { LMS_BOUNDS as B, drawCountWarning } from '../../lib/lmsEval.js'

const SHOW_OPTIONS = toOptions(SHOW_ANSWERS_LABELS)
const LAYOUT_OPTIONS = [
  { value: 'all', label: QUIZ_LAYOUT_LABELS.all, description: 'El alumno ve y responde todo en una sola página.', icon: Rows3 },
  { value: 'one', label: QUIZ_LAYOUT_LABELS.one, description: 'Con botones Anterior y Siguiente y un mapa de preguntas.', icon: RectangleHorizontal },
]
const INT = { allowNegative: false, allowDecimal: false }

// Quiz settings on the lesson editor page (the questions are edited below them).
// `lessonId` (saved lessons) shows the question count next to the draw count.
export function QuizSettingsFields({ value, onChange, errors = {}, disabled = false, lessonId = null }) {
  const field = (key) => (event) => onChange(key, event.target.value)
  const questions = useQuestions(lessonId, { enabled: Boolean(lessonId) })
  const count = lessonId && questions.data ? questions.data.length : null
  const warning = drawCountWarning(value.drawCount, count)
  const countText = count === null ? null : `Este examen tiene ${count} ${count === 1 ? 'pregunta' : 'preguntas'}.`
  return (
    <section className="space-y-4 border-t border-[hsl(var(--border))] pt-4" aria-labelledby="lms-quiz-settings">
      <h3 id="lms-quiz-settings" className="text-sm font-semibold">Configuración del examen</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Calificación para aprobar (%)" required value={value.passingScore} onChange={field('passingScore')} error={errors.passingScore}
          hint="Porcentaje mínimo de puntos que necesita el alumno, de 0 a 100." {...INT} {...B.passingScore} disabled={disabled}
        />
        <NumberField
          label="Intentos permitidos" value={value.maxAttempts} onChange={field('maxAttempts')} error={errors.maxAttempts}
          hint="Cuántas veces puede presentar el examen, de 1 a 20. Déjalo vacío para no poner límite." {...INT} {...B.maxAttempts} disabled={disabled}
        />
        <NumberField
          label="Tiempo límite (minutos)" value={value.timeLimitMinutes} onChange={field('timeLimitMinutes')} error={errors.timeLimitMinutes}
          hint="Al terminarse el tiempo, el examen se envía solo con lo que haya respondido. Déjalo vacío para no poner límite." {...INT} {...B.timeLimitMinutes} disabled={disabled}
        />
        <div className="space-y-2">
          <NumberField
            label="Preguntas aleatorias por intento" value={value.drawCount} onChange={field('drawCount')} error={errors.drawCount}
            hint={`Déjalo vacío para que el alumno responda todas las preguntas. Si escribes un número (por ejemplo 10 de 30), cada intento mostrará esa cantidad de preguntas elegidas al azar, distintas en cada intento.${countText ? ` ${countText}` : ''}`}
            {...INT} {...B.drawCount} disabled={disabled}
          />
          {warning ? <Alert variant="warning"><AlertDescription>{warning}</AlertDescription></Alert> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Cómo se muestran las preguntas</p>
        <ChoiceCardGroup columns={2} options={LAYOUT_OPTIONS} value={value.layout ?? 'all'} onChange={(next) => onChange('layout', next)} disabled={disabled} ariaLabel="Cómo se muestran las preguntas" />
      </div>
      <SelectField
        label="Mostrar respuestas correctas" options={SHOW_OPTIONS} value={value.showAnswers}
        onValueChange={(next) => onChange('showAnswers', next)} disabled={disabled}
        hint="Cuándo puede ver el alumno qué respondió bien, las respuestas correctas y las explicaciones."
      />
      <SwitchField
        id="lms-quiz-shuffle-questions" label="Mezclar el orden de las preguntas" description="Cada intento presenta las preguntas en un orden distinto."
        checked={value.shuffleQuestions} onChange={(checked) => onChange('shuffleQuestions', checked)} disabled={disabled}
      />
      <SwitchField
        id="lms-quiz-shuffle-options" label="Mezclar el orden de las opciones"
        description="Cambia el orden de las opciones en cada intento. Verdadero o falso conserva su orden; en ordenar y relacionar los elementos siempre se mezclan."
        checked={value.shuffleOptions} onChange={(checked) => onChange('shuffleOptions', checked)} disabled={disabled}
      />
    </section>
  )
}
