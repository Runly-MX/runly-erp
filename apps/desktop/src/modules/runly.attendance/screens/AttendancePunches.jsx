import { useMemo, useState } from 'react'
import { Ban, ClipboardList, Plus } from 'lucide-react'
import { Badge, Button, CheckboxField, ComboboxField, ConfirmDialog, DataTable, DateField, PageHeader, TextField } from '@runly/ui'
import { ManualPunchDialog } from '../components/ManualPunchDialog.jsx'
import { PageShell } from '../components/shared.jsx'
import { useAttendancePermissions, useKiosks, usePeople, usePunches, useVoidPunch } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import {
  DIRECTION_LABELS, dayEndIso, dayStartIso, flagLabel, flagVariant, formatDateTime, fullName, methodLabel,
} from '../lib/attendanceLabels.js'

export default function AttendancePunches() {
  const [filters, setFilters] = useState({ from: '', to: '', personId: null, flaggedOnly: false })
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
    from: dayStartIso(filters.from), to: dayEndIso(filters.to),
    personId: filters.personId || undefined, status: filters.flaggedOnly ? 'flagged' : undefined,
  }), [filters])
  const punches = usePunches(query)

  const kioskNames = useMemo(() => new Map((kiosks.data ?? []).map((k) => [k.id, k.name])), [kiosks.data])
  const personOptions = useMemo(() => (people.data ?? []).map((p) => ({ value: p.id, label: `${fullName(p)} (${p.code})` })), [people.data])
  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const columns = useMemo(() => [
    { id: 'when', header: 'Fecha y hora', accessorFn: (p) => p.occurredAt, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.occurredAt)}</span> },
    {
      id: 'person', header: 'Persona', accessorFn: (p) => fullName(p.person),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{fullName(row.original.person)}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{row.original.person?.code}</p>
        </div>
      ),
    },
    {
      id: 'direction', header: 'Dirección', accessorFn: (p) => DIRECTION_LABELS[p.direction] ?? p.direction,
      cell: ({ row }) => <Badge variant={row.original.direction === 'in' ? 'success' : 'secondary'}>{DIRECTION_LABELS[row.original.direction] ?? row.original.direction}</Badge>,
    },
    { id: 'method', header: 'Método', accessorFn: (p) => methodLabel(p.method) },
    {
      id: 'origin', header: 'Kiosko / sitio',
      accessorFn: (p) => [kioskNames.get(p.kioskId), lookups.sites.get(p.siteId)].filter(Boolean).join(' · ') || '—',
    },
    {
      id: 'flags', header: 'Marcas', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex flex-wrap gap-1">
            {p.status === 'voided' ? <Badge variant="destructive">Anulada</Badge> : null}
            {(p.flags ?? []).map((flag) => <Badge key={flag} variant={flagVariant(flag)}>{flagLabel(flag)}</Badge>)}
          </div>
        )
      },
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (canManagePunches && row.original.status !== 'voided' ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" aria-label="Anular checada" onClick={() => { setVoidNote(''); setToVoid(row.original) }}><Ban className="h-4 w-4" /></Button>
        </div>
      ) : null),
    },
  ], [kioskNames, lookups.sites, canManagePunches])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asistencia"
        title="Checadas"
        description="Entradas y salidas registradas en kioskos, con las marcas de seguridad que detectó el sistema."
        actions={canManagePunches ? <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" />Checada manual</Button> : null}
      />

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DateField label="Desde" value={filters.from} onChange={(e) => set('from')(e.target.value)} />
        <DateField label="Hasta" value={filters.to} onChange={(e) => set('to')(e.target.value)} />
        <ComboboxField label="Persona" options={personOptions} value={filters.personId} onChange={set('personId')} clearable placeholder="Todas las personas" />
        <CheckboxField id="att-flagged" checked={filters.flaggedOnly} onChange={set('flaggedOnly')}>Solo marcadas</CheckboxField>
      </div>

      <DataTable
        columns={columns}
        data={punches.data ?? []}
        getRowId={(p) => p.id}
        isLoading={punches.isLoading}
        isError={punches.isError}
        onRetry={() => punches.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar en los resultados…"
        emptyIcon={ClipboardList}
        emptyTitle="Sin checadas"
        emptyDescription="No hay checadas con estos filtros."
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
