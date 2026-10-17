import { useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Skeleton, SortableList, cn } from '@runly/ui'
import { ListChecks, Plus, Trash2, Undo2 } from 'lucide-react'
import { useDeleteQuestion, useQuestions, useReorderQuestions, useSaveQuestion } from '../../hooks/useLmsEval.js'
import { emptyQuestionForm, formToQuestion, questionToForm, validateQuestionForm } from '../../lib/lmsEval.js'
import { QUESTION_KIND_LABELS } from '../../lib/lmsLabels.js'
import { DragHandle } from '../curriculum/DragHandle.jsx'
import { QuestionForm } from '../QuestionForm.jsx'

// First line of a markdown prompt, without the most common markup.
const promptPreview = (prompt) => String(prompt ?? '').split('\n').find((line) => line.trim())?.replace(/[#*_`>\\]/g, '').trim() || 'Sin texto'
const pointsLabel = (points) => `${points} ${Number(points) === 1 ? 'punto' : 'puntos'}`

function QuestionRow({ question, index, selected, handleProps, isDragging, readOnly, onSelect, onDelete }) {
  return (
    <div className={cn('flex items-center gap-1 rounded-md', selected ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted)/0.6)]', isDragging && 'opacity-60')}>
      <DragHandle handleProps={readOnly ? null : handleProps} label={`Mover la pregunta ${index + 1}`} />
      <button
        type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined}
        className={cn('flex min-w-0 flex-1 items-start gap-2 rounded-md py-2 pr-2 text-left focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]', readOnly && 'pl-2')}
      >
        <span className="w-6 shrink-0 text-right text-sm tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}.</span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm', selected && 'font-medium')}>{promptPreview(question.prompt)}</span>
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{QUESTION_KIND_LABELS[question.kind] ?? question.kind} · {pointsLabel(question.points)}</span>
        </span>
      </button>
      {!readOnly ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Eliminar la pregunta ${index + 1}`} title="Eliminar pregunta" onClick={onDelete} className="text-[hsl(var(--destructive))]">
          <Trash2 />
        </Button>
      ) : null}
    </div>
  )
}

// Questions of a saved quiz lesson, edited inline on the lesson editor page:
// a drag-and-drop list on the left and the question panel on the right.
// `onDirtyChange(bool)` tells the page when the open question has unsaved edits.
export function QuizQuestionsEditor({ lessonId, readOnly = false, onDirtyChange }) {
  const questions = useQuestions(lessonId)
  const save = useSaveQuestion(), remove = useDeleteQuestion(), reorder = useReorderQuestions()
  const [editing, setEditing] = useState(null) // { id|null, form, initial }
  const [errors, setErrors] = useState({})
  const [toDelete, setToDelete] = useState(null)
  const [pending, setPending] = useState(null) // action waiting for "Descartar cambios"
  const list = questions.data ?? []
  const totalPoints = list.reduce((sum, question) => sum + (Number(question.points) || 0), 0)
  const dirty = Boolean(editing) && JSON.stringify(editing.form) !== JSON.stringify(editing.initial)

  useEffect(() => { setEditing(null); setErrors({}) }, [lessonId])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const guard = (action) => (dirty ? setPending(() => action) : action())
  const open = (id, form) => { setErrors({}); setEditing({ id, form, initial: form }) }
  const startNew = () => guard(() => open(null, emptyQuestionForm()))
  const select = (question) => { if (editing?.id !== question.id) guard(() => open(question.id, questionToForm(question))) }

  async function submit() {
    const next = validateQuestionForm(editing.form)
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync({ id: editing.id, lessonId, ...formToQuestion(editing.form) })
      setEditing(null)
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
  if (questions.isLoading) listNode = <div className="space-y-2">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-12 rounded-md" />)}</div>
  else if (questions.isError) listNode = <ErrorState title="No se pudieron cargar las preguntas" description={questions.error?.message} onRetry={() => questions.refetch()} />
  else if (!list.length) listNode = <p className="rounded-md border border-dashed border-[hsl(var(--border))] px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">El examen aún no tiene preguntas.</p>
  else {
    listNode = (
      <div role="list" aria-label="Preguntas del examen" className="space-y-0.5">
        <SortableList
          items={list}
          onReorder={(next) => { if (!readOnly) reorder.mutate({ lessonId, questionIds: next.map((question) => question.id) }) }}
          renderItem={(question, { dragHandleProps, isDragging }) => (
            <div role="listitem">
              <QuestionRow
                question={question} index={list.indexOf(question)} selected={editing?.id === question.id} readOnly={readOnly}
                handleProps={dragHandleProps} isDragging={isDragging}
                onSelect={() => select(question)} onDelete={() => setToDelete(question)}
              />
            </div>
          )}
        />
      </div>
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="min-w-0">{listNode}</div>
        <div className="min-w-0 rounded-xl border border-[hsl(var(--border))]">
          {editing ? (
            <>
              <div className="border-b border-[hsl(var(--border))] px-4 py-3">
                <p className="text-sm font-semibold">{editing.id ? `Pregunta ${list.findIndex((q) => q.id === editing.id) + 1}` : 'Nueva pregunta'}</p>
              </div>
              <div className="px-4 py-4">
                <QuestionForm key={editing.id ?? 'new'} form={editing.form} onChange={(form) => setEditing((current) => ({ ...current, form }))} errors={errors} />
              </div>
              {!readOnly ? (
                <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-4 py-3">
                  <Button type="button" variant="outline" onClick={() => guard(() => setEditing(null))}>Cancelar</Button>
                  <Button type="button" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : editing.id ? 'Guardar pregunta' : 'Agregar pregunta'}</Button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={ListChecks} title={list.length ? 'Elige una pregunta' : 'Agrega la primera pregunta'}
              description="Opción única, opción múltiple, verdadero o falso, o respuesta abierta."
              action={!readOnly ? <Button type="button" onClick={startNew}><Plus />Nueva pregunta</Button> : null}
            />
          )}
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
