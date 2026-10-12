import { useMemo, useState } from 'react'
import { Ban, ClipboardList, Flag, Plus } from 'lucide-react'
import { Badge, Button, ComboboxField, ConfirmDialog, DataTable, DateRangeFilter, PersonAvatar, TextField, ToggleFilter } from '@runly/ui'
import { ManualPunchDialog } from '../components/ManualPunchDialog.jsx'
import { ExportButton } from '../components/ExportButton.jsx'
import { PunchSelfie } from '../components/PunchSelfie.jsx'
import { PageShell, ScreenHeader, ToneBadge } from '../components/shared.jsx'
import { useAttendancePermissions, useKiosks, usePeople, usePunches, useVoidPunch } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { useUrlRange } from '../hooks/useUrlRange.js'
import {
  DIRECTION_LABELS, METHOD_LABELS, dayEndIso, dayStartIso, flagLabel, flagTone, formatDateTime, fullName, methodLabel,
} from '../lib/attendanceLabels.js'

const VIEW_MODES = ['table', 'cards']

function PunchFlags({ punch: p }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <PunchSelfie url={p.selfieUrl} caption={`${fullName(p.person)} · ${formatDateTime(p.occurredAt)}`} />
      {p.status === 'voided' ? <ToneBadge tone="rose" icon={Ban}>Anulada</ToneBadge> : null}
      {(p.flags ?? []).map((flag) => <ToneBadge key={flag} tone={flagTone(flag)} icon={Flag}>{flagLabel(flag)}</ToneBadge>)}
      {p.status !== 'voided' && !(p.flags ?? []).length ? <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span> : null}
    </div>
  )
}

