import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, Button, ChipTabPanel, ChipTabs, ConfirmDialog, ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { Archive, Eye, EyeOff, Globe, Layers, RotateCcw, Settings2, Users } from 'lucide-react'
import { CourseSettingsForm } from '../components/CourseSettingsForm.jsx'
import { CurriculumEditor } from '../components/CurriculumEditor.jsx'
import { EnrollmentsPanel } from '../components/EnrollmentsPanel.jsx'
import { CourseStatusBadge, PageShell, useRouteId } from '../components/shared.jsx'
import { useArchiveCourse, useCourse, useLmsPermissions, useUpdateCourse } from '../hooks/useLmsData.js'
import { lmsPath } from '../lib/lmsLabels.js'

const TABS = [
  { value: 'content', label: 'Contenido', icon: Layers, description: 'Secciones y lecciones del curso: videos, enlaces, textos y archivos.' },
  { value: 'settings', label: 'Configuración', icon: Settings2, description: 'Título, descripción, portada, nivel y reglas de avance e inscripción.' },
  { value: 'learners', label: 'Alumnos', icon: Users, description: 'Asigna el curso, define fechas límite y revisa el avance de cada persona.' },
]

export default function LmsCourseEditor() {
  const navigate = useNavigate()
  const courseId = useRouteId()
  const query = useCourse(courseId)
  const { canManageEnrollments } = useLmsPermissions()
  const publish = useUpdateCourse('Curso publicado.'), unpublish = useUpdateCourse('El curso volvió a borrador.')
  const archive = useArchiveCourse()
  const [tab, setTab] = useState('content')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const back = () => navigate(lmsPath('/courses'))

  if (query.isLoading) {
    return <PageShell><PageHeader title="Curso" loading onBack={back} backLabel="Cursos" className="mb-2 pb-0" /><Skeleton className="h-10 w-80 rounded-md" /><Skeleton className="h-64 rounded-2xl" /></PageShell>
  }
  if (query.isError || !query.data) {
    return (
      <PageShell>
        <PageHeader title="Curso" onBack={back} backLabel="Cursos" className="mb-2 pb-0" />
        <ErrorState title={query.error?.status === 404 ? 'El curso no existe' : 'No se pudo cargar el curso'} description={query.error?.message} onRetry={() => query.refetch()} />
      </PageShell>
    )
  }

  const { course, sections } = query.data
  const archived = course.status === 'archived'
  const setStatus = async (mutation, status) => { try { await mutation.mutateAsync({ id: course.id, status }) } catch { /* toast shown */ } }
  const tabs = canManageEnrollments ? TABS : TABS.filter((item) => item.value !== 'learners')

  async function doArchive() {
    try {
      await archive.mutateAsync(course.id)
      setConfirmArchive(false)
    } catch { /* toast shown by the mutation */ }
  }

  const actions = (
    <>
      <Button variant="outline" onClick={() => navigate(lmsPath(`/learn/${course.id}`))}><Eye />Vista previa</Button>
      {course.status === 'draft' ? <Button onClick={() => setStatus(publish, 'published')} disabled={publish.isPending}><Globe />Publicar</Button> : null}
      {course.status === 'published' ? <Button variant="outline" onClick={() => setStatus(unpublish, 'draft')} disabled={unpublish.isPending}><EyeOff />Despublicar</Button> : null}
      {archived ? <Button variant="outline" onClick={() => setStatus(unpublish, 'draft')} disabled={unpublish.isPending}><RotateCcw />Restaurar</Button> : null}
      {!archived ? <Button variant="outline" onClick={() => setConfirmArchive(true)} className="text-[hsl(var(--destructive))]"><Archive />Archivar</Button> : null}
    </>
  )

  return (
    <PageShell>
      <PageHeader
        onBack={back}
        backLabel="Cursos"
        eyebrow="Aprendizaje"
        title={course.title}
        description={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <CourseStatusBadge status={course.status} />
            <span>{course.lessonCount ?? 0} {course.lessonCount === 1 ? 'lección' : 'lecciones'} · {course.enrollmentCount ?? 0} {course.enrollmentCount === 1 ? 'alumno' : 'alumnos'}</span>
          </span>
        )}
        actions={actions}
        className="mb-2 pb-0"
      />
      {archived ? (
        <Alert><AlertDescription>Este curso está archivado: sus alumnos lo ven en modo de solo lectura. Restáuralo para editarlo.</AlertDescription></Alert>
      ) : course.status === 'draft' ? (
        <Alert><AlertDescription>Borrador: los alumnos no lo ven hasta que lo publiques. Usa «Vista previa» para revisarlo como alumno.</AlertDescription></Alert>
      ) : null}
      <ChipTabs tabs={tabs} value={tab} onChange={setTab} tone="violet" ariaLabel="Secciones del curso" />
      <ChipTabPanel value="content" active={tab === 'content'}>
        <CurriculumEditor courseId={course.id} sections={sections} readOnly={archived} />
      </ChipTabPanel>
      <ChipTabPanel value="settings" active={tab === 'settings'}>
        <CourseSettingsForm course={course} readOnly={archived} />
      </ChipTabPanel>
      {canManageEnrollments ? (
        <ChipTabPanel value="learners" active={tab === 'learners'}>
          <EnrollmentsPanel courseId={course.id} readOnly={archived} />
        </ChipTabPanel>
      ) : null}
      <ConfirmDialog
        open={confirmArchive} onOpenChange={setConfirmArchive}
        icon={Archive}
        title="Archivar curso"
        description={`«${course.title}» dejará de aparecer en el catálogo y en los cursos activos. Las inscripciones y el avance se conservan en modo de solo lectura.`}
        confirmLabel="Archivar"
        loading={archive.isPending}
        onConfirm={doArchive}
      />
    </PageShell>
  )
}
