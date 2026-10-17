import { useState } from 'react'
import { Button, CheckboxField, TextField } from '@runly/ui'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import {
  INTAKE_PRESETS, LABEL_MAX, MAX_CUSTOM_FIELDS, addCustomField, certTagFor, customFields, intakeFieldsError, presetEnabled, removeField,
  setFieldLabel, setFieldRequired, togglePreset,
} from '../../lib/lmsIntake.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const ROW = 'flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2'

function Required({ field, disabled, onChange }) {
  return (
    <CheckboxField
      label="Obligatorio" checked={field.required === true} disabled={disabled}
      onChange={(event) => onChange((fields) => setFieldRequired(fields, field.key, event.target.checked))}
    />
  )
}

// "Formulario" tab of the share dialog: what guests fill in before entering.
// The name is always asked. Edits are a local draft saved with one button; the
// parent keys this component by the stored list so a save resets the draft.
export function IntakeFieldsEditor({ fields = [], accessMode = 'open', disabled = false, saving = false, onSave }) {
  const [draft, setDraft] = useState(fields)
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState(null)
  const stored = JSON.stringify(fields)
  const dirty = JSON.stringify(draft) !== stored
  const customs = customFields(draft)
  const update = (fn) => { setDraft((current) => fn(current)); setError(null) }

  function add() {
    const result = addCustomField(draft, newLabel)
    if (result.error) return setError(result.error)
    setDraft(result.fields)
    setNewLabel('')
    setError(null)
  }

  function save() {
    const problem = intakeFieldsError(draft)
    if (problem) return setError(problem)
    onSave(draft)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Lo que cada invitado escribe antes de entrar. Las respuestas aparecen en Alumnos, en la exportación CSV y pueden imprimirse en el certificado.
      </p>
      <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
        <li className={ROW}>
          <span className="min-w-0 flex-1 text-sm font-medium">Nombre completo</span>
          <span className={MUTED}>Siempre obligatorio · {'{{alumno}}'}</span>
        </li>
        {INTAKE_PRESETS.map((preset) => {
          const field = draft.find((item) => item.key === preset.key)
          const tag = certTagFor(preset.key)
          return (
            <li key={preset.key} className={ROW}>
              <div className="min-w-0 flex-1">
                <CheckboxField
                  label={preset.label} checked={presetEnabled(draft, preset.key)} disabled={disabled}
                  onChange={(event) => update((current) => togglePreset(current, preset.key, event.target.checked))}
                />
                {preset.key === 'correo' && accessMode === 'invite' ? <p className={`${MUTED} pl-6`}>En cursos por invitación se toma del correo invitado.</p> : null}
              </div>
              {tag && field ? <span className={`${MUTED} font-mono`}>{`{{${tag}}}`}</span> : null}
              {field ? <Required field={field} disabled={disabled} onChange={update} /> : null}
            </li>
          )
        })}
        {customs.map((field) => (
          <li key={field.key} className={ROW}>
            <div className="min-w-48 flex-1">
              <TextField
                label="Etiqueta" value={field.label} maxLength={LABEL_MAX} disabled={disabled}
                onChange={(event) => update((current) => setFieldLabel(current, field.key, event.target.value))}
              />
            </div>
            <span className={`${MUTED} font-mono`}>{`{{campo_${field.key}}}`}</span>
            <Required field={field} disabled={disabled} onChange={update} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${field.label}`} disabled={disabled} onClick={() => update((current) => removeField(current, field.key))}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            label={`Campo personalizado (${customs.length}/${MAX_CUSTOM_FIELDS})`} placeholder="Ej. Planta, Turno, Área" value={newLabel}
            maxLength={LABEL_MAX} disabled={disabled || customs.length >= MAX_CUSTOM_FIELDS}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
          />
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={disabled || customs.length >= MAX_CUSTOM_FIELDS || !newLabel.trim()}><Plus />Agregar</Button>
      </div>
      {error ? <p className="text-sm text-[hsl(var(--destructive))]" role="alert">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {dirty ? <Button variant="ghost" onClick={() => { setDraft(JSON.parse(stored)); setError(null) }} disabled={saving}>Descartar</Button> : null}
        <Button onClick={save} disabled={disabled || saving || !dirty}>
          {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}Guardar formulario
        </Button>
      </div>
    </div>
  )
}
