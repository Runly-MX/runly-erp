import { useState } from 'react'
import { Button, MarkdownField, NumberField } from '@runly/ui'
import { Repeat2, X } from 'lucide-react'
import { POINTS, changeQuestionKind } from '../lib/lmsQuestionForm.js'
import { KindFields } from './quiz-builder/KindFields.jsx'
import { QuestionKindTag, QuestionTypePicker } from './quiz-builder/QuestionTypePicker.jsx'

const PROMPT_COPY = {
  fill_blank: { placeholder: 'La capital de Francia es [[París]].', hint: 'Marca cada espacio en blanco con [[respuesta]].' },
}
const DEFAULT_PROMPT = { placeholder: 'Escribe la pregunta…', hint: 'Usa la barra para dar formato: negritas, listas, tablas y enlaces.' }

// One question of a quiz. `form` comes from lmsQuestionForm.questionToForm.
export function QuestionForm({ form, onChange, errors = {}, disabled = false }) {
  const [picking, setPicking] = useState(false)
  const set = (key) => (event) => onChange({ ...form, [key]: event.target.value })
  const prompt = PROMPT_COPY[form.kind] ?? DEFAULT_PROMPT
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">Tipo de pregunta</p>
          <div className="flex items-center gap-2">
            <QuestionKindTag kind={form.kind} className="text-sm text-[hsl(var(--foreground))]" />
            {!disabled ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPicking((value) => !value)} aria-expanded={picking}>
                {picking ? <X /> : <Repeat2 />}{picking ? 'Cerrar' : 'Cambiar tipo'}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="w-36">
          <NumberField
            label="Puntos" required value={form.points} onChange={set('points')} error={errors.points}
            allowNegative={false} allowDecimal={false} min={POINTS.min} max={POINTS.max} disabled={disabled}
          />
        </div>
      </div>
      {picking ? (
        <div className="rounded-md border border-[hsl(var(--border))] p-3">
          <QuestionTypePicker value={form.kind} onChange={(kind) => { onChange(changeQuestionKind(form, kind)); setPicking(false) }} />
        </div>
      ) : null}
      <MarkdownField
        label="Pregunta" required value={form.prompt} onChange={set('prompt')} error={errors.prompt} maxLength={10000}
        placeholder={prompt.placeholder} hint={prompt.hint} readOnly={disabled}
      />
      <KindFields form={form} onChange={onChange} errors={errors} disabled={disabled} />
      <MarkdownField
        label="Explicación" value={form.explanation} onChange={set('explanation')} maxLength={10000}
        placeholder="Por qué esta es la respuesta correcta…" readOnly={disabled}
        hint="Opcional. El alumno la ve con sus resultados, según la opción «Mostrar respuestas correctas»."
      />
    </div>
  )
}
