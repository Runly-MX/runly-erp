import { NumberField, SelectField, SwitchField } from '@runly/ui'
import { SHOW_ANSWERS_LABELS, toOptions } from '../../lib/lmsLabels.js'
import { LMS_BOUNDS as B } from '../../lib/lmsEval.js'

const SHOW_OPTIONS = toOptions(SHOW_ANSWERS_LABELS)
const INT = { allowNegative: false, allowDecimal: false }

// Quiz settings on the lesson editor page (the questions are edited below them).
export function QuizSettingsFields({ value, onChange, errors = {}, disabled = false }) {
  const field = (key) => (event) => onChange(key, event.target.value)
  return (
    <section className="space-y-4 border-t border-[hsl(var(--border))] pt-4" aria-labelledby="lms-quiz-settings">
      <h3 id="lms-quiz-settings" className="text-sm font-semibold">Configuración del examen</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Calificación mínima (%)" required value={value.passingScore} onChange={field('passingScore')} error={errors.passingScore}
          hint="Porcentaje para aprobar, de 0 a 100." {...INT} {...B.passingScore} disabled={disabled}
        />
        <NumberField label="Intentos permitidos" value={value.maxAttempts} onChange={field('maxAttempts')} error={errors.maxAttempts} hint="De 1 a 20. Vacío: sin límite." {...INT} {...B.maxAttempts} disabled={disabled} />
        <NumberField
          label="Tiempo límite (minutos)" value={value.timeLimitMinutes} onChange={field('timeLimitMinutes')} error={errors.timeLimitMinutes}
          hint="De 1 a 600 minutos. Vacío: sin tiempo límite." {...INT} {...B.timeLimitMinutes} disabled={disabled}
        />
        <NumberField
          label="Preguntas por intento" value={value.drawCount} onChange={field('drawCount')} error={errors.drawCount}
          hint="De 1 a 200. Vacío: todas. Con un número, cada intento toma esa cantidad al azar." {...INT} {...B.drawCount} disabled={disabled}
        />
      </div>
      <SelectField
        label="Mostrar respuestas correctas" options={SHOW_OPTIONS} value={value.showAnswers}
        onValueChange={(next) => onChange('showAnswers', next)} disabled={disabled}
        hint="Cuándo ve el alumno las respuestas correctas y las explicaciones."
      />
      <SwitchField id="lms-quiz-shuffle-questions" label="Mezclar el orden de las preguntas" checked={value.shuffleQuestions} onChange={(checked) => onChange('shuffleQuestions', checked)} disabled={disabled} />
      <SwitchField
        id="lms-quiz-shuffle-options" label="Mezclar el orden de las opciones" description="Las preguntas de verdadero o falso conservan su orden."
        checked={value.shuffleOptions} onChange={(checked) => onChange('shuffleOptions', checked)} disabled={disabled}
      />
    </section>
  )
}
