import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, Clock, Download, ShieldCheck, Users } from 'lucide-react'
import { Badge, Button, ChipTabPanel, ChipTabs, DataTable, DatePickerField, DateRangeFilter, ErrorState, FilterToolbar, PersonAvatar, Skeleton } from '@runly/ui'
import { PresenceChart } from '../components/PresenceChart.jsx'
import { quotaTitle } from '../components/QuotaCards.jsx'
import { PageShell, ScreenHeader, Toolbar } from '../components/shared.jsx'
import { useComplianceReport, useHoursReport, usePresence } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { usePersistedTab } from '../hooks/usePersistedTab.js'
import { useUrlRange } from '../hooks/useUrlRange.js'
import { toLocalIso } from '../../../lib/localDate.js'
import { buildCsv, dayEndIso, dayStartIso, formatDateTime, fullName, minutesToHours, tallyBy } from '../lib/attendanceLabels.js'

const dayOffset = (days) => toLocalIso(new Date(Date.now() + days * 86_400_000))
const RANGE_FILTER = { key: 'range', label: 'Fechas', fromKey: 'from', toKey: 'to' }

function downloadCsv(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function PersonCell({ person, size = 'sm' }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={fullName(person)} size={size} />
      <div className="min-w-0">
        <p className="truncate font-medium leading-tight">{fullName(person)}</p>
        <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{person?.code}</p>
      </div>
    </div>
  )
}

function HoursTab({ lookups }) {
  const [range, setRange] = useUrlRange({ from: dayOffset(-6), to: dayOffset(0) })
  const query = useMemo(() => ({ from: dayStartIso(range.from), to: dayEndIso(range.to) }), [range])
  const report = useHoursReport(query)
  const rows = report.data?.rows ?? []

  const columns = useMemo(() => [
    { id: 'person', header: 'Persona', accessorFn: (r) => `${r.person?.code ?? ''} ${fullName(r.person)}`, cell: ({ row }) => <PersonCell person={row.original.person} /> },
    { id: 'group', header: 'Grupo', accessorFn: (r) => lookups.groups.get(r.person?.groupId) ?? '—' },
    { id: 'minutes', header: 'Horas', accessorFn: (r) => r.minutes, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{minutesToHours(row.original.minutes)}</span> },
    { id: 'sessions', header: 'Sesiones', accessorFn: (r) => r.sessions, cell: ({ row }) => <span className="tabular-nums">{row.original.sessions}</span> },
    {
      id: 'open', header: 'Sesiones abiertas', accessorFn: (r) => r.openSessions,
      cell: ({ row }) => (row.original.openSessions ? <Badge variant="warning">{row.original.openSessions} sin salida</Badge> : <span className="text-[hsl(var(--muted-foreground))]">0</span>),
    },
  ], [lookups.groups])

  function exportCsv() {
    const csv = buildCsv(
      ['Código', 'Persona', 'Grupo', 'Horas', 'Minutos', 'Sesiones', 'Sesiones abiertas'],
      rows.map((r) => [r.person?.code, fullName(r.person), lookups.groups.get(r.person?.groupId) ?? '', (r.minutes / 60).toFixed(2), Math.round(r.minutes), r.sessions, r.openSessions]),
    )
    downloadCsv(`horas-${range.from || 'inicio'}_${range.to || 'hoy'}.csv`, csv)
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.person?.id}
      isLoading={report.isLoading}
      isError={report.isError}
      onRetry={() => report.refetch()}
      pageSize={25}
      searchPlaceholder="Buscar persona…"
      emptyIcon={BarChart3}
      emptyTitle="Sin horas en este rango"
      emptyDescription="No hay sesiones de trabajo entre estas fechas. Prueba con otro rango."
      toolbarStart={(
        <>
          <DateRangeFilter filter={RANGE_FILTER} value={range} onChange={(next) => setRange({ from: next.from, to: next.to })} />
          {report.data ? <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-3 text-sm text-[hsl(var(--muted-foreground))] sm:h-9">Total <span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{minutesToHours(report.data.totalMinutes)}</span></span> : null}
        </>
      )}
      toolbarActions={<Button onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />Exportar CSV</Button>}
    />
  )
}

