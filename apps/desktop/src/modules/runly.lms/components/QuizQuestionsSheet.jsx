import { useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { useDeleteQuestion, useQuestions, useReorderQuestions, useSaveQuestion } from '../hooks/useLmsEval.js'
import { emptyQuestionForm, formToQuestion, questionToForm, validateQuestionForm } from '../lib/lmsEval.js'
import { QUESTION_KIND_LABELS } from '../lib/lmsLabels.js'
import { QuestionForm } from './QuestionForm.jsx'
import { FormSheet } from './shared.jsx'

// First line of a markdown prompt, without the most common markup.
const promptPreview = (prompt) => String(prompt ?? '').split('\n').find((line) => line.trim())?.replace(/[#*_`>]/g, '').trim() || 'Sin texto'

function QuestionRow({ question, index, total, busy, onMove, onEdit, onDelete }) {
  const meta = [QUESTION_KIND_LABELS[question.kind] ?? question.kind, `${question.points} ${question.points === 1 ? 'punto' : 'puntos'}`].join(' · ')
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-[hsl(var(--muted)/0.6)]">
      <span className="w-6 shrink-0 text-right text-sm tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}.</span>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 cursor-pointer text-left">
        <span className="block truncate text-sm font-medium">{promptPreview(question.prompt)}</span>
        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{meta}</span>
      </button>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon-sm" aria-label="Subir" title="Subir" onClick={() => onMove(-1)} disabled={index === 0 || busy}><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Bajar" title="Bajar" onClick={() => onMove(1)} disabled={index === total - 1 || busy}><ArrowDown /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Editar pregunta" title="Editar pregunta" onClick={onEdit}><Pencil /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Eliminar pregunta" title="Eliminar pregunta" onClick={onDelete} className="text-[hsl(var(--destructive))]"><Trash2 /></Button>
      </div>
    </li>
  )
}

// Wide sheet with the questions of a quiz lesson. Two modes share the fixed
// header: the list (reorder / delete) and the question form.
export function QuizQuestionsSheet({ open, onOpenChange, lesson }) {
  const lessonId = lesson?.id
  const questions = useQuestions(lessonId, { enabled: open })
  const save = useSaveQuestion(), remove = useDeleteQuestion(), reorder = useReorderQuestions()
  const [editing, setEditing] = useState(null) // { id|null, form }
  const [errors, setErrors] = useState({})
  const [toDelete, setToDelete] = useState(null)
  useEffect(() => { if (open) { setEditing(null); setErrors({}) } }, [open, lessonId])

  const list = questions.data ?? []
  const totalPoints = list.reduce((sum, question) => sum + (Number(question.points) || 0), 0)

  function move(index, delta) {
    const ids = list.map((question) => question.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate({ lessonId, questionIds: ids })
  }

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
      setToDelete(null)
    } catch { /* toast shown by the mutation */ }
  }

  const startNew = () => { setErrors({}); setEditing({ id: null, form: emptyQuestionForm() }) }
  const startEdit = (question) => { setErrors({}); setEditing({ id: question.id, form: questionToForm(question) }) }

  const footer = editing ? (
    <>
      <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
      <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : editing.id ? 'Guardar pregunta' : 'Agregar pregunta'}</Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
      <Button onClick={startNew} disabled={!lessonId}><Plus />Nueva pregunta</Button>
    </>
  )

  return (
    <FormSheet
      wide open={open} onOpenChange={onOpenChange} footer={footer}
      title={editing ? (editing.id ? 'Editar pregunta' : 'Nueva pregunta') : 'Preguntas del examen'}
      description={editing ? lesson?.title : `${lesson?.title ?? 'Examen'} · ${list.length} ${list.length === 1 ? 'pregunta' : 'preguntas'} · ${totalPoints} ${totalPoints === 1 ? 'punto' : 'puntos'}`}
    >
      {editing ? (
        <QuestionForm form={editing.form} onChange={(form) => setEditing((current) => ({ ...current, form }))} errors={errors} />
      ) : questions.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-12 rounded-md" />)}</div>
      ) : questions.isError ? (
        <ErrorState title="No se pudieron cargar las preguntas" description={questions.error?.message} onRetry={() => questions.refetch()} />
      ) : !list.length ? (
        <EmptyState
          icon={ListChecks} title="El examen aún no tiene preguntas"
          description="Agrega preguntas de opción única, opción múltiple, verdadero o falso, o respuesta abierta."
          action={<Button onClick={startNew}><Plus />Nueva pregunta</Button>}
        />
      ) : (
        <>
          {list.some((question) => question.kind === 'open') ? (
            <Badge variant="secondary">Las respuestas abiertas se califican a mano desde Revisión.</Badge>
          ) : null}
          <ul className="space-y-0.5">
            {list.map((question, index) => (
              <QuestionRow
                key={question.id} question={question} index={index} total={list.length} busy={reorder.isPending}
                onMove={(delta) => move(index, delta)} onEdit={() => startEdit(question)} onDelete={() => setToDelete(question)}
              />
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={Boolean(toDelete)} onOpenChange={(value) => { if (!value) setToDelete(null) }}
        icon={Trash2}
        title="Eliminar pregunta"
        description={`Se eliminará «${promptPreview(toDelete?.prompt)}». Los intentos ya enviados conservan su calificación.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </FormSheet>
  )
}
