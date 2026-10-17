import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, StarRating, TextareaField,
} from '@runly/ui'
import { Loader2, MessageSquareReply } from 'lucide-react'

// Instructor reply to a review (one per review, editable).
export function ReviewReplyDialog({ open, onOpenChange, review, onSubmit, pending }) {
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setReply(review?.replyBody ?? ''); setError('') } }, [open, review])

  async function submit(event) {
    event.preventDefault()
    const value = reply.trim()
    if (!value) { setError('Escribe la respuesta.'); return }
    await onSubmit(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={MessageSquareReply} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>{review?.replyBody ? 'Editar respuesta' : 'Responder reseña'}</DialogTitle>
            <DialogDescription>La respuesta se muestra debajo de la reseña y se avisa a quien la escribió.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {review ? (
              <div className="space-y-1 rounded-md bg-[hsl(var(--muted))] p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{review.learner?.displayName ?? 'Alumno'}</span>
                  <StarRating value={review.rating} size="xs" />
                </div>
                {review.body?.trim() ? <p className="whitespace-pre-line">{review.body}</p> : <p className="italic text-[hsl(var(--muted-foreground))]">Sin comentario.</p>}
              </div>
            ) : null}
            <TextareaField
              label="Respuesta" required value={reply} onChange={(event) => { setReply(event.target.value); setError('') }} rows={5} maxLength={2000}
              error={error || undefined} placeholder="Gracias por tu opinión…"
            />
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              Guardar respuesta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
