import { useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, SegmentedControl, Skeleton, SortableList, cn } from '@runly/ui'
import { ChevronDown, ListChecks, Plus, Trash2, Undo2, X } from 'lucide-react'
import { useDeleteQuestion, useQuestions, useReorderQuestions, useSaveQuestion } from '../../hooks/useLmsEval.js'
import { emptyQuestionForm, formToQuestion, promptPreview, questionToForm, validateQuestionForm } from '../../lib/lmsQuestionForm.js'
import { QuestionForm } from '../QuestionForm.jsx'
import { QuestionCard } from '../quiz-builder/QuestionCard.jsx'
import { QuestionPreview } from '../quiz-builder/QuestionPreview.jsx'
import { QuestionTypePicker } from '../quiz-builder/QuestionTypePicker.jsx'

const pointsLabel = (points) => `${points} ${Number(points) === 1 ? 'punto' : 'puntos'}`
const VIEW_OPTIONS = [{ value: 'edit', label: 'Editar' }, { value: 'preview', label: 'Vista del alumno' }]

// Copy of a question for "Duplicar": same content, new option ids.
function duplicateBody(question) {
  const body = formToQuestion(questionToForm(question))
  return { ...body, options: body.options.map(({ id: _id, ...rest }) => rest) }
}

// Questions of a saved quiz lesson, edited inline on the lesson editor page:
// a drag-and-drop list of cards and a sticky panel with the type picker and the
// question form, with an "Editar / Vista del alumno" toggle. Layout follows the
// section's own width (container queries), not the viewport: the page also has
// the curriculum sidebar. Wide: compact list column + editor. Narrow: the list
// stacks above the editor and collapses while a question is open.
// `onDirtyChange(bool)` tells the page when the open question has unsaved edits.
export function QuizQuestionsEditor({ lessonId, readOnly = false, onDirtyChange }) {
  const questions = useQuestions(lessonId)
  const save = useSaveQuestion(), remove = useDeleteQuestion(), reorder = useReorderQuestions()
  const [editing, setEditing] = useState(null) // { id|null, form, initial } | { picking: true }
  const [errors, setErrors] = useState({})
  const [toDelete, setToDelete] = useState(null)
  const [pending, setPending] = useState(null) // action waiting for "Descartar cambios"
  const [view, setView] = useState('edit') // 'edit' | 'preview'
  const [listOpen, setListOpen] = useState(true) // only matters when stacked
  const list = questions.data ?? []
  const totalPoints = list.reduce((sum, question) => sum + (Number(question.points) || 0), 0)
  const dirty = Boolean(editing?.form) && JSON.stringify(editing.form) !== JSON.stringify(editing.initial)

  useEffect(() => { setEditing(null); setErrors({}) }, [lessonId])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const guard = (action) => (dirty ? setPending(() => action) : action())
  const open = (id, form) => { setErrors({}); setView('edit'); setListOpen(false); setEditing({ id, form, initial: form }) }
  const startNew = () => guard(() => { setErrors({}); setListOpen(false); setEditing({ picking: true }) })
  const pick = (kind) => { const form = emptyQuestionForm(kind); setView('edit'); setEditing({ id: null, form, initial: form }) }
  const select = (question) => { if (editing?.id !== question.id) guard(() => open(question.id, questionToForm(question))) }
  const close = () => guard(() => { setEditing(null); setListOpen(true) })

  async function submit() {
    const next = validateQuestionForm(editing.form)
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync({ id: editing.id, lessonId, ...formToQuestion(editing.form) })
      setEditing(null)
      setListOpen(true)
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
      if (editing?.id === toDelete.id) { setEditing(null); setListOpen(true) }
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
        <PanelHeader title="Nueva pregunta" onClose={() => { setEditing(null); setListOpen(true) }} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4"><QuestionTypePicker value={null} onChange={pick} /></div>
      </>
    )
  } else if (editing) {
    panel = (
      <>
        <PanelHeader
          title={editing.id ? `Pregunta ${index + 1}` : 'Nueva pregunta'} onClose={close}
        />
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-4 py-2">
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="Modo del editor" className="w-full @md:w-80" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* The form stays mounted while previewing so its local state survives. */}
          <div hidden={view !== 'edit'}>
            <QuestionForm key={editing.id ?? 'new'} form={editing.form} onChange={(form) => setEditing((current) => ({ ...current, form }))} errors={errors} disabled={readOnly} />
          </div>
          {view === 'preview' ? <QuestionPreview form={editing.form} index={index} /> : null}
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[hsl(var(--border))] px-4 py-3">
            <Button type="button" variant="outline" onClick={close}>Cancelar</Button>
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
    <section className="@container space-y-3 border-t border-[hsl(var(--border))] pt-5" aria-labelledby="lms-quiz-questions">
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
      <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[17.5rem_minmax(0,1fr)] @6xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-w-0">
          {editing ? (
            <button
              type="button" onClick={() => setListOpen((value) => !value)} aria-expanded={listOpen}
              className="flex min-h-10 w-full items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 text-sm font-medium hover:bg-[hsl(var(--muted)/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] @4xl:hidden"
            >
              <span className="min-w-0 flex-1 text-left">{listOpen ? 'Ocultar preguntas' : `Ver preguntas (${list.length})`}</span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', listOpen && 'rotate-180')} aria-hidden="true" />
            </button>
          ) : null}
          <div className={cn(editing && 'mt-2 @4xl:mt-0', editing && !listOpen && 'hidden @4xl:block')}>{listNode}</div>
        </div>
        <div className="@container flex min-w-0 flex-col rounded-md border border-[hsl(var(--border))] @4xl:sticky @4xl:top-4 @4xl:max-h-[calc(100dvh-2rem)]">
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

function PanelHeader({ title, onClose }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-2.5">
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar" title="Cerrar" onClick={onClose}><X /></Button>
    </div>
  )
}
