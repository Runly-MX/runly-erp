import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge, Button, CheckboxField, ConfirmDialog, EmptyState, ErrorState, MarkdownField, NumberField, PageHeader, SectionCard, SelectField, Skeleton, SwitchField, TextField,
} from '@runly/ui'
import { FileQuestion, Loader2, Undo2 } from 'lucide-react'
import { LessonResourcesEditor } from '../components/lesson-editor/LessonResourcesEditor.jsx'
import { QuizQuestionsEditor } from '../components/lesson-editor/QuizQuestionsEditor.jsx'
import { PageShell, useRouteSegment } from '../components/shared.jsx'
import { useAssessment, useUpdateActivity } from '../hooks/useLmsAssessments.js'
import { DELIVERY_FILE_TYPES, activityFormToPayload, activityToForm, activityTypeLabel, assessmentPath, formatPoints, isActivityDirty, validateActivityForm } from '../lib/lmsAssessment.js'

const INT = { allowNegative: false, allowDecimal: false }
const LAYOUT_OPTIONS = [{ value: 'one', label: 'Una pregunta a la vez' }, { value: 'all', label: 'Todas en una página' }]
const TALL = '[&_.mdxeditor-root-contenteditable]:min-h-[12rem]!'

function QuizFields({ form, set, errors, readOnly }) {
  return (
    <SectionCard title="Presentación del cuestionario">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Presentación" options={LAYOUT_OPTIONS} value={form.layout} onValueChange={set('layout')} disabled={readOnly} />
          <NumberField
            label="Preguntas aleatorias por persona" value={form.drawCount} onChange={(event) => set('drawCount')(event.target.value)} error={errors.drawCount}
            min={1} max={500} {...INT} disabled={readOnly} hint="Vacío: todas las preguntas. Con un número, los puntos varían por persona."
          />
        </div>
        <SwitchField id="lms-activity-shuffle-q" label="Mezclar el orden de las preguntas" checked={form.shuffleQuestions} onChange={set('shuffleQuestions')} disabled={readOnly} />
        <SwitchField id="lms-activity-shuffle-o" label="Mezclar el orden de las opciones" checked={form.shuffleOptions} onChange={set('shuffleOptions')} disabled={readOnly} />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">El tiempo y los intentos se configuran en la evaluación. Las respuestas correctas no se muestran al participante.</p>
      </div>
    </SectionCard>
  )
}

