import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { Button, DataTable, StatStrip } from '@runly/ui'
import { useAttendancePermissions, useDaysReport } from '../hooks/useAttendanceData.js'
import { useUrlRange } from '../hooks/useUrlRange.js'
import { toLocalIso } from '../../../lib/localDate.js'
import { fullName } from '../lib/attendanceLabels.js'
import { formatHm } from '../lib/shiftSchedule.js'
import { DayDetailSheet } from './DayDetailSheet.jsx'
import { ExportButton } from './ExportButton.jsx'
import { PersonCell } from './PersonCell.jsx'
import { ToneBadge } from './shared.jsx'

const VIEW_MODES = ['table', 'cards']

// Monday of the current week and today, as local YYYY-MM-DD.
function currentWeek() {
  const now = new Date()
  const back = (now.getDay() + 6) % 7
  return { from: toLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)), to: toLocalIso(now) }
}

const hm = (minutes) => <span className="whitespace-nowrap tabular-nums">{formatHm(minutes)}</span>
const count = (n, tone) => (n ? <ToneBadge tone={tone}>{n}</ToneBadge> : <span className="text-[hsl(var(--muted-foreground))]">0</span>)

// "Asistencia diaria" tab: hours per person (regular / overtime / late / absent) for a period,
// with a day-by-day sheet where overtime can be approved.
export function DailyHoursReport({ lookups }) {
  const [range, setRange] = useUrlRange(currentWeek())
  const [groupId, setGroupId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const { canManagePunches } = useAttendancePermissions()
  const query = useMemo(() => ({ from: range.from, to: range.to, groupId: groupId || undefined, categoryId: categoryId || undefined }), [range, groupId, categoryId])
  const report = useDaysReport(query, { enabled: Boolean(range.from && range.to) })
  const rows = report.data?.rows ?? []
  const totals = report.data?.totals
  const selected = rows.find((r) => r.person.id === selectedId) ?? null

  const filters = useMemo(() => [
    { key: 'range', label: 'Periodo', type: 'daterange', fromKey: 'from', toKey: 'to', value: range, onChange: setRange },
    { key: 'groupId', label: 'Grupo', type: 'combobox', options: lookups.rows.groups.map((g) => ({ value: g.id, label: g.name })), searchPlaceholder: 'Buscar grupo…', allLabel: 'Todos los grupos', value: groupId, onChange: (v) => setGroupId(v || '') },
    { key: 'categoryId', label: 'Categoría', type: 'combobox', options: lookups.rows.categories.map((c) => ({ value: c.id, label: c.name })), searchPlaceholder: 'Buscar categoría…', allLabel: 'Todas las categorías', value: categoryId, onChange: (v) => setCategoryId(v || '') },
  ], [range, setRange, groupId, categoryId, lookups.rows.groups, lookups.rows.categories])

  const stats = useMemo(() => [
    { key: 'worked', label: 'Horas trabajadas', icon: 'Clock', value: formatHm(totals?.workedMinutes) },
    { key: 'regular', label: 'Ordinarias', icon: 'Timer', value: formatHm(totals?.regularMinutes) },
    { key: 'overtime', label: 'Extras', icon: 'TrendingUp', value: formatHm(totals?.countedOvertimeMinutes) },
    { key: 'pending', label: 'Extras por aprobar', icon: 'Hourglass', value: formatHm(totals?.pendingOvertimeMinutes) },
    { key: 'late', label: 'Retardos', icon: 'AlarmClock', value: totals?.lateDays ?? 0 },
    { key: 'absent', label: 'Faltas', icon: 'UserX', value: totals?.absentDays ?? 0 },
  ], [totals])

  const columns = useMemo(() => [
    {
      id: 'person', header: 'Persona', accessorFn: (r) => `${r.person.code ?? ''} ${fullName(r.person)}`,
      cell: ({ row }) => (
        <button type="button" onClick={() => setSelectedId(row.original.person.id)} className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <PersonCell person={row.original.person} />
        </button>
      ),
    },
    { id: 'days', header: 'Días trabajados', accessorFn: (r) => r.totals.daysWorked, cell: ({ row }) => <span className="tabular-nums">{row.original.totals.daysWorked}</span> },
    { id: 'expected', header: 'Esperadas', accessorFn: (r) => r.totals.expectedMinutes, cell: ({ row }) => hm(row.original.totals.expectedMinutes) },
    { id: 'worked', header: 'Trabajadas', accessorFn: (r) => r.totals.workedMinutes, cell: ({ row }) => <span className="font-medium">{hm(row.original.totals.workedMinutes)}</span> },
    {
      id: 'overtime', header: 'Extras', accessorFn: (r) => r.totals.countedOvertimeMinutes,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {hm(row.original.totals.countedOvertimeMinutes)}
          {row.original.totals.pendingOvertimeMinutes ? <ToneBadge tone="amber">+{formatHm(row.original.totals.pendingOvertimeMinutes)} por aprobar</ToneBadge> : null}
        </div>
      ),
    },
    { id: 'late', header: 'Retardos', accessorFn: (r) => r.totals.lateDays, cell: ({ row }) => count(row.original.totals.lateDays, 'amber') },
    { id: 'early', header: 'Salidas tempranas', accessorFn: (r) => r.totals.earlyLeaveDays, cell: ({ row }) => count(row.original.totals.earlyLeaveDays, 'amber') },
    { id: 'absent', header: 'Faltas', accessorFn: (r) => r.totals.absentDays, cell: ({ row }) => count(row.original.totals.absentDays, 'rose') },
    {
      id: 'detail', header: '', enableSorting: false,
      cell: ({ row }) => <Button variant="ghost" size="sm" className="max-sm:h-11" aria-label={`Ver detalle de ${fullName(row.original.person)}`} onClick={() => setSelectedId(row.original.person.id)}><ChevronRight className="h-4 w-4" /></Button>,
    },
  ], [])

  return (
    <div className="space-y-4">
      <StatStrip items={stats} />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.person.id}
        isLoading={report.isLoading}
        isError={report.isError}
        onRetry={() => report.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar persona…"
        filters={filters}
        viewModes={VIEW_MODES}
        viewStorageKey="attendance-report-days"
        renderCard={(r) => (
          <button type="button" onClick={() => setSelectedId(r.person.id)} className="flex h-full w-full flex-col gap-3 rounded-2xl surface-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <PersonCell person={r.person} size="md" />
            <p className="text-2xl font-bold tabular-nums">{formatHm(r.totals.workedMinutes)} <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">de {formatHm(r.totals.expectedMinutes)}</span></p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[hsl(var(--muted-foreground))]">{r.totals.daysWorked} {r.totals.daysWorked === 1 ? 'día' : 'días'}</span>
              {r.totals.countedOvertimeMinutes ? <ToneBadge tone="teal">Extras {formatHm(r.totals.countedOvertimeMinutes)}</ToneBadge> : null}
              {r.totals.pendingOvertimeMinutes ? <ToneBadge tone="amber">Por aprobar {formatHm(r.totals.pendingOvertimeMinutes)}</ToneBadge> : null}
              {r.totals.lateDays ? <ToneBadge tone="amber">{r.totals.lateDays} {r.totals.lateDays === 1 ? 'retardo' : 'retardos'}</ToneBadge> : null}
              {r.totals.earlyLeaveDays ? <ToneBadge tone="amber">{r.totals.earlyLeaveDays} {r.totals.earlyLeaveDays === 1 ? 'salida temprana' : 'salidas tempranas'}</ToneBadge> : null}
              {r.totals.absentDays ? <ToneBadge tone="rose">{r.totals.absentDays} {r.totals.absentDays === 1 ? 'falta' : 'faltas'}</ToneBadge> : null}
            </div>
          </button>
        )}
        emptyIcon={CalendarDays}
        emptyTitle="Sin horas en este periodo"
        emptyDescription="No hay checadas ni días esperados entre estas fechas. Prueba con otro periodo (máximo 93 días)."
        toolbarActions={<ExportButton kind="days" query={query} fileName={`asistencia-diaria-${range.from || 'inicio'}_${range.to || 'hoy'}`} variant="default" disabled={!rows.length} />}
      />
      <DayDetailSheet row={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)} canReview={canManagePunches} />
    </div>
  )
}
