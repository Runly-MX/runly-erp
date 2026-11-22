import { useEffect, useState } from 'react'
import { Button, DateTimeField, MarkdownField, NumberField, SectionCard, SelectField, SwitchField, TextField } from '@runly/ui'
import { Loader2, Undo2 } from 'lucide-react'
import { useUpdateAssessment } from '../../hooks/useLmsAssessments.js'
import { assessmentFormToPayload, assessmentToForm, timeZoneOptions, validateAssessmentForm } from '../../lib/lmsAssessment.js'

const INT = { allowNegative: false, allowDecimal: false }

// Evaluation settings: identity, the single clock, attempts, availability window
// and what the participant sees after submitting.
export function AssessmentSettingsForm({ assessment, readOnly }) {
  const save = useUpdateAssessment()
  const [baseline, setBaseline] = useState(() => assessmentToForm(assessment))
  const [form, setForm] = useState(baseline)
  const [errors, setErrors] = useState({})
  useEffect(() => { const next = assessmentToForm(assessment); setBaseline(next); setForm(next); setErrors({}) }, [assessment.id, assessment.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(assessmentFormToPayload(form)) !== JSON.stringify(assessmentFormToPayload(baseline))
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const setText = (key) => (event) => set(key)(event.target.value)

  async function submit(event) {
    event.preventDefault()
    const next = validateAssessmentForm(form)
    setErrors(next)
    if (Object.keys(next).length) return
    try { await save.mutateAsync({ id: assessment.id, ...assessmentFormToPayload(form) }) } catch { /* toast shown */ }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <SectionCard title="General">
        <div className="space-y-4">
          <TextField label="Título" required value={form.title} onChange={setText('title')} maxLength={200} error={errors.title} disabled={readOnly} autoComplete="off" />
          <MarkdownField
            label="Instrucciones generales" value={form.description} onChange={setText('description')} maxLength={50000} disabled={readOnly}
            hint="Se muestran antes de iniciar: qué se evalúa, materiales permitidos y reglas."
          />
        </div>
      </SectionCard>
      <SectionCard title="Tiempo e intentos">
        <div className="space-y-4">
          <SwitchField
            id="lms-assessment-limited" label="Tiempo límite" disabled={readOnly}
            description="Un solo reloj para todas las actividades. Empieza cuando la persona pulsa Iniciar y no se reinicia al cambiar de actividad."
            checked={form.limited} onChange={set('limited')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form.limited ? (
              <NumberField label="Duración total (minutos)" required value={form.timeLimitMinutes} onChange={setText('timeLimitMinutes')} error={errors.timeLimitMinutes} min={1} max={600} {...INT} disabled={readOnly} />
            ) : null}
            <NumberField label="Intentos por persona" required value={form.maxSessions} onChange={setText('maxSessions')} error={errors.maxSessions} min={1} max={20} {...INT} disabled={readOnly} hint="De 1 a 20." />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Disponibilidad">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField
            label="Zona horaria" options={timeZoneOptions(form.timeZone)} value={form.timeZone} onValueChange={set('timeZone')} disabled={readOnly}
            hint="Las fechas se escriben y se muestran en esta zona."
          />
          <DateTimeField label="Abre" value={form.opensAt} onChange={setText('opensAt')} disabled={readOnly} hint="Vacío: disponible al publicar." />
          <DateTimeField label="Cierra" value={form.closesAt} onChange={setText('closesAt')} error={errors.closesAt} disabled={readOnly} hint="Vacío: sin fecha de cierre." />
        </div>
      </SectionCard>
      <SectionCard title="Resultados">
        <div className="space-y-4">
          <NumberField
            label="Puntos mínimos para aprobar (opcional)" value={form.passingPoints} onChange={setText('passingPoints')} error={errors.passingPoints}
            min={0} allowNegative={false} disabled={readOnly} hint="Sobre el total de puntos de la evaluación. Vacío: sin mínimo."
          />
          <SwitchField
            id="lms-assessment-results" label="Mostrar el resultado al participante" disabled={readOnly}
            description="Cuando todas las actividades estén calificadas, la persona ve su puntaje."
            checked={form.showResultsToCandidate} onChange={set('showResultsToCandidate')}
          />
          <SwitchField
            id="lms-assessment-material" label="Material disponible después de entregar" disabled={readOnly}
            description="Si está apagado, el material solo se descarga mientras la evaluación está en curso."
            checked={form.materialAfterSubmit} onChange={set('materialAfterSubmit')}
          />
        </div>
      </SectionCard>
      {!readOnly ? (
        <div className="flex justify-end gap-2">
          {dirty ? <Button type="button" variant="outline" onClick={() => { setForm(baseline); setErrors({}) }}><Undo2 />Descartar</Button> : null}
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar
          </Button>
        </div>
      ) : null}
    </form>
  )
}
