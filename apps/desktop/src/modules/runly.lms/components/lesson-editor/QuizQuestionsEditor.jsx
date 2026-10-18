import { useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Skeleton, SortableList, cn } from '@runly/ui'
import { Eye, EyeOff, ListChecks, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useDeleteQuestion, useQuestions, useReorderQuestions, useSaveQuestion } from '../../hooks/useLmsEval.js'
import { emptyQuestionForm, formToQuestion, promptPreview, questionToForm, validateQuestionForm } from '../../lib/lmsQuestionForm.js'
import { QuestionForm } from '../QuestionForm.jsx'
import { QuestionCard } from '../quiz-builder/QuestionCard.jsx'
import { QuestionPreview } from '../quiz-builder/QuestionPreview.jsx'
import { QuestionTypePicker } from '../quiz-builder/QuestionTypePicker.jsx'

const PREVIEW_KEY = 'runly.lms.questionPreview'
const pointsLabel = (points) => `${points} ${Number(points) === 1 ? 'punto' : 'puntos'}`
const readPreview = () => { try { return localStorage.getItem(PREVIEW_KEY) !== '0' } catch { return true } }
const writePreview = (value) => { try { localStorage.setItem(PREVIEW_KEY, value ? '1' : '0') } catch { /* storage unavailable */ } }

// Copy of a question for "Duplicar": same content, new option ids.
function duplicateBody(question) {
  const body = formToQuestion(questionToForm(question))
  return { ...body, options: body.options.map(({ id: _id, ...rest }) => rest) }
}

