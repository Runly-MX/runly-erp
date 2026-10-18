import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, ErrorState, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, cn } from '@runly/ui'
import { Award, Download, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { CourseOutline } from '../components/CourseOutline.jsx'
import { LessonBody, LessonHeader, LessonStage, hasStage } from '../components/LessonContent.jsx'
import { LmsAssignmentSourceContext, LmsQuizSourceContext } from '../hooks/useLmsEval.js'
import { useGuestAssignmentSource, useGuestLesson, useGuestProgress, useGuestQuizSource } from '../hooks/useLmsShare.js'
import { toAbsoluteUrl } from '../lib/lmsCert.js'
import { readTheater, writeTheater } from '../lib/lmsExperience.js'
import { flattenLessons, pickStartLesson } from '../lib/lmsLabels.js'
import { guestCourseKey } from '../lib/lmsShare.js'
import { SharedPlayerHeader } from './SharedPlayerHeader.jsx'
import { PUBLIC_VIEWPORT_CLASS } from './keyboardSafeFocus.js'

function LessonError({ lesson }) {
  return lesson.error?.status === 409
    ? <EmptyState icon={Lock} title="Lección bloqueada" description="Completa las lecciones anteriores para abrir esta." />
    : <ErrorState title="No se pudo abrir la lección" description={lesson.error?.message} onRetry={() => lesson.refetch()} />
}

function CompletedCard({ certificate }) {
  const pdfUrl = certificate ? toAbsoluteUrl(runly.lms.publicCertificatePdfUrl(certificate.token), getApiUrl()) : ''
  return (
    <div className="flex flex-col gap-3 rounded-md border border-emerald-600/30 bg-emerald-600/10 p-4 sm:flex-row sm:items-center">
      <Award className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Completaste el contenido compartido</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{certificate ? `Tu certificado ${certificate.folio} está listo.` : 'Puedes volver a ver las lecciones cuando quieras.'}</p>
      </div>
      {pdfUrl ? (
        <Button asChild className="max-sm:h-11 max-sm:w-full"><a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download />Descargar certificado</a></Button>
      ) : null}
    </div>
  )
}

// Reduced player for an external guest: content sidebar, video/embed stage,
// lesson header and body (text, document, quiz and assignment when allowed). No questions,
// announcements, resources or reviews. Progress saves through the guest token.
export function SharedCoursePlayer({ shareToken, guestToken, data, onSignOut }) {
  const courseKey = guestCourseKey(shareToken)
  const [lessonId, setLessonId] = useState(null)
  const [theater, setTheater] = useState(() => readTheater())
  // Below lg the course content opens as a side drawer instead of a list at the bottom.
  const [contentOpen, setContentOpen] = useState(false)
  const sidebarRef = useRef(null)
  const lesson = useGuestLesson(shareToken, guestToken, lessonId)
  const save = useGuestProgress(shareToken, guestToken)
  const quizSource = useGuestQuizSource(shareToken, guestToken)
  const assignmentSource = useGuestAssignmentSource(shareToken, guestToken)
  const lessons = useMemo(() => flattenLessons(data.sections), [data.sections])
  const current = lessons.find((item) => item.id === lessonId)
  const status = data.enrollment?.status
  const statusRef = useRef(status)

  useEffect(() => {
    if (lessonId) return
    const start = pickStartLesson(data.sections, data.enrollment?.lastLessonId)
    if (start) setLessonId(start)
  }, [data, lessonId])

  useEffect(() => {
    if (statusRef.current && statusRef.current !== 'completed' && status === 'completed') toast.success('Completaste el curso. ¡Bien hecho!')
    statusRef.current = status
  }, [status])

  const select = (id) => {
    if (!id) return
    setLessonId(id)
    setContentOpen(false)
    sidebarRef.current?.closest('[data-player-scroll]')?.scrollTo?.({ top: 0 })
  }
  const report = (progress) => { if (lessonId) save.mutate({ lessonId, ...progress }) }
  async function complete() {
    try {
      await save.mutateAsync({ lessonId, completed: true })
      toast.success('Lección completada.')
    } catch (error) { toast.error(error.message || 'No se pudo guardar el avance.') }
  }
  const changeTheater = (value) => { setTheater(value); writeTheater(value) }

  const pct = data.enrollment?.progressPct ?? 0
  const payload = lesson.data
  const stage = Boolean(payload) && hasStage(payload.lesson)
  const stageArea = stage || lesson.isLoading
  const theaterOn = theater && stage && payload.lesson.kind === 'video'
  const next = payload ? lessons.find((item) => item.id === payload.nextLessonId) : null
  const showContent = () => {
    if (window.matchMedia?.('(min-width: 1024px)')?.matches) sidebarRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    else setContentOpen(true)
  }

  return (
    <LmsQuizSourceContext.Provider value={quizSource}>
      <LmsAssignmentSourceContext.Provider value={assignmentSource}>
        <div className={`${PUBLIC_VIEWPORT_CLASS} flex min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))]`}>
          <SharedPlayerHeader
            company={data.company} title={data.course.title} pct={pct} guestName={data.guest?.name ?? null}
            onShowContent={showContent} onSignOut={onSignOut}
          />
          <div data-player-scroll="" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            {!lessons.length ? (
              <div className="flex min-h-[60dvh] items-center justify-center p-6"><EmptyState icon={Lock} title="Sin lecciones disponibles" description="Este enlace todavía no comparte lecciones." /></div>
            ) : (
              <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-6">
                {stageArea ? (
                  <div className={cn('min-w-0', theaterOn ? 'lg:col-span-2' : 'lg:col-start-1 lg:row-start-1')}>
                    <div className={cn('mx-auto w-full transition-[max-width] duration-300 ease-out motion-reduce:transition-none', theaterOn ? 'max-w-[min(100%,calc((100dvh-11rem)*16/9))]' : 'max-w-full')}>
                      {payload ? <LessonStage payload={payload} preview={false} onProgress={report} theater={theaterOn} onTheaterChange={changeTheater} /> : <Skeleton className="aspect-video w-full rounded-md" />}
                    </div>
                  </div>
                ) : null}
                <div className={cn('min-w-0 space-y-5 lg:col-start-1', stageArea ? 'lg:row-start-2' : 'lg:row-start-1')}>
                  {status === 'completed' ? <CompletedCard certificate={data.certificate} /> : null}
                  {!lessonId ? (
                    <EmptyState icon={Lock} title="No hay lecciones disponibles" description="Todas las lecciones están bloqueadas por ahora." />
                  ) : lesson.isLoading ? (
                    <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /></div>
                  ) : lesson.isError ? <LessonError lesson={lesson} /> : payload ? (
                    <>
                      <LessonHeader
                        payload={payload} status={current?.status} preview={false}
                        onComplete={complete} completing={save.isPending} onNavigate={select}
                        canGoNext={Boolean(next) && next.status !== 'locked'}
                      />
                      <LessonBody payload={payload} courseId={courseKey} status={current?.status} preview={false} />
                    </>
                  ) : null}
                </div>
                <aside
                  ref={sidebarRef}
                  className={cn(
                    'hidden min-w-0 scroll-mt-3 lg:block lg:sticky lg:top-6 lg:col-start-2 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-1',
                    theaterOn ? 'lg:row-start-2' : stageArea ? 'lg:row-start-1 lg:row-span-2' : 'lg:row-start-1',
                  )}
                >
                  <CourseOutline sections={data.sections} currentLessonId={lessonId} onSelect={select} progressPct={pct} />
                </aside>
              </div>
            )}
          </div>
          <Sheet open={contentOpen} onOpenChange={setContentOpen}>
            <SheetContent side="left" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
              {/* The outline below has its own visible title; this one is for screen readers. */}
              <SheetHeader className="sr-only">
                <SheetTitle>Contenido del curso</SheetTitle>
                <SheetDescription>Elige una lección para abrirla.</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12">
                <CourseOutline sections={data.sections} currentLessonId={lessonId} onSelect={select} progressPct={pct} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </LmsAssignmentSourceContext.Provider>
    </LmsQuizSourceContext.Provider>
  )
}
