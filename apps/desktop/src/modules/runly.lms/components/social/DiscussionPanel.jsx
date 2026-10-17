import { useState } from 'react'
import { Alert, AlertDescription, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { MessagesSquare } from 'lucide-react'
import { useLmsPermissions } from '../../hooks/useLmsData.js'
import { useCreateComment } from '../../hooks/useLmsSocial.js'
import { CommentEditor, CommentItem } from './CommentItem.jsx'

function Thread({ root, lessonId, canModerate, readOnly }) {
  const create = useCreateComment()
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const openReply = () => setReplying(true)

  async function sendReply() {
    try {
      // Replies always hang from the root: the server keeps threads one level deep.
      await create.mutateAsync({ lessonId, body: draft.trim(), parentId: root.id })
      setDraft('')
      setReplying(false)
    } catch { /* toast shown */ }
  }

  return (
    <li className="rounded-xl border border-[hsl(var(--border))] p-4">
      <CommentItem comment={root} canModerate={canModerate} readOnly={readOnly} onReply={openReply} />
      {root.replies?.length || replying ? (
        <div className="ml-6 mt-3 border-l border-[hsl(var(--border))] pl-4 sm:ml-12">
          <ul className="space-y-0">
            {(root.replies ?? []).map((reply) => (
              <li key={reply.id}>
                <CommentItem comment={reply} isReply canModerate={canModerate} readOnly={readOnly} onReply={root.deleted ? undefined : openReply} />
              </li>
            ))}
          </ul>
          {replying ? (
            <div className="pt-3">
              <CommentEditor
                label="Tu respuesta" value={draft} onChange={setDraft} autoFocus placeholder="Escribe una respuesta…"
                onCancel={() => { setReplying(false); setDraft('') }} onSubmit={sendReply} pending={create.isPending} submitLabel="Responder"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

// "Preguntas" tab of the player: composer plus threads (pinned first, newest first).
// `query` is the useComments result (the tab label shares it for the count).
export function DiscussionPanel({ lessonId, query, readOnly = false }) {
  const { canManageCourses } = useLmsPermissions()
  const create = useCreateComment()
  const [draft, setDraft] = useState('')
  const roots = query.data ?? []

  async function ask() {
    try {
      await create.mutateAsync({ lessonId, body: draft.trim() })
      setDraft('')
    } catch { /* toast shown */ }
  }

  return (
    <section className="space-y-4" aria-label="Preguntas de la lección">
      {readOnly ? (
        <Alert><AlertDescription>Ya no estás inscrito en este curso: puedes leer la conversación, pero no publicar.</AlertDescription></Alert>
      ) : (
        <CommentEditor
          label="Haz una pregunta" value={draft} onChange={setDraft} placeholder="¿Qué duda tienes sobre esta lección?"
          onSubmit={ask} pending={create.isPending} submitLabel="Publicar pregunta"
        />
      )}
      {query.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
      ) : query.isError ? (
        <ErrorState title="No se pudieron cargar las preguntas" description={query.error?.message} onRetry={() => query.refetch()} />
      ) : !roots.length ? (
        <EmptyState icon={MessagesSquare} title="Aún no hay preguntas" description="Si algo de la lección no quedó claro, pregunta aquí. El instructor y tus compañeros pueden responder." />
      ) : (
        <ul className="space-y-3">
          {roots.map((root) => <Thread key={root.id} root={root} lessonId={lessonId} canModerate={canManageCourses} readOnly={readOnly} />)}
        </ul>
      )}
    </section>
  )
}
