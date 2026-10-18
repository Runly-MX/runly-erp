import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, ErrorState, ProgressBar, Skeleton, cn } from '@runly/ui'
import { Award, Building2, Download, ListTree, Lock, LogOut } from 'lucide-react'
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
        <Button asChild><a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download />Descargar certificado</a></Button>
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
  const name = data.guest?.name ?? 'Invitado'

  return (
    <LmsQuizSourceContext.Provider value={quizSource}>
      <LmsAssignmentSourceContext.Provider value={assignmentSource}>
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))]">
          <header className="shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
              {data.company?.logoUrl
                ? <img src={data.company.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
                : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]"><Building2 className="h-4 w-4" aria-hidden="true" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{data.company?.name || 'Curso compartido'}</p>
                <h1 className="truncate text-sm font-semibold sm:text-base">{data.course.title}</h1>
              </div>
              <div className="hidden w-36 items-center gap-2 sm:flex">
                <ProgressBar value={pct} aria-label={`Avance: ${pct}%`} />
                <span className="text-xs font-medium tabular-nums">{pct}%</span>
              </div>
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => sidebarRef.current?.scrollIntoView({ block: 'start' })}><ListTree />Contenido</Button>
              <Button variant="ghost" size="sm" onClick={onSignOut} title="Olvidar este nombre en este navegador y empezar de nuevo"><LogOut />No soy {name}</Button>
            </div>
          </header>
          <div data-player-scroll="" className="min-h-0 flex-1 overflow-y-auto">
            {!lessons.length ? (
              <div className="flex min-h-[60dvh] items-center justify-center p-6"><EmptyState icon={Lock} title="Sin lecciones disponibles" description="Este enlace todavía no comparte lecciones." /></div>
            ) : (
              <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-6">
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
                    'min-w-0 scroll-mt-4 lg:sticky lg:top-6 lg:col-start-2 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-1',
                    theaterOn ? 'lg:row-start-2' : stageArea ? 'lg:row-start-1 lg:row-span-2' : 'lg:row-start-1',
                  )}
                >
                  <CourseOutline sections={data.sections} currentLessonId={lessonId} onSelect={select} progressPct={pct} />
                </aside>
              </div>
            )}
          </div>
        </div>
      </LmsAssignmentSourceContext.Provider>
    </LmsQuizSourceContext.Provider>
  )
}