function AssignmentFields({ form, set, errors, readOnly }) {
  return (
    <SectionCard title="Entrega y puntos">
      <div className="space-y-4">
        <SwitchField id="lms-activity-text" label="Respuesta escrita" description="La persona puede escribir su respuesta." checked={form.allowText} onChange={set('allowText')} disabled={readOnly} error={errors.allowText} />
        <SwitchField id="lms-activity-files" label="Archivos" description="La persona sube archivos; el servidor verifica su contenido real, tamaño y huella." checked={form.allowFiles} onChange={set('allowFiles')} disabled={readOnly} />
        {form.allowFiles ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Formatos admitidos</legend>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
              {DELIVERY_FILE_TYPES.map((type) => (
                <CheckboxField
                  key={type.value} id={`lms-activity-type-${type.value}`} label={type.label} disabled={readOnly}
                  checked={form.acceptedTypes.includes(type.value)}
                  onChange={(event) => set('acceptedTypes')(event.target.checked ? [...form.acceptedTypes, type.value] : form.acceptedTypes.filter((key) => key !== type.value))}
                />
              ))}
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin marcar ninguno: cualquier formato común (Office, PDF, CSV, imágenes, ZIP).</p>
          </fieldset>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {form.allowFiles ? (
            <>
              <NumberField label="Máximo de archivos" required value={form.maxFiles} onChange={(event) => set('maxFiles')(event.target.value)} error={errors.maxFiles} min={1} max={10} {...INT} disabled={readOnly} hint="De 1 a 10." />
              <NumberField label="Tamaño máximo por archivo (MB)" required value={form.maxFileMb} onChange={(event) => set('maxFileMb')(event.target.value)} error={errors.maxFileMb} min={1} max={50} {...INT} disabled={readOnly} hint="De 1 a 50 MB." />
            </>
          ) : null}
          <NumberField label="Puntos de la actividad" required value={form.maxPoints} onChange={(event) => set('maxPoints')(event.target.value)} error={errors.maxPoints} min={1} max={1000} {...INT} disabled={readOnly} hint="Se califica a mano, de 0 a este valor." />
        </div>
      </div>
    </SectionCard>
  )
}

// Activity editor: /assessments/:id/activities/:activityId.
export default function LmsAssessmentActivityEditor() {
  const navigate = useNavigate()
  const assessmentId = useRouteSegment(1), activityId = useRouteSegment(3)
  const query = useAssessment(assessmentId)
  const save = useUpdateActivity()
  const [state, setState] = useState(null) // { key, form, baseline }
  const [errors, setErrors] = useState({})
  const [questionsDirty, setQuestionsDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const assessment = query.data?.assessment
  const activity = query.data?.activities?.find((item) => item.id === activityId) ?? null
  const readOnly = assessment?.status === 'archived'

  useEffect(() => {
    if (!activity || state?.key === activity.id) return
    const form = activityToForm(activity)
    setState({ key: activity.id, form, baseline: form })
    setErrors({})
  }, [activity, state?.key])

  const form = state?.key === activityId ? state.form : null
  const formDirty = !readOnly && isActivityDirty(form, state?.baseline)
  const dirty = formDirty || (!readOnly && questionsDirty)
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const back = () => navigate(assessmentPath(assessmentId))
  const leave = () => (dirty ? setLeaving(true) : back())
  const set = (key) => (value) => setState((current) => ({ ...current, form: { ...current.form, [key]: value } }))

  async function submit() {
    const next = validateActivityForm(form)
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync({ id: activityId, ...activityFormToPayload(form) })
      setState((current) => ({ ...current, baseline: current.form }))
    } catch { /* toast shown by the mutation */ }
  }

  if (query.isLoading) return <PageShell><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96 rounded-2xl" /></PageShell>
  if (query.isError || !query.data) {
    return <PageShell><ErrorState title="No se pudo cargar la evaluación" description={query.error?.message} onRetry={() => query.refetch()} /></PageShell>
  }
  if (!activity) {
    return (
      <PageShell>
        <EmptyState icon={FileQuestion} title="La actividad no existe" description="Puede que la hayan eliminado." action={<Button variant="outline" onClick={back}>Volver a la evaluación</Button>} />
      </PageShell>
    )
  }
  if (!form) return <PageShell><Skeleton className="h-96 rounded-2xl" /></PageShell>

  const status = readOnly ? 'Solo lectura: la evaluación está archivada' : dirty ? 'Cambios sin guardar' : 'Todo guardado'
  return (
    <PageShell>
      <PageHeader
        onBack={leave} backLabel="Evaluación" eyebrow={assessment.title}
        title={form.title.trim() || activity.title}
        description={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant="outline">{activityTypeLabel({ ...activity, settings: { ...activity.settings, allowText: form.allowText, allowFiles: form.allowFiles } })}</Badge>
            <span className="tabular-nums">{formatPoints(activity.maxPoints)}</span>
            <span aria-live="polite" className="text-[hsl(var(--muted-foreground))]">{status}</span>
          </span>
        )}
        actions={!readOnly ? (
          <div className="flex items-center gap-2">
            {formDirty ? <Button variant="outline" onClick={() => { setState((current) => ({ ...current, form: current.baseline })); setErrors({}) }}><Undo2 />Descartar</Button> : null}
            <Button onClick={submit} disabled={save.isPending || !formDirty}>
              {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar
            </Button>
          </div>
        ) : null}
        collapseOnScroll sticky className="mb-2 pb-0"
      />
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <SectionCard title="Actividad">
          <div className="space-y-4">
            <TextField label="Título" required value={form.title} onChange={(event) => set('title')(event.target.value)} maxLength={200} error={errors.title} disabled={readOnly} autoComplete="off" />
            <MarkdownField
              label="Instrucciones" required={form.kind === 'assignment'} value={form.body} onChange={(event) => set('body')(event.target.value)} error={errors.body}
              maxLength={200000} disabled={readOnly} className={TALL}
              hint={form.kind === 'quiz' ? 'Opcional. Se muestran antes de las preguntas.' : 'Qué debe entregar la persona y cómo se califica.'}
            />
          </div>
        </SectionCard>
        {form.kind === 'quiz' ? <QuizFields form={form} set={set} errors={errors} readOnly={readOnly} /> : <AssignmentFields form={form} set={set} errors={errors} readOnly={readOnly} />}
        {form.kind === 'quiz' ? <QuizQuestionsEditor lessonId={activity.id} readOnly={readOnly} onDirtyChange={setQuestionsDirty} /> : null}
        <LessonResourcesEditor lessonId={activity.id} readOnly={readOnly} />
      </div>
      <ConfirmDialog
        open={leaving} onOpenChange={setLeaving} icon={Undo2} title="Descartar cambios"
        description="Esta actividad tiene cambios sin guardar. Si sales ahora, se perderán."
        confirmLabel="Descartar y salir" onConfirm={() => { setLeaving(false); back() }}
      />
    </PageShell>
  )
}
