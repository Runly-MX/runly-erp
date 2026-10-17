import { Badge, cn } from '@runly/ui'
import { Paperclip } from 'lucide-react'
import { SUBMISSION_STATUS_LABELS, SUBMISSION_VARIANTS, formatShortDate } from '../../lib/lmsLabels.js'

export function SubmissionStatusBadge({ status }) {
  return <Badge variant={SUBMISSION_VARIANTS[status] ?? 'secondary'}>{SUBMISSION_STATUS_LABELS[status] ?? status}</Badge>
}

export function SubmissionFiles({ files }) {
  if (!files?.length) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.id}>
          {file.url ? (
            <a
              href={file.url} target="_blank" rel="noreferrer" download={file.name || true}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-sm hover:bg-[hsl(var(--muted)/0.6)]"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{file.name || 'Archivo'}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] px-2.5 py-1.5 text-sm text-[hsl(var(--muted-foreground))]">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{file.name || 'Archivo no disponible'}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

// One submission: status, date, late flag, text, files, grade and feedback.
export function SubmissionCard({ submission, className }) {
  const graded = submission.status !== 'submitted'
  return (
    <article className={cn('space-y-3 rounded-md border border-[hsl(var(--border))] p-4', className)}>
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Entrega {submission.number}</h4>
        <SubmissionStatusBadge status={submission.status} />
        {submission.late ? <Badge variant="warning">Tardía</Badge> : null}
        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{formatShortDate(submission.submittedAt)}</span>
      </header>
      {submission.text?.trim() ? <p className="whitespace-pre-wrap text-sm">{submission.text}</p> : null}
      <SubmissionFiles files={submission.files} />
      {graded && (submission.grade !== null && submission.grade !== undefined || submission.feedback?.trim()) ? (
        <div className="space-y-1 rounded-md bg-[hsl(var(--muted)/0.6)] p-3">
          {submission.grade !== null && submission.grade !== undefined ? <p className="text-sm font-medium">Calificación: <span className="tabular-nums">{submission.grade}</span> / 100</p> : null}
          {submission.feedback?.trim() ? <p className="whitespace-pre-wrap text-sm">{submission.feedback}</p> : null}
        </div>
      ) : null}
    </article>
  )
}
