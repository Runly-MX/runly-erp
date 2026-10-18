import { useState } from 'react'
import { Alert, AlertDescription, Badge, Button, ErrorState, FieldWrapper, FileCard, FileUploader, Skeleton, TextareaField } from '@runly/ui'
import { CalendarClock, Loader2, Send } from 'lucide-react'
import { useAssignmentApi, useSubmissions, useSubmitAssignment } from '../../hooks/useLmsEval.js'
import { uploadSubmissionFile } from '../../lib/directUpload.js'
import { ASSIGNMENT_DEFAULTS, SUBMISSION_ACCEPT, SUBMISSION_MAX_MB } from '../../lib/lmsEval.js'
import { dueLabel } from '../../lib/lmsLabels.js'
import { SubmissionCard } from './SubmissionCard.jsx'

const STAGE_LABELS = { uploading: 'Subiendo archivo…', confirming: 'Verificando archivo…' }

function SubmissionForm({ settings, courseId, lessonId, resubmit }) {
  const api = useAssignmentApi()
  const submit = useSubmitAssignment(courseId, lessonId)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [stage, setStage] = useState(null)
  const [error, setError] = useState('')
  const maxFiles = settings.maxFiles ?? ASSIGNMENT_DEFAULTS.maxFiles
  const slots = maxFiles - files.length

  async function uploadMany(selected) {
    if (selected.length > slots) throw new Error(slots > 0 ? `Puedes adjuntar ${slots} ${slots === 1 ? 'archivo más' : 'archivos más'}.` : 'Ya adjuntaste el máximo de archivos.')
    const uploaded = []
    try {
      // Internal learners and share-link guests upload through their own presign/confirm pair.
      for (const file of selected) {
        uploaded.push(await uploadSubmissionFile(file, null, { onStage: setStage, presign: (data) => api.presignUpload(data), confirm: (fileId) => api.confirmUpload(fileId) }))
      }
    } finally { setStage(null) }
    return uploaded
  }

  async function send() {
    const body = settings.allowText ? text.trim() : ''
    if (!body && !files.length) {
      setError(settings.allowText && settings.allowFiles ? 'Escribe tu respuesta o adjunta al menos un archivo.' : settings.allowText ? 'Escribe tu respuesta.' : 'Adjunta al menos un archivo.')
      return
    }
    setError('')
    try {
      await submit.mutateAsync({ text: body || null, fileIds: files.map((file) => file.fileId) })
      setText('')
      setFiles([])
    } catch { /* toast shown by the mutation */ }
  }

  const uploading = Boolean(stage)
  return (
    <section className="space-y-4 rounded-md border border-[hsl(var(--border))] p-4">
      <h3 className="text-base font-semibold">{resubmit ? 'Enviar de nuevo' : 'Tu entrega'}</h3>
      {settings.allowText ? (
        <TextareaField label="Respuesta" value={text} onChange={(event) => setText(event.target.value)} rows={8} maxLength={20000} placeholder="Escribe tu entrega…" />
      ) : null}
      {settings.allowFiles ? (
        <FieldWrapper label={`Archivos (${files.length} de ${maxFiles})`} hint={stage ? STAGE_LABELS[stage] : undefined}>
          <div className="space-y-2">
            {files.map((file) => (
              <FileCard
                key={file.fileId} name={file.fileName} mimeType={file.mimeType} sizeBytes={file.sizeBytes}
                onRemove={uploading || submit.isPending ? null : () => setFiles((current) => current.filter((item) => item.fileId !== file.fileId))}
              />
            ))}
            {slots > 0 ? (
              <FileUploader
                multiple accept={SUBMISSION_ACCEPT} maxSizeMB={SUBMISSION_MAX_MB} disabled={submit.isPending}
                onUploadMany={uploadMany} onChange={(uploaded) => setFiles((current) => [...current, ...(uploaded ?? [])])}
                hint="PDF, imágenes, documentos de Office, audio, video o ZIP." emptyLabel="Adjuntar archivos"
              />
            ) : null}
          </div>
        </FieldWrapper>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
      <div className="flex justify-end">
        <Button onClick={send} disabled={submit.isPending || uploading}>
          {submit.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}Enviar entrega
        </Button>
      </div>
    </section>
  )
}

// Assignment lesson in the player: due date, submission form (when the latest
// one was returned or there is none) and the history, newest first.
export function AssignmentLesson({ lessonId, courseId }) {
  const query = useSubmissions(lessonId)

  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-1/2 rounded-md" /><Skeleton className="h-48 rounded-md" /></div>
  if (query.isError) return <ErrorState title="No se pudo cargar la tarea" description={query.error?.message} onRetry={() => query.refetch()} />
  const data = query.data ?? {}
  const settings = { ...ASSIGNMENT_DEFAULTS, ...(data.settings ?? {}) }
  const submissions = data.submissions ?? []
  const latest = submissions[0] ?? null
  const due = dueLabel({ status: 'active', dueAt: data.dueAt })
  const canSubmit = !latest || latest.status === 'returned'
  return (
    <div className="space-y-4">
      {due ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <Badge variant={due === 'Vencido' ? 'destructive' : 'secondary'}>{due === 'Vencido' ? 'Fecha de entrega vencida' : `Entrega: ${due.toLowerCase()}`}</Badge>
          {due === 'Vencido' && canSubmit ? <span className="text-[hsl(var(--muted-foreground))]">Aún puedes entregar; se marcará como tardía.</span> : null}
        </div>
      ) : null}
      {settings.passingScore !== null && settings.passingScore !== undefined ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Se califica de 0 a 100. Para aprobar necesitas al menos {settings.passingScore}.</p>
      ) : null}
      {latest?.status === 'submitted' ? <Alert><AlertDescription>Tu entrega está en revisión. Te avisaremos cuando el instructor la califique.</AlertDescription></Alert> : null}
      {latest?.status === 'approved' ? <Alert><AlertDescription>Tarea aprobada. ¡Buen trabajo!</AlertDescription></Alert> : null}
      {latest?.status === 'returned' ? <Alert><AlertDescription>El instructor te devolvió la entrega. Revisa sus comentarios y envíala de nuevo.</AlertDescription></Alert> : null}
      {canSubmit ? <SubmissionForm key={latest?.id ?? 'first'} settings={settings} courseId={courseId} lessonId={lessonId} resubmit={Boolean(latest)} /> : null}
      {submissions.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Historial de entregas</h3>
          {submissions.map((submission) => <SubmissionCard key={submission.id} submission={submission} />)}
        </section>
      ) : null}
    </div>
  )
}
