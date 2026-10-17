import { Button, NumberField, SelectField, SwitchField } from '@runly/ui'
import { ListChecks } from 'lucide-react'
import { SHOW_ANSWERS_LABELS, toOptions } from '../../lib/lmsLabels.js'

const SHOW_OPTIONS = toOptions(SHOW_ANSWERS_LABELS)
const INT = { allowNegative: false, allowDecimal: false }

// Quiz settings inside the lesson sheet. `onEditQuestions` is null until the
// lesson exists (questions belong to a saved lesson).
export function QuizSettingsFields({ value, onChange, errors = {}, onEditQuestions }) {
  const field = (key) => (event) => onChange(key, event.target.value)
  return (
    <section className="space-y-4 border-t border-[hsl(var(--border))] pt-4" aria-labelledby="lms-quiz-settings">
      <h3 id="lms-quiz-settings" className="text-sm font-semibold">Configuración del examen</h3>
      <div className="flex flex-col gap-3 rounded-md bg-[hsl(var(--muted)/0.6)] p-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-[hsl(var(--muted-foreground))]">
          {onEditQuestions ? 'Agrega las preguntas y marca sus respuestas correctas.' : 'Guarda la lección para agregar las preguntas.'}
        </p>
        <Button type="button" variant="outline" onClick={() => onEditQuestions?.()} disabled={!onEditQuestions}><ListChecks />Editar preguntas</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Calificación mínima (%)" required value={value.passingScore} onChange={field('passingScore')} error={errors.passingScore}
          hint="Porcentaje para aprobar, de 0 a 100." {...INT}
        />
        <NumberField label="Intentos permitidos" value={value.maxAttempts} onChange={field('maxAttempts')} error={errors.maxAttempts} hint="Vacío: sin límite." {...INT} />
        <NumberField
          label="Tiempo límite (minutos)" value={value.timeLimitMinutes} onChange={field('timeLimitMinutes')} error={errors.timeLimitMinutes}
          hint="Vacío: sin tiempo límite." {...INT}
        />
        <NumberField
          label="Preguntas por intento" value={value.drawCount} onChange={field('drawCount')} error={errors.drawCount}
          hint="Vacío: todas. Con un número, cada intento toma esa cantidad al azar." {...INT}
        />
      </div>
      <SelectField
        label="Mostrar respuestas correctas" options={SHOW_OPTIONS} value={value.showAnswers}
        onValueChange={(next) => onChange('showAnswers', next)}
        hint="Cuándo ve el alumno las respuestas correctas y las explicaciones."
      />
      <SwitchField id="lms-quiz-shuffle-questions" label="Mezclar el orden de las preguntas" checked={value.shuffleQuestions} onChange={(checked) => onChange('shuffleQuestions', checked)} />
      <SwitchField
        id="lms-quiz-shuffle-options" label="Mezclar el orden de las opciones" description="Las preguntas de verdadero o falso conservan su orden."
        checked={value.shuffleOptions} onChange={(checked) => onChange('shuffleOptions', checked)}
      />
    </section>
  )
}
