import { Alert, AlertDescription, Badge, Button, EmptyState, MarkdownViewer, buttonVariants, cn } from '@runly/ui'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, FileVideo, Loader2, XCircle } from 'lucide-react'
import { KIND_LABELS, formatDuration } from '../lib/lmsLabels.js'
import { VideoLesson } from './VideoLesson.jsx'
import { AssignmentLesson } from './assignment/AssignmentLesson.jsx'
import { QuizLesson } from './quiz/QuizLesson.jsx'

const EVALUATED = new Set(['quiz', 'assignment'])

// Lessons with a 16:9 stage above the title (the rest render in Descripción).
export const hasStage = (lesson) => lesson?.kind === 'video' || (lesson?.kind === 'embed' && Boolean(lesson.embedUrl))

function EmbedLesson({ lesson }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
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
    <div className="flex flex-col items-start gap-3 rounded-md border border-[hsl(var(--border))] p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-violet-600/10 text-violet-700 dark:text-violet-300">
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

// Video or embed stage. `theater` widens the layout (the player owns the toggle).
export function LessonStage({ payload, preview, onProgress, theater, onTheaterChange }) {
  const { lesson, progress } = payload
  if (lesson.kind === 'embed') return <EmbedLesson lesson={lesson} />
  if (!lesson.mediaUrl && !lesson.media) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-md bg-[hsl(var(--muted))]">
        <EmptyState icon={FileVideo} title="Video no disponible" description="El video de esta lección no se encontró." />
      </div>
    )
  }
  return (
    <VideoLesson
      key={lesson.id}
      lesson={lesson} progress={progress} preview={preview}
      onProgress={preview ? undefined : onProgress}
      theater={theater} onTheaterChange={onTheaterChange}
    />
  )
}

// Title, state badges and navigation (Anterior / Marcar como completada / Siguiente).
export function LessonHeader({ payload, status, preview, onComplete, completing, onNavigate, canGoNext }) {
  const { lesson, prevLessonId, nextLessonId } = payload
  const completed = status === 'completed'
  const manualComplete = lesson.kind !== 'video' && !EVALUATED.has(lesson.kind)
  const meta = [KIND_LABELS[lesson.kind], formatDuration(lesson.durationSeconds)].filter(Boolean).join(' · ')
  return (
    <header className="flex flex-col gap-4 border-b border-[hsl(var(--border))] pb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {meta ? <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
          {completed ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Completada</Badge> : null}
          {status === 'pending_review' ? <Badge variant="warning"><Clock className="h-3 w-3" aria-hidden="true" />En revisión</Badge> : null}
          {status === 'failed' ? <Badge variant="destructive"><XCircle className="h-3 w-3" aria-hidden="true" />No aprobada</Badge> : null}
        </div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{lesson.title}</h2>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!prevLessonId} onClick={() => onNavigate(prevLessonId)} aria-label="Lección anterior">
          <ChevronLeft /><span className="max-sm:sr-only">Anterior</span>
        </Button>
        {manualComplete && !completed && !preview ? (
          <Button variant="outline" size="sm" onClick={onComplete} disabled={completing}>
            {completing ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <CheckCircle2 />}
            Marcar como completada
          </Button>
        ) : null}
        <Button size="sm" className={cn(!nextLessonId && 'hidden')} disabled={!canGoNext} onClick={() => onNavigate(nextLessonId)}>
          Siguiente<ChevronRight />
        </Button>
      </div>
    </header>
  )
}

// Descripción tab: the lesson notes plus, for lessons without a stage, the
// lesson itself (text, document, quiz or assignment).
export function LessonBody({ payload, courseId, status, preview }) {
  const { lesson } = payload
  const body = lesson.body?.trim() ? <MarkdownViewer value={lesson.body} className="text-[15px]" /> : null
  let main = null
  if (EVALUATED.has(lesson.kind) && preview) {
    main = (
      <Alert>
        <AlertDescription>
          {lesson.kind === 'quiz' ? 'Vista previa: el examen' : 'Vista previa: la tarea'} solo se puede presentar con una inscripción al curso. Asígnate el curso para probarlo como alumno.
        </AlertDescription>
      </Alert>
    )
  } else if (lesson.kind === 'quiz') main = <QuizLesson key={lesson.id} lessonId={lesson.id} courseId={courseId} />
  else if (lesson.kind === 'assignment') main = <AssignmentLesson key={lesson.id} lessonId={lesson.id} courseId={courseId} />
  else if (lesson.kind === 'file') main = <FileLesson lesson={lesson} />

  const empty = !body && !main
  return (
    <div className="flex flex-col gap-5">
      {EVALUATED.has(lesson.kind) ? <>{body}{main}</> : <>{main}{body}</>}
      {empty ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Esta lección no tiene descripción.</p> : null}
      {lesson.kind === 'video' && status !== 'completed' && !preview ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">La lección se marca como completada al ver al menos el 90% del video.</p>
      ) : null}
    </div>
  )
}