export default function AttendancePunches() {
  const [range, setRange] = useUrlRange({ from: '', to: '' })
  const [filters, setFilters] = useState({ personId: null, flaggedOnly: false })
  const [manualOpen, setManualOpen] = useState(false)
  const [toVoid, setToVoid] = useState(null)
  const [voidNote, setVoidNote] = useState('')
  const { canManagePunches } = useAttendancePermissions()
  const lookups = useLookups()
  const people = usePeople({ limit: 1000 })
  const kiosks = useKiosks()
  const voidPunch = useVoidPunch()

  const query = useMemo(() => ({
    limit: 500,
    from: dayStartIso(range.from), to: dayEndIso(range.to),
    personId: filters.personId || undefined, status: filters.flaggedOnly ? 'flagged' : undefined,
  }), [filters, range])
  const punches = usePunches(query)

  const kioskNames = useMemo(() => new Map((kiosks.data ?? []).map((k) => [k.id, k.name])), [kiosks.data])
  const personOptions = useMemo(() => (people.data ?? []).map((p) => ({ value: p.id, label: `${fullName(p)} (${p.code})` })), [people.data])
  // Derived fields so the toolbar filters work on computed values.
  const rows = useMemo(() => (punches.data ?? []).map((p) => ({
    ...p, originLabel: [kioskNames.get(p.kioskId), lookups.sites.get(p.siteId)].filter(Boolean).join(' · ') || '—',
  })), [punches.data, kioskNames, lookups.sites])
  const tableFilters = useMemo(() => [
    { key: 'direction', label: 'Dirección', options: Object.entries(DIRECTION_LABELS).map(([value, label]) => ({ value, label })) },
    { key: 'method', label: 'Método', options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) },
    { key: 'siteId', label: 'Sitio', options: lookups.rows.sites.map((s) => ({ value: s.id, label: s.name })) },
  ], [lookups.rows.sites])
  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const columns = useMemo(() => [
    { id: 'when', header: 'Fecha y hora', accessorFn: (p) => p.occurredAt, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.occurredAt)}</span> },
    {
      id: 'person', header: 'Persona', accessorFn: (p) => fullName(p.person),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={fullName(row.original.person)} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{fullName(row.original.person)}</p>
            <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{row.original.person?.code}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'direction', header: 'Dirección', accessorFn: (p) => DIRECTION_LABELS[p.direction] ?? p.direction,
      cell: ({ row }) => <Badge variant={row.original.direction === 'in' ? 'success' : 'secondary'}>{DIRECTION_LABELS[row.original.direction] ?? row.original.direction}</Badge>,
    },
    { id: 'method', header: 'Método', accessorFn: (p) => methodLabel(p.method) },
    {
      id: 'origin', header: 'Kiosko / sitio', accessorFn: (p) => p.originLabel,
    },
    { id: 'flags', header: 'Marcas', enableSorting: false, cell: ({ row }) => <PunchFlags punch={row.original} /> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (canManagePunches && row.original.status !== 'voided' ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Anular checada" onClick={() => { setVoidNote(''); setToVoid(row.original) }}><Ban className="h-4 w-4" /></Button>
        </div>
      ) : null),
    },
  ], [kioskNames, lookups.sites, canManagePunches])

  return (
    <PageShell>
      <ScreenHeader title="Checadas" description="Entradas y salidas registradas, con las marcas que detectó el sistema." />
      <DataTable
        columns={columns}
        data={rows}
        filters={tableFilters}
        getRowId={(p) => p.id}
        isLoading={punches.isLoading}
        isError={punches.isError}
        onRetry={() => punches.refetch()}
        pageSize={25}
        viewModes={VIEW_MODES}
        viewStorageKey="attendance-punches"
        renderCard={(p) => (
          <div className="flex h-full flex-col gap-3 rounded-2xl surface-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar name={fullName(p.person)} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-semibold leading-tight">{fullName(p.person)}</p>
                  <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{p.person?.code}</p>
                </div>
              </div>
              <Badge variant={p.direction === 'in' ? 'success' : 'secondary'}>{DIRECTION_LABELS[p.direction] ?? p.direction}</Badge>
            </div>
            <p className="text-sm tabular-nums">{formatDateTime(p.occurredAt)}</p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{methodLabel(p.method)} · {p.originLabel}</p>
            <PunchFlags punch={p} />
            {canManagePunches && p.status !== 'voided' ? (
              <div className="mt-auto flex justify-end">
                <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Anular checada" onClick={() => { setVoidNote(''); setToVoid(p) }}><Ban className="h-4 w-4" /></Button>
              </div>
            ) : null}
          </div>
        )}
        searchPlaceholder="Buscar en los resultados…"
        emptyIcon={ClipboardList}
        emptyTitle="Sin checadas"
        emptyDescription="No hay checadas con estos filtros. Prueba con otro rango de fechas."
        toolbarStart={(
          <>
            <DateRangeFilter filter={{ key: 'range', label: 'Fechas', fromKey: 'from', toKey: 'to' }} value={range} onChange={(next) => setRange({ from: next.from, to: next.to })} />
            <ComboboxField className="w-full sm:w-64" aria-label="Persona" options={personOptions} value={filters.personId} onChange={set('personId')} clearable placeholder="Todas las personas" />
            <ToggleFilter icon={Flag} label="Solo marcadas" checked={Boolean(filters.flaggedOnly)} onChange={set('flaggedOnly')} />
          </>
        )}
        toolbarActions={(
          <>
            <ExportButton kind="punches" query={query} fileName="checadas" label="Exportar" />
            {canManagePunches ? <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" />Checada manual</Button> : null}
          </>
        )}
      />

      <ManualPunchDialog open={manualOpen} onOpenChange={setManualOpen} people={people.data} lookups={lookups} />
      <ConfirmDialog
        open={Boolean(toVoid)}
        onOpenChange={(open) => !open && setToVoid(null)}
        title="Anular checada"
        description="La checada dejará de contar para presencia, horas y cuotas. El registro se conserva como anulado."
        detail={toVoid ? `${fullName(toVoid.person)} · ${formatDateTime(toVoid.occurredAt)}` : undefined}
        confirmLabel="Anular"
        loading={voidPunch.isPending}
        onConfirm={async () => { try { await voidPunch.mutateAsync({ id: toVoid.id, note: voidNote.trim() || undefined }); setToVoid(null) } catch { /* toast */ } }}
      >
        <TextField label="Motivo (opcional)" value={voidNote} onChange={(e) => setVoidNote(e.target.value)} />
      </ConfirmDialog>
    </PageShell>
  )
}
