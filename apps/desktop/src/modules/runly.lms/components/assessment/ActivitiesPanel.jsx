import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge, Button, ChoiceCardGroup, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, TextField,
} from '@runly/ui'
import { ArrowDown, ArrowUp, FileUp, ListChecks, Loader2, NotebookPen, PenLine, Plus, Trash2, Wrench } from 'lucide-react'
import { useCreateActivity, useDeleteActivity, useReorderActivities } from '../../hooks/useLmsAssessments.js'
import { ACTIVITY_TYPES, activityPath, activityTypeLabel, formatPoints, moveActivity } from '../../lib/lmsAssessment.js'

const TYPE_ICONS = { questionnaire: ListChecks, written: NotebookPen, files: FileUp, practical: Wrench }
const TYPE_OPTIONS = ACTIVITY_TYPES.map((type) => ({ ...type, icon: TYPE_ICONS[type.value] }))
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

function AddActivityDialog({ open, onOpenChange, assessmentId }) {
  const navigate = useNavigate()
  const create = useCreateActivity()
  const [type, setType] = useState('questionnaire')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setType('questionnaire'); setTitle(''); setError('') } }, [open])

  async function submit(event) {
    event.preventDefault()
    if (!title.trim()) { setError('El título es obligatorio.'); return }
    const body = type === 'questionnaire' ? null : 'Describe qué debe hacer la persona y cómo se califica.'
    try {
      const activity = await create.mutateAsync({ assessmentId, type, title: title.trim(), ...(body ? { body } : {}) })
      onOpenChange(false)
      if (activity?.id) navigate(activityPath(assessmentId, activity.id))
    } catch { /* toast shown by the mutation */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={Plus} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Agregar actividad</DialogTitle>
            <DialogDescription>Todas las actividades comparten el tiempo límite de la evaluación.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <ChoiceCardGroup options={TYPE_OPTIONS} value={type} onChange={setType} columns={2} ariaLabel="Tipo de actividad" />
            <TextField label="Título" required value={title} onChange={(event) => { setTitle(event.target.value); setError('') }} maxLength={200} error={error || undefined} placeholder="Ej. Cuestionario técnico" autoComplete="off" />
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Crear y editar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ActivityRow({ activity, index, total, readOnly, onMove, onEdit, onDelete, moving }) {
  const detail = activity.kind === 'quiz'
    ? `${activity.questionCount} ${activity.questionCount === 1 ? 'pregunta' : 'preguntas'}`
    : `${activity.resourceCount} ${activity.resourceCount === 1 ? 'material' : 'materiales'}`
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-sm font-semibold tabular-nums" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0">
          <p className="truncate font-medium">{activity.title}</p>
          <p className={`${MUTED} mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1`}>
            <Badge variant="outline">{activityTypeLabel(activity)}</Badge>
            <span className="tabular-nums">{formatPoints(activity.maxPoints)}</span>
            <span>· {detail}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 self-end sm:self-auto">
        {!readOnly ? (
          <>
            <Button variant="ghost" size="icon" aria-label={`Subir «${activity.title}»`} disabled={index === 0 || moving} onClick={() => onMove(-1)}><ArrowUp /></Button>
            <Button variant="ghost" size="icon" aria-label={`Bajar «${activity.title}»`} disabled={index === total - 1 || moving} onClick={() => onMove(1)}><ArrowDown /></Button>
            <Button variant="ghost" size="icon" aria-label={`Eliminar «${activity.title}»`} onClick={onDelete} className="text-[hsl(var(--destructive))]"><Trash2 /></Button>
          </>
        ) : null}
        <Button variant="outline" size="sm" onClick={onEdit}><PenLine />{readOnly ? 'Ver' : 'Editar'}</Button>
      </div>
    </li>
  )
}

// Activities of an evaluation: ordered list, add (type picker), move, delete.
export function ActivitiesPanel({ assessmentId, activities, readOnly }) {
  const navigate = useNavigate()
  const reorder = useReorderActivities()
  const remove = useDeleteActivity()
  const [adding, setAdding] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const ids = activities.map((activity) => activity.id)

  const move = (id, delta) => {
    const next = moveActivity(ids, id, delta)
    if (next !== ids) reorder.mutate({ assessmentId, activityIds: next })
  }
  async function confirmDelete() {
    try { await remove.mutateAsync(toDelete.id); setToDelete(null) } catch { /* toast shown */ }
  }

  return (
    <section className="space-y-3" aria-label="Actividades">
      {activities.length ? (
        <ul className="space-y-2">
          {activities.map((activity, index) => (
            <ActivityRow
              key={activity.id} activity={activity} index={index} total={activities.length} readOnly={readOnly} moving={reorder.isPending}
              onMove={(delta) => move(activity.id, delta)} onEdit={() => navigate(activityPath(assessmentId, activity.id))} onDelete={() => setToDelete(activity)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ListChecks} title="Sin actividades"
          description="Agrega un cuestionario, una entrega de archivos o una actividad práctica. Todas comparten el mismo tiempo límite."
          action={!readOnly ? <Button onClick={() => setAdding(true)}><Plus />Agregar actividad</Button> : undefined}
        />
      )}
      {activities.length && !readOnly ? <Button variant="outline" onClick={() => setAdding(true)}><Plus />Agregar actividad</Button> : null}
      <AddActivityDialog open={adding} onOpenChange={setAdding} assessmentId={assessmentId} />
      <ConfirmDialog
        open={Boolean(toDelete)} onOpenChange={(open) => { if (!open) setToDelete(null) }}
        icon={Trash2} title="Eliminar actividad"
        description={toDelete ? `«${toDelete.title}» dejará de formar parte de la evaluación. Las respuestas ya enviadas se conservan.` : ''}
        confirmLabel="Eliminar" loading={remove.isPending} onConfirm={confirmDelete}
      />
    </section>
  )
}