// Questions of a saved quiz lesson, edited inline on the lesson editor page:
// a drag-and-drop list of cards and a sticky panel with the type picker, the
// question form and the "Vista del alumno" preview. `onDirtyChange(bool)` tells
// the page when the open question has unsaved edits.
export function QuizQuestionsEditor({ lessonId, readOnly = false, onDirtyChange }) {
  const questions = useQuestions(lessonId)
  const save = useSaveQuestion(), remove = useDeleteQuestion(), reorder = useReorderQuestions()
  const [editing, setEditing] = useState(null) // { id|null, form, initial } | { picking: true }
  const [errors, setErrors] = useState({})
  const [toDelete, setToDelete] = useState(null)
  const [pending, setPending] = useState(null) // action waiting for "Descartar cambios"
  const [preview, setPreview] = useState(readPreview)
  const list = questions.data ?? []
  const totalPoints = list.reduce((sum, question) => sum + (Number(question.points) || 0), 0)
  const dirty = Boolean(editing?.form) && JSON.stringify(editing.form) !== JSON.stringify(editing.initial)

  useEffect(() => { setEditing(null); setErrors({}) }, [lessonId])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const guard = (action) => (dirty ? setPending(() => action) : action())
  const open = (id, form) => { setErrors({}); setEditing({ id, form, initial: form }) }
  const startNew = () => guard(() => { setErrors({}); setEditing({ picking: true }) })
  const pick = (kind) => { const form = emptyQuestionForm(kind); setEditing({ id: null, form, initial: form }) }
  const select = (question) => { if (editing?.id !== question.id) guard(() => open(question.id, questionToForm(question))) }
  const togglePreview = () => setPreview((value) => { writePreview(!value); return !value })

  async function submit() {
    const next = validateQuestionForm(editing.form)
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync({ id: editing.id, lessonId, ...formToQuestion(editing.form) })
      setEditing(null)
    } catch { /* toast shown by the mutation */ }
  }

  // The copy lands right after the original.
  async function duplicate(question) {
    try {
      const copy = await save.mutateAsync({ lessonId, ...duplicateBody(question) })
      const ids = list.map((item) => item.id)
      ids.splice(ids.indexOf(question.id) + 1, 0, copy.id)
      if (copy?.id) reorder.mutate({ lessonId, questionIds: ids })
    } catch { /* toast shown by the mutation */ }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(toDelete.id)
      if (editing?.id === toDelete.id) setEditing(null)
      setToDelete(null)
    } catch { /* toast shown by the mutation */ }
  }

  let listNode
  if (questions.isLoading) listNode = <div className="space-y-2">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-16 rounded-md" />)}</div>
  else if (questions.isError) listNode = <ErrorState title="No se pudieron cargar las preguntas" description={questions.error?.message} onRetry={() => questions.refetch()} />
  else if (!list.length) listNode = <p className="rounded-md border border-dashed border-[hsl(var(--border))] px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">El examen aún no tiene preguntas.</p>
  else {
    listNode = (
      <div role="list" aria-label="Preguntas del examen" className="space-y-1.5">
        <SortableList
          items={list} disabled={readOnly} labelOf={(question) => promptPreview(question.prompt)}
          onReorder={(next) => reorder.mutate({ lessonId, questionIds: next.map((question) => question.id) })}
          renderItem={(question, { dragHandleProps, isDragging, index }) => (
            <div role="listitem">
              <QuestionCard
                question={question} index={index} selected={editing?.id === question.id} readOnly={readOnly} busy={save.isPending}
                handleProps={dragHandleProps} isDragging={isDragging}
                onSelect={() => select(question)} onDuplicate={() => duplicate(question)} onDelete={() => setToDelete(question)}
              />
            </div>
          )}
        />
      </div>
    )
  }

  const index = editing?.id ? list.findIndex((q) => q.id === editing.id) : list.length
  let panel
  if (editing?.picking) {
    panel = (
      <>
        <PanelHeader title="Nueva pregunta" onClose={() => setEditing(null)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4"><QuestionTypePicker value={null} onChange={pick} /></div>
      </>
    )
  } else if (editing) {
    panel = (
      <>
        <PanelHeader
          title={editing.id ? `Pregunta ${index + 1}` : 'Nueva pregunta'} onClose={() => guard(() => setEditing(null))}
          action={(
            <Button type="button" variant="ghost" size="sm" aria-pressed={preview} onClick={togglePreview}>
              {preview ? <EyeOff /> : <Eye />}{preview ? 'Ocultar vista del alumno' : 'Vista del alumno'}
            </Button>
          )}
        />
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4', preview && '2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] 2xl:gap-5')}>
          <QuestionForm key={editing.id ?? 'new'} form={editing.form} onChange={(form) => setEditing((current) => ({ ...current, form }))} errors={errors} disabled={readOnly} />
          {preview ? (
            <div className="mt-5 border-t border-[hsl(var(--border))] pt-4 2xl:mt-0 2xl:border-l 2xl:border-t-0 2xl:pl-5 2xl:pt-0">
              <p className="mb-2 text-sm font-semibold">Vista del alumno</p>
              <QuestionPreview form={editing.form} index={index} />
            </div>
          ) : null}
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-[hsl(var(--border))] px-4 py-3">
            <Button type="button" variant="outline" onClick={() => guard(() => setEditing(null))}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : editing.id ? 'Guardar pregunta' : 'Agregar pregunta'}</Button>
          </div>
        ) : null}
      </>
    )
  } else {
    panel = (
      <EmptyState
        icon={ListChecks} title={list.length ? 'Elige una pregunta para editarla' : 'Agrega la primera pregunta'}
        description="Opción única o múltiple, verdadero o falso, respuesta corta o numérica, completar espacios, ordenar, relacionar columnas o respuesta abierta."
        action={!readOnly ? <Button type="button" onClick={startNew}><Plus />Nueva pregunta</Button> : null}
      />
    )
  }

  return (
    <section className="space-y-3 border-t border-[hsl(var(--border))] pt-5" aria-labelledby="lms-quiz-questions">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 id="lms-quiz-questions" className="text-sm font-semibold">Preguntas</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {list.length} {list.length === 1 ? 'pregunta' : 'preguntas'} · {pointsLabel(totalPoints)}{!readOnly && list.length > 1 ? ' · Arrastra para cambiar el orden' : ''}
          </p>
        </div>
        {!readOnly ? <Button type="button" variant="outline" size="sm" onClick={startNew}><Plus />Nueva pregunta</Button> : null}
      </div>
      {list.some((question) => question.kind === 'open') ? <Badge variant="secondary">Las respuestas abiertas se califican a mano desde Revisión.</Badge> : null}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="min-w-0">{listNode}</div>
        <div className="flex min-w-0 flex-col rounded-md border border-[hsl(var(--border))] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]">
          {panel}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(toDelete)} onOpenChange={(value) => { if (!value) setToDelete(null) }}
        icon={Trash2} title="Eliminar pregunta"
        description={`Se eliminará «${promptPreview(toDelete?.prompt)}». Los intentos ya enviados conservan su calificación.`}
        confirmLabel="Eliminar" loading={remove.isPending} onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={Boolean(pending)} onOpenChange={(value) => { if (!value) setPending(null) }}
        icon={Undo2} title="Descartar cambios"
        description="La pregunta abierta tiene cambios sin guardar. Si continúas, se perderán."
        confirmLabel="Descartar" onConfirm={() => { const action = pending; setPending(null); action?.() }}
      />
    </section>
  )
}

function PanelHeader({ title, action, onClose }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-2.5">
      <p className="min-w-0 flex-1 text-sm font-semibold">{title}</p>
      {action}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" title="Cerrar" onClick={onClose}><X /></Button>
    </div>
  )
}
