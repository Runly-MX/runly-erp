import { Alert, AlertDescription, Badge, Button, EmptyState, MarkdownViewer, buttonVariants, cn } from '@runly/ui'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, Loader2, XCircle } from 'lucide-react'
import { KIND_LABELS, formatDuration } from '../lib/lmsLabels.js'
import { VideoLesson } from './VideoLesson.jsx'
import { AssignmentLesson } from './assignment/AssignmentLesson.jsx'
import { QuizLesson } from './quiz/QuizLesson.jsx'

const EVALUATED = new Set(['quiz', 'assignment'])

function EmbedLesson({ lesson }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <iframe
        src={lesson.embedUrl}
        title={lesson.title}
        className="h-full w-full border-0"
        allow="fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

function FileLesson({ lesson }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-700 dark:text-violet-300">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{lesson.fileName || 'Documento'}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Descárgalo, revísalo y marca la lección como completada.</p>
      </div>
      {lesson.mediaUrl ? (
        <a href={lesson.mediaUrl} target="_blank" rel="noreferrer" download={lesson.fileName || true} className={buttonVariants({ variant: 'outline' })}>
          <Download />Descargar
        </a>
      ) : null}
    </div>
  )
}

function Body({ lesson, courseId, preview, startAt, onProgress }) {
  if (EVALUATED.has(lesson.kind) && preview) {
    return (
      <Alert>
        <AlertDescription>
          {lesson.kind === 'quiz' ? 'Vista previa: el examen' : 'Vista previa: la tarea'} solo se puede presentar con una inscripción al curso. Asígnate el curso para probarlo como alumno.
        </AlertDescription>
      </Alert>
    )
  }
  if (lesson.kind === 'quiz') return <QuizLesson key={lesson.id} lessonId={lesson.id} courseId={courseId} />
  if (lesson.kind === 'assignment') return <AssignmentLesson key={lesson.id} lessonId={lesson.id} courseId={courseId} />
  if (lesson.kind === 'video') {
    if (!lesson.mediaUrl) return <EmptyState icon={FileText} title="Video no disponible" description="El video de esta lección no se encontró." />
    return <VideoLesson src={lesson.mediaUrl} media={lesson.media} startAt={startAt} onProgress={onProgress} />
  }
  if (lesson.kind === 'embed') return lesson.embedUrl ? <EmbedLesson lesson={lesson} /> : null
  if (lesson.kind === 'file') return <FileLesson lesson={lesson} />
  return null
}

// Content pane of the player. `status` comes from the (live) outline;
// `payload` is the GET /lms/learn/lessons/:id response.
export function LessonContent({ payload, courseId, status, preview, onProgress, onComplete, completing, onNavigate, canGoNext }) {
  const { lesson, progress, prevLessonId, nextLessonId } = payload
  const completed = status === 'completed'
  const evaluated = EVALUATED.has(lesson.kind)
  const manualComplete = lesson.kind !== 'video' && !evaluated
  const body = lesson.body?.trim() ? <MarkdownViewer value={lesson.body} className="text-[15px]" /> : null
  const meta = [KIND_LABELS[lesson.kind], formatDuration(lesson.durationSeconds)].filter(Boolean).join(' · ')
  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {meta ? <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
          {completed ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Completada</Badge> : null}
          {status === 'pending_review' ? <Badge variant="warning"><Clock className="h-3 w-3" aria-hidden="true" />En revisión</Badge> : null}
          {status === 'failed' ? <Badge variant="destructive"><XCircle className="h-3 w-3" aria-hidden="true" />No aprobada</Badge> : null}
        </div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{lesson.title}</h2>
      </header>

      {evaluated ? body : null}
      <Body lesson={lesson} courseId={courseId} preview={preview} startAt={progress?.positionSeconds} onProgress={preview ? undefined : onProgress} />
      {evaluated ? null : body}
      {lesson.kind === 'video' && !completed && !preview ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">La lección se marca como completada al ver al menos el 90% del video.</p>
      ) : null}

      <footer className="flex flex-col-reverse gap-2 border-t border-[hsl(var(--border))] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" disabled={!prevLessonId} onClick={() => onNavigate(prevLessonId)}>
          <ChevronLeft />Anterior
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {manualComplete && !completed && !preview ? (
            <Button variant="outline" onClick={onComplete} disabled={completing}>
              {completing ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <CheckCircle2 />}
              Marcar como completada
            </Button>
          ) : null}
          <Button className={cn(!nextLessonId && 'hidden')} disabled={!canGoNext} onClick={() => onNavigate(nextLessonId)}>
            Siguiente<ChevronRight />
          </Button>
        </div>
      </footer>
    </article>
  )
}
