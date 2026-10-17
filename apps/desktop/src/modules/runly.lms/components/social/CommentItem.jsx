import { useState } from 'react'
import {
  Badge, Button, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  MarkdownViewer, PersonAvatar, TextareaField, cn,
} from '@runly/ui'
import { CheckCircle2, CircleDot, Loader2, MessageSquareReply, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useDeleteComment, useUpdateComment } from '../../hooks/useLmsSocial.js'
import { relativeTime } from '../../lib/lmsLabels.js'

export const COMMENT_MAX = 5000
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Inline body editor shared by edit and reply boxes.
export function CommentEditor({ value, onChange, onCancel, onSubmit, pending, submitLabel, label, placeholder, autoFocus = false }) {
  const empty = !value.trim()
  return (
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (!empty) onSubmit() }}>
      <TextareaField label={label} value={value} onChange={(event) => onChange(event.target.value)} rows={3} maxLength={COMMENT_MAX} placeholder={placeholder} autoFocus={autoFocus} />
      <div className="flex justify-end gap-2">
        {onCancel ? <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button> : null}
        <Button type="submit" size="sm" disabled={empty || pending}>
          {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

// One question or reply. `root` is set on replies (reply actions target the root).
// `canModerate` = lms.course.manage (pin, resolve, delete any).
export function CommentItem({ comment, isReply = false, canModerate = false, readOnly = false, onReply }) {
  const update = useUpdateComment(), flag = useUpdateComment()
  const remove = useDeleteComment()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleted = comment.deleted || comment.body === null
  const author = comment.author ?? {}
  // The root author may resolve their own question (canEdit marks authorship).
  const canResolve = !isReply && (canModerate || comment.canEdit)
  const canPin = !isReply && canModerate
  const canEdit = comment.canEdit && !readOnly
  const canDelete = comment.canDelete && !readOnly
  const hasMenu = !deleted && !readOnly && (canEdit || canDelete || canPin || canResolve)

  async function saveEdit() {
    try {
      await update.mutateAsync({ id: comment.id, body: draft.trim() })
      setEditing(false)
    } catch { /* toast shown */ }
  }

  async function doDelete() {
    try {
      await remove.mutateAsync(comment.id)
      setConfirmDelete(false)
    } catch { /* toast shown */ }
  }

  const setFlag = (data) => flag.mutate({ id: comment.id, ...data })

  return (
    <div className={cn('flex gap-3', isReply && 'pt-3')}>
      <PersonAvatar name={deleted ? '' : author.displayName} src={deleted ? null : author.avatarUrl} size={isReply ? 'sm' : 'md'} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{deleted ? 'Comentario eliminado' : (author.displayName || 'Alumno')}</span>
          {!deleted && comment.isInstructor ? <Badge variant="secondary" className="bg-violet-600/10 text-violet-700 dark:text-violet-300">Instructor</Badge> : null}
          {!isReply && comment.pinned ? <Badge variant="outline"><Pin className="h-3 w-3" aria-hidden="true" />Fijada</Badge> : null}
          {!isReply && comment.resolved ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Resuelta</Badge> : null}
          <span className={MUTED} title={comment.createdAt ? new Date(comment.createdAt).toLocaleString('es-MX') : undefined}>
            {relativeTime(comment.createdAt)}{comment.editedAt && !deleted ? ' · editado' : ''}
          </span>
          {hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Acciones del comentario"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? <DropdownMenuItem onSelect={() => { setDraft(comment.body ?? ''); setEditing(true) }}><Pencil />Editar</DropdownMenuItem> : null}
                {canResolve ? (
                  <DropdownMenuItem disabled={flag.isPending} onSelect={() => setFlag({ resolved: !comment.resolved })}>
                    {comment.resolved ? <><CircleDot />Reabrir pregunta</> : <><CheckCircle2 />Marcar como resuelta</>}
                  </DropdownMenuItem>
                ) : null}
                {canPin ? (
                  <DropdownMenuItem disabled={flag.isPending} onSelect={() => setFlag({ pinned: !comment.pinned })}>
                    {comment.pinned ? <><PinOff />Desfijar</> : <><Pin />Fijar arriba</>}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-[hsl(var(--destructive))]"><Trash2 />Eliminar</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {deleted ? (
          <p className="text-sm italic text-[hsl(var(--muted-foreground))]">Este comentario fue eliminado.</p>
        ) : editing ? (
          <CommentEditor
            label="Editar comentario" value={draft} onChange={setDraft} autoFocus
            onCancel={() => setEditing(false)} onSubmit={saveEdit} pending={update.isPending} submitLabel="Guardar"
          />
        ) : (
          <MarkdownViewer value={comment.body} className="text-sm" />
        )}

        {!deleted && !editing && !readOnly && onReply ? (
          <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs" onClick={onReply}><MessageSquareReply />Responder</Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        icon={Trash2}
        title={isReply ? 'Eliminar respuesta' : 'Eliminar pregunta'}
        description={!isReply && comment.replies?.length
          ? 'La pregunta se mostrará como «Comentario eliminado» y sus respuestas se conservan.'
          : 'El comentario se eliminará de la conversación.'}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={doDelete}
      />
    </div>
  )
}
