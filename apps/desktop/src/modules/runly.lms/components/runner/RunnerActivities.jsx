import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, ErrorState, FileUploader, MarkdownViewer, Skeleton, TextareaField, cn, formatBytes } from '@runly/ui'
import { Check, FileText, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { KEY, useToken } from '../../hooks/useLmsData.js'
import { LmsQuizSourceContext, errorCode } from '../../hooks/useLmsEval.js'
import { useSaveDraft, useSessionAttempt } from '../../hooks/useLmsSession.js'
import { directUpload } from '../../lib/directUpload.js'
import { SUBMISSION_MAX_MB } from '../../lib/lmsEval.js'
import { QuizAttempt } from '../quiz/QuizAttempt.jsx'

const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]'
const TEXT_SAVE_MS = 1000
const SAVE_LABELS = { saving: 'Guardando…', saved: 'Guardado', error: 'No se pudo guardar' }

function Instructions({ body }) {
  if (!String(body ?? '').trim()) return null
  return <div className="rounded-md bg-[hsl(var(--muted)/0.45)] px-4 py-3"><MarkdownViewer value={body} /></div>
}

// Quiz inside a session: the shared quiz components, saving through the
// session endpoints (the server refuses answers after the deadline).
export function QuizActivity({ sessionId, activity, disabled, onClosed, onAnswered }) {
  const token = useToken()
  const query = useSessionAttempt(sessionId, activity.attempt?.id)
  const source = useMemo(() => ({
    getAttempt: (attemptId) => runly.lms.getSessionAttempt(sessionId, attemptId, token),
    saveAnswers: (attemptId, answers) => runly.lms.saveSessionAnswers(sessionId, attemptId, answers, token),
    submitAttempt: () => { throw new Error('La evaluación se entrega completa.') },
  }), [sessionId, token])

  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-24 rounded-md" /><Skeleton className="h-40 rounded-md" /></div>
  if (query.isError || !query.data) return <ErrorState title="No se pudo cargar el cuestionario" description={query.error?.message} onRetry={() => query.refetch()} />
  return (
    <div className="space-y-4">
      <Instructions body={activity.body} />
      <LmsQuizSourceContext.Provider value={source}>
        <QuizAttempt
          attempt={query.data} layout={activity.settings?.layout ?? 'one'} sessionMode disabled={disabled}
          onExpired={onClosed} onFinished={() => {}} onAnswersChange={onAnswered}
        />
      </LmsQuizSourceContext.Provider>
    </div>
  )
}

// Delivery inside a session: text autosaved, files uploaded straight to
// storage and attached to the draft. Nothing is sent until the session is.
export function DeliveryActivity({ sessionId, activity, disabled, onClosed }) {
  const token = useToken()
  const client = useQueryClient()
  const save = useSaveDraft(sessionId)
  const submission = activity.submission ?? {}
  const [text, setText] = useState(submission.text ?? '')
  const [files, setFiles] = useState(submission.files ?? [])
  const [state, setState] = useState(null)
  const [uploading, setUploading] = useState(null)
  const dirty = useRef(false)
  const settings = activity.settings ?? {}
  const room = Math.max(0, (settings.maxFiles ?? 0) - files.length)

  async function persist(data) {
    setState('saving')
    try {
      const result = await save.mutateAsync({ activityId: activity.id, ...data })
      setFiles(result.submission?.files ?? [])
      setState('saved')
      client.setQueryData([KEY, 'session', sessionId], (old) => (old ? {
        ...old, activities: old.activities.map((item) => (item.id === activity.id ? { ...item, submission: result.submission } : item)),
      } : old))
      return true
    } catch (error) {
      setState('error')
      if (['EXPIRED', 'SESSION_CLOSED'].includes(errorCode(error))) onClosed()
      else toast.error(error.message || 'No se pudo guardar la entrega.')
      return false
    }
  }

  useEffect(() => {
    if (!dirty.current || disabled) return undefined
    const timer = setTimeout(() => { dirty.current = false; persist({ text }) }, TEXT_SAVE_MS)
    return () => clearTimeout(timer)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadMany(list) {
    for (const file of [...list].slice(0, room)) {
      setUploading(file.name)
      try {
        const { fileId } = await directUpload(file, token, {
          presign: (data, t) => runly.lms.presignSessionUpload(sessionId, data, t),
          confirm: (id, t) => runly.lms.confirmSessionUpload(sessionId, id, { activityId: activity.id }, t),
        })
        await persist({ fileIds: [...files.map((item) => item.id), fileId] })
      } catch (error) {
        if (['EXPIRED', 'SESSION_CLOSED'].includes(errorCode(error))) { onClosed(); break }
        toast.error(error.message || `No se pudo subir «${file.name}».`)
      } finally {
        setUploading(null)
      }
    }
  }

  const removeFile = (id) => persist({ fileIds: files.filter((item) => item.id !== id).map((item) => item.id) })

  return (
    <div className="space-y-4">
      <Instructions body={activity.body} />
      {settings.allowText ? (
        <TextareaField
          label="Tu respuesta" value={text} rows={10} maxLength={50000} disabled={disabled}
          onChange={(event) => { dirty.current = true; setText(event.target.value) }}
          hint="Se guarda sola mientras escribes."
        />
      ) : null}
      {settings.allowFiles ? (
        <section className="space-y-2" aria-label="Archivos de la entrega">
          <p className="text-sm font-medium">Archivos <span className={MUTED}>({files.length} de {settings.maxFiles})</span></p>
          {files.length ? (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2">
                  <FileText className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name ?? 'Archivo'}</p>
                    {file.sizeBytes ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatBytes(Number(file.sizeBytes))}</p> : null}
                  </div>
                  {!disabled ? (
                    <Button variant="ghost" size="icon" aria-label={`Quitar ${file.name ?? 'archivo'}`} onClick={() => removeFile(file.id)} disabled={save.isPending}><Trash2 /></Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {!disabled && room > 0 ? (
            <FileUploader multiple value={null} onUploadMany={uploadMany} maxSizeMB={SUBMISSION_MAX_MB} disabled={Boolean(uploading)} hint={`PDF, Word, Excel, PowerPoint, imágenes o ZIP, hasta ${SUBMISSION_MAX_MB} MB.`} />
          ) : null}
          {uploading ? <p className={cn(MUTED, 'flex items-center gap-2')} aria-live="polite"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Subiendo «{uploading}»…</p> : null}
        </section>
      ) : null}
      {state ? (
        <p className={cn('flex items-center gap-1 text-xs', state === 'error' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]')} aria-live="polite">
          {state === 'saved' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}{SAVE_LABELS[state]}
        </p>
      ) : null}
    </div>
  )
}
