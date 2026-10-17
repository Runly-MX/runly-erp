import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ChipTabs, DataTable, PageHeader } from '@runly/ui'
import { Archive, BookOpen, FilePen, Globe, Plus } from 'lucide-react'
import { CourseFormDialog } from '../components/CourseFormDialog.jsx'
import { CourseStatusBadge, PageShell } from '../components/shared.jsx'
import { useCourses, useCreateCourse } from '../hooks/useLmsData.js'
import { LEVEL_LABELS, formatShortDate, lmsPath } from '../lib/lmsLabels.js'

const TABS = [
  { value: 'all', label: 'Activos', icon: BookOpen, description: 'Borradores y cursos publicados.' },
  { value: 'draft', label: 'Borradores', icon: FilePen, description: 'Cursos en preparación: solo los ven quienes administran cursos.' },
  { value: 'published', label: 'Publicados', icon: Globe, description: 'Cursos visibles para sus alumnos.' },
  { value: 'archived', label: 'Archivados', icon: Archive, description: 'Cursos retirados: sus inscripciones quedan de solo lectura.' },
]
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

export default function LmsCourses() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(false)
  const courses = useCourses(tab === 'all' ? null : { status: tab })
  const create = useCreateCourse()
  const openCourse = (id) => navigate(lmsPath(`/courses/${id}`))

  // "Activos" hides archived courses unless the API already filtered them out.
  const rows = useMemo(() => (courses.data ?? []).filter((course) => tab !== 'all' || course.status !== 'archived'), [courses.data, tab])

  async function submit(data) {
    try {
      const course = await create.mutateAsync(data)
      setOpen(false)
      if (course?.id) openCourse(course.id)
    } catch { /* toast shown by the mutation */ }
  }

  const columns = useMemo(() => [
    {
      id: 'title', header: 'Curso', accessorFn: (c) => c.title,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{row.original.title}</p>
          <p className={`${MUTED} truncate`}>{[row.original.category, LEVEL_LABELS[row.original.level]].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { id: 'status', header: 'Estado', accessorFn: (c) => c.status, cell: ({ row }) => <CourseStatusBadge status={row.original.status} /> },
    { id: 'lessons', header: 'Lecciones', accessorFn: (c) => c.lessonCount ?? 0, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> },
    { id: 'learners', header: 'Alumnos', accessorFn: (c) => c.enrollmentCount ?? 0, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> },
    { id: 'updated', header: 'Actualizado', accessorFn: (c) => c.updatedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.updatedAt)}</span> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => openCourse(row.original.id)}>Abrir</Button>,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Cursos"
        description="Crea cursos con videos, documentos y textos, publícalos y asígnalos a tu equipo."
        actions={<Button onClick={() => setOpen(true)} className="w-full sm:w-auto"><Plus />Nuevo curso</Button>}
        className="mb-2 pb-0"
      />
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} tone="violet" ariaLabel="Estado de los cursos" />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(c) => c.id}
        isLoading={courses.isLoading}
        isError={courses.isError}
        onRetry={() => courses.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar curso…"
        emptyIcon={BookOpen}
        emptyTitle={tab === 'all' ? 'Aún no hay cursos' : 'Sin cursos en este estado'}
        emptyDescription={tab === 'all' ? 'Crea tu primer curso para empezar a capacitar a tu equipo.' : undefined}
        emptyAction={tab === 'all' ? <Button onClick={() => setOpen(true)}><Plus />Nuevo curso</Button> : undefined}
      />
      <CourseFormDialog open={open} onOpenChange={setOpen} onSubmit={submit} pending={create.isPending} />
    </PageShell>
  )
}