function ComplianceTab({ lookups }) {
  const [params, setParams] = useSearchParams()
  const day = params.get('day') || dayOffset(0)
  const setDay = (value) => setParams((current) => {
    const copy = new URLSearchParams(current)
    copy.set('day', value || dayOffset(0))
    return copy
  }, { replace: true })
  // For today, evaluate "now"; for past days, the end of that day.
  const query = useMemo(() => {
    const end = dayEndIso(day)
    return { from: dayStartIso(day), to: end, at: day === toLocalIso() ? new Date().toISOString() : end }
  }, [day])
  const report = useComplianceReport(query)

  const columns = useMemo(() => [
    { id: 'quota', header: 'Cuota', accessorFn: (r) => quotaTitle(r, lookups), cell: ({ row }) => <span className="font-medium">{quotaTitle(row.original, lookups)}</span> },
    { id: 'required', header: 'Requeridos', accessorFn: (r) => r.required, cell: ({ row }) => <span className="tabular-nums">{row.original.required}</span> },
    { id: 'present', header: 'Presentes', accessorFn: (r) => r.present, cell: ({ row }) => <span className="tabular-nums">{row.original.present}</span> },
    { id: 'attended', header: 'Asistieron en el día', accessorFn: (r) => r.attended, cell: ({ row }) => <span className="tabular-nums">{row.original.attended}</span> },
    {
      id: 'result', header: 'Resultado', accessorFn: (r) => (!r.applies ? 'No aplica' : r.ok ? 'Cumple' : 'Incumple'),
      cell: ({ row }) => {
        const r = row.original
        if (!r.applies) return <Badge variant="secondary">No aplica</Badge>
        return r.ok ? <Badge variant="success">Cumple</Badge> : <Badge variant="destructive">Faltan {r.missing}</Badge>
      },
    },
  ], [lookups])

  return (
    <div className="space-y-4">
      <FilterToolbar filters={<DatePickerField className="w-full sm:w-52" value={day} onChange={setDay} />} />
      <p className="text-sm text-[hsl(var(--muted-foreground))]">Compara las personas presentes contra el mínimo de cada cuota en el día elegido.</p>
      <DataTable
        columns={columns}
        data={report.data?.rows ?? []}
        getRowId={(r) => r.quotaId}
        isLoading={report.isLoading}
        isError={report.isError}
        onRetry={() => report.refetch()}
        showToolbar={false}
        showPagination={false}
        emptyIcon={BarChart3}
        emptyTitle="Sin cuotas"
        emptyDescription="Configura cuotas en Configuración para medir el cumplimiento."
      />
    </div>
  )
}

function PresenceTab({ lookups }) {
  const presence = usePresence()
  const data = presence.data
  const byGroup = useMemo(() => tallyBy(data?.counts?.byGroup, lookups.groups, 'Sin grupo'), [data, lookups.groups])
  const byCategory = useMemo(() => tallyBy(data?.counts?.byCategory, lookups.categories, 'Sin categoría'), [data, lookups.categories])
  const rows = data?.present ?? []

  const columns = useMemo(() => [
    { id: 'person', header: 'Persona', accessorFn: (r) => `${r.code ?? ''} ${fullName(r)}`, cell: ({ row }) => <PersonCell person={row.original} /> },
    { id: 'group', header: 'Grupo', accessorFn: (r) => lookups.groups.get(r.groupId) ?? '—' },
    { id: 'category', header: 'Categoría', accessorFn: (r) => lookups.categories.get(r.categoryId) ?? '—' },
    { id: 'site', header: 'Sitio', accessorFn: (r) => lookups.sites.get(r.siteId) ?? '—' },
    { id: 'since', header: 'Desde', accessorFn: (r) => r.since, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.since)}</span> },
  ], [lookups])

  if (presence.isError) return <ErrorState onRetry={() => presence.refetch()} />
  const summaryText = data ? `${data.counts?.total ?? rows.length} de ${data.total ?? 0} personas activas están dentro ahora. Se actualiza cada 20 segundos.` : undefined
  return (
    <div className="space-y-4">
      <Toolbar description={summaryText} />
      {presence.isLoading ? <Skeleton className="h-56 rounded-2xl" /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PresenceChart title="Por grupo" data={byGroup} />
          <PresenceChart title="Por categoría" data={byCategory} />
        </div>
      )}
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.personId}
        isLoading={presence.isLoading}
        pageSize={15}
        searchPlaceholder="Buscar persona…"
        emptyIcon={Users}
        emptyTitle="Nadie presente"
        emptyDescription="Cuando alguien registre su entrada aparecerá aquí."
      />
    </div>
  )
}

const TAB_VALUES = ['hours', 'compliance', 'presence']
const TABS = [
  { value: 'hours', label: 'Horas', icon: Clock, description: 'Horas trabajadas por persona en un rango de fechas, calculadas con pares de entrada y salida. Las sesiones sin salida se marcan para que las corrijas. Útil para nómina y control de contratistas.' },
  { value: 'compliance', label: 'Cumplimiento', icon: ShieldCheck, description: 'Compara, día por día, cuántas personas estuvieron presentes contra el mínimo de cada cuota (grupo, categoría o sitio) y cuántas faltan.' },
  { value: 'presence', label: 'Presencia', icon: Users, description: 'Quién está dentro en este momento, agrupado por grupo y categoría. Sirve para conteos de emergencia y para validar que hay el personal necesario en sitio.' },
]

export default function AttendanceReports() {
  const lookups = useLookups()
  const [tab, setTab] = usePersistedTab('attendance.reports.tab', TAB_VALUES, 'hours')
  return (
    <PageShell>
      <ScreenHeader title="Reportes" description="Horas trabajadas, cumplimiento de cuotas y presencia en vivo." />
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} tone="blue" ariaLabel="Reportes de asistencia" />
      <ChipTabPanel value="hours" active={tab === 'hours'}><HoursTab lookups={lookups} /></ChipTabPanel>
      <ChipTabPanel value="compliance" active={tab === 'compliance'}><ComplianceTab lookups={lookups} /></ChipTabPanel>
      <ChipTabPanel value="presence" active={tab === 'presence'}><PresenceTab lookups={lookups} /></ChipTabPanel>
    </PageShell>
  )
}
