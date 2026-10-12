import { useMemo, useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { Badge, Button, DataTable, DateField, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@runly/ui'
import { quotaTitle } from '../components/QuotaCards.jsx'
import { PageShell } from '../components/shared.jsx'
import { useComplianceReport, useHoursReport } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { toLocalIso } from '../../../lib/localDate.js'
import { buildCsv, dayEndIso, dayStartIso, fullName, minutesToHours } from '../lib/attendanceLabels.js'

const dayOffset = (days) => toLocalIso(new Date(Date.now() + days * 86_400_000))

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

function HoursTab({ lookups }) {
  const [range, setRange] = useState(() => ({ from: dayOffset(-6), to: dayOffset(0) }))
  const query = useMemo(() => ({ from: dayStartIso(range.from), to: dayEndIso(range.to) }), [range])
  const report = useHoursReport(query)
  const rows = report.data?.rows ?? []

  const columns = useMemo(() => [
    {
      id: 'person', header: 'Persona', accessorFn: (r) => `${r.person?.code ?? ''} ${fullName(r.person)}`,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{fullName(row.original.person)}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{row.original.person?.code}</p>
        </div>
      ),
    },
    { id: 'group', header: 'Grupo', accessorFn: (r) => lookups.groups.get(r.person?.groupId) ?? '—' },
    { id: 'minutes', header: 'Horas', accessorFn: (r) => r.minutes, cell: ({ row }) => <span className="tabular-nums">{minutesToHours(row.original.minutes)}</span> },
    { id: 'sessions', header: 'Sesiones', accessorFn: (r) => r.sessions },
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
    downloadCsv(`horas-${range.from}_${range.to}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateField label="Desde" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-44" />
        <DateField label="Hasta" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-44" />
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />Exportar CSV</Button>
        {report.data ? <p className="pb-2 text-sm text-[hsl(var(--muted-foreground))]">Total: <span className="font-semibold text-[hsl(var(--foreground))]">{minutesToHours(report.data.totalMinutes)}</span></p> : null}
      </div>
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
        emptyDescription="No hay sesiones de trabajo entre estas fechas."
      />
    </div>
  )
}

function ComplianceTab({ lookups }) {
  const [day, setDay] = useState(() => dayOffset(0))
  // For today, evaluate "now"; for past days, the end of that day.
  const query = useMemo(() => {
    const end = dayEndIso(day)
    return { from: dayStartIso(day), to: end, at: day === toLocalIso() ? new Date().toISOString() : end }
  }, [day])
  const report = useComplianceReport(query)

  const columns = useMemo(() => [
    { id: 'quota', header: 'Cuota', accessorFn: (r) => quotaTitle(r, lookups), cell: ({ row }) => <span className="font-medium">{quotaTitle(row.original, lookups)}</span> },
    { id: 'required', header: 'Requeridos', accessorFn: (r) => r.required },
    { id: 'present', header: 'Presentes', accessorFn: (r) => r.present },
    { id: 'attended', header: 'Asistieron en el día', accessorFn: (r) => r.attended },
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
      <DateField label="Día" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
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

export default function AttendanceReports() {
  const lookups = useLookups()
  return (
    <PageShell>
      <PageHeader eyebrow="Asistencia" title="Reportes" description="Horas trabajadas por persona y cumplimiento de cuotas por día." />
      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours">Horas</TabsTrigger>
          <TabsTrigger value="compliance">Cumplimiento</TabsTrigger>
        </TabsList>
        <TabsContent value="hours" className="mt-4"><HoursTab lookups={lookups} /></TabsContent>
        <TabsContent value="compliance" className="mt-4"><ComplianceTab lookups={lookups} /></TabsContent>
      </Tabs>
    </PageShell>
  )
}
