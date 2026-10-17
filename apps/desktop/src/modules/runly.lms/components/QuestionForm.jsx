import { Button, CheckboxField, FieldWrapper, MarkdownField, NumberField, SelectField, TextField } from '@runly/ui'
import { Plus, Trash2 } from 'lucide-react'
import { changeQuestionKind, setOptionCorrect } from '../lib/lmsEval.js'
import { QUESTION_KIND_LABELS, toOptions } from '../lib/lmsLabels.js'

const KIND_OPTIONS = toOptions(QUESTION_KIND_LABELS)
const TRUE_FALSE_OPTIONS = [{ value: 'true', label: 'Verdadero' }, { value: 'false', label: 'Falso' }]
const MAX_OPTIONS = 10

function OptionsEditor({ form, onChange, error }) {
  const update = (index, patch) => onChange({ ...form, options: form.options.map((option, i) => (i === index ? { ...option, ...patch } : option)) })
  const remove = (index) => onChange({ ...form, options: form.options.filter((_, i) => i !== index) })
  const add = () => onChange({ ...form, options: [...form.options, { text: '', correct: false }] })
  return (
    <FieldWrapper
      label="Opciones" required error={error}
      hint={form.kind === 'single' ? 'Marca la única respuesta correcta.' : 'Marca todas las respuestas correctas. Solo suma puntos si el alumno elige exactamente esas.'}
    >
      <ul className="space-y-2">
        {form.options.map((option, index) => (
          <li key={index} className="flex items-center gap-3">
            <CheckboxField
              id={`lms-option-correct-${index}`} label="Correcta" className="shrink-0"
              checked={option.correct} onChange={(event) => onChange(setOptionCorrect(form, index, event.target.checked))}
            />
            <div className="min-w-0 flex-1">
              <TextField
                aria-label={`Opción ${index + 1}`} placeholder={`Opción ${index + 1}`} value={option.text} maxLength={500} icon={null}
                onChange={(event) => update(index, { text: event.target.value })} autoComplete="off"
              />
            </div>
            <Button
              type="button" variant="ghost" size="icon-sm" aria-label={`Quitar opción ${index + 1}`} title="Quitar opción"
              className="text-[hsl(var(--destructive))]" onClick={() => remove(index)} disabled={form.options.length <= 2}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={add} disabled={form.options.length >= MAX_OPTIONS}>
        <Plus />Agregar opción
      </Button>
    </FieldWrapper>
  )
}

// One question of a quiz. `form` comes from lmsEval.questionToForm.
export function QuestionForm({ form, onChange, errors = {} }) {
  const set = (key) => (event) => onChange({ ...form, [key]: event.target.value })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem]">
        <SelectField label="Tipo de pregunta" options={KIND_OPTIONS} value={form.kind} onValueChange={(kind) => onChange(changeQuestionKind(form, kind))} />
        <NumberField label="Puntos" required value={form.points} onChange={set('points')} error={errors.points} allowNegative={false} allowDecimal={false} />
      </div>
      <MarkdownField
        label="Pregunta" required value={form.prompt} onChange={set('prompt')} error={errors.prompt} maxLength={10000}
        placeholder="Escribe la pregunta…" hint="Usa la barra para dar formato: negritas, listas, tablas y enlaces."
      />
      {form.kind === 'single' || form.kind === 'multiple' ? <OptionsEditor form={form} onChange={onChange} error={errors.options} /> : null}
      {form.kind === 'true_false' ? (
        <SelectField label="Respuesta correcta" options={TRUE_FALSE_OPTIONS} value={form.trueFalse} onValueChange={(value) => onChange({ ...form, trueFalse: value })} />
      ) : null}
      {form.kind === 'open' ? (
        <p className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm text-[hsl(var(--muted-foreground))]">
          El alumno escribe su respuesta y un instructor la califica desde Revisión, de 0 a {form.points || 1} puntos.
        </p>
      ) : null}
      <MarkdownField
        label="Explicación" value={form.explanation} onChange={set('explanation')} maxLength={10000}
        placeholder="Por qué esta es la respuesta correcta…"
        hint="Opcional. Se muestra con los resultados, según cuándo el examen muestra las respuestas."
      />
    </div>
  )
}
