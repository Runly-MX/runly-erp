import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, DownloadCloud, FileUp, KeyRound, Link2, Pencil, Plus, Smartphone, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, ConfirmDialog, DataTable, PersonAvatar } from '@runly/ui'
import { hrExpedienteUrl, hrName } from '../components/HrLinkPanel.jsx'
import { PeopleImportDialog } from '../components/import/PeopleImportDialog.jsx'
import { PersonCredentialsSheet } from '../components/PersonCredentialsSheet.jsx'
import { PersonSheet } from '../components/PersonSheet.jsx'
import { PageShell, ScreenHeader, ToneBadge } from '../components/shared.jsx'
import { useAttendancePermissions, useImportFromHr, usePeople } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { KIND_LABELS, KIND_OPTIONS, fullName } from '../lib/attendanceLabels.js'

const KIND_TONES = { internal: 'teal', contractor: 'amber', visitor: 'violet' }
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

export default function AttendancePeople() {
  const people = usePeople({ limit: 1000 })
  const lookups = useLookups()
  const queryClient = useQueryClient()
  const { canManagePeople } = useAttendancePermissions()
  const importHr = useImportFromHr()
  const [editing, setEditing] = useState({ open: false, personId: null })
  const [credentialsId, setCredentialsId] = useState(null)
  const [confirmImport, setConfirmImport] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const rows = useMemo(() => people.data ?? [], [people.data])
  const credentialsPerson = rows.find((p) => p.id === credentialsId) ?? null
  const editingPerson = rows.find((p) => p.id === editing.personId) ?? null

  const columns = useMemo(() => [
    {
      id: 'person', header: 'Persona', accessorFn: (p) => `${p.code} ${fullName(p)}`,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={fullName(row.original)} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{fullName(row.original)}</p>
            <p className={`${MUTED} tabular-nums`}>{row.original.code}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'kind', header: 'Tipo', accessorFn: (p) => KIND_LABELS[p.kind] ?? p.kind,
      cell: ({ row }) => <ToneBadge tone={KIND_TONES[row.original.kind] ?? 'slate'}>{KIND_LABELS[row.original.kind] ?? row.original.kind}</ToneBadge>,
    },
    { id: 'group', header: 'Grupo', accessorFn: (p) => lookups.groups.get(p.groupId) ?? '—' },
    { id: 'category', header: 'Categoría', accessorFn: (p) => lookups.categories.get(p.categoryId) ?? '—' },
    { id: 'shift', header: 'Turno', accessorFn: (p) => lookups.shifts.get(p.shiftId) ?? '—' },
    {
      id: 'hr', header: 'RH', accessorFn: (p) => (p.hr ? hrName(p.hr) : ''),
      cell: ({ row }) => {
        const hr = row.original.hr
        if (!hr) return <span className={MUTED}>—</span>
        return (
          <Link to={hrExpedienteUrl(hr.id)} title={`Abrir expediente de ${hrName(hr)}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <ToneBadge tone="teal" icon={Link2}>{hr.employeeCode || 'RH'}</ToneBadge>
          </Link>
        )
      },
    },
    {
      id: 'access', header: 'Acceso', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original
        const cards = (p.credentials ?? []).filter((c) => c.type === 'card').length
        const phones = (p.credentials ?? []).length - cards
        return (
          <div className="flex flex-wrap gap-1">
            {p.hasPin ? <ToneBadge tone="blue" icon={KeyRound}>PIN</ToneBadge> : null}
            {cards ? <ToneBadge tone="violet" icon={CreditCard}>{cards} tarjeta{cards > 1 ? 's' : ''}</ToneBadge> : null}
            {phones ? <ToneBadge tone="teal" icon={Smartphone}>Teléfono</ToneBadge> : null}
            {p.enrollPending ? <ToneBadge tone="amber">Invitación pendiente</ToneBadge> : null}
            {!p.hasPin && !(p.credentials ?? []).length && !p.enrollPending ? <span className={MUTED}>Sin credenciales</span> : null}
          </div>
        )
      },
    },
    {
      id: 'status', header: 'Estado', accessorFn: (p) => (p.enabled === false ? 'Inactivo' : 'Activo'),
      cell: ({ row }) => <Badge variant={row.original.enabled === false ? 'secondary' : 'success'}>{row.original.enabled === false ? 'Inactivo' : 'Activo'}</Badge>,
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Credenciales" onClick={() => setCredentialsId(row.original.id)}><KeyRound className="h-4 w-4" /></Button>
          {canManagePeople ? <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Editar" onClick={() => setEditing({ open: true, personId: row.original.id })}><Pencil className="h-4 w-4" /></Button> : null}
        </div>
      ),
    },
  ], [lookups, canManagePeople])

  const filters = useMemo(() => [
    { key: 'kind', label: 'Tipo', options: KIND_OPTIONS },
    { key: 'groupId', label: 'Grupo', options: lookups.rows.groups.map((g) => ({ value: g.id, label: g.name })) },
  ], [lookups.rows.groups])

  async function runImport() {
    try {
      const result = await importHr.mutateAsync()
      toast.success(result.created ? `Se importaron ${result.created} personas desde RH.` : 'No hay personas nuevas para importar.')
      setConfirmImport(false)
    } catch { /* toast shown */ }
  }

  return (
    <PageShell>
      <ScreenHeader title="Personas" description="Empleados, contratistas y visitantes que registran entradas y salidas." />
      <DataTable
        columns={columns}
        data={rows}
        filters={filters}
        getRowId={(p) => p.id}
        isLoading={people.isLoading}
        isError={people.isError}
        onRetry={() => people.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar por nombre o código…"
        emptyIcon={Users}
        emptyTitle="Aún no hay personas"
        emptyDescription="Crea personas manualmente o impórtalas desde Recursos Humanos."
        emptyAction={canManagePeople ? { label: 'Nueva persona', onClick: () => setEditing({ open: true, personId: null }) } : undefined}
        toolbarActions={canManagePeople ? (
          <>
            <Button variant="outline" onClick={() => setConfirmImport(true)}><DownloadCloud className="h-4 w-4" />Importar desde RH</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar</Button>
            <Button onClick={() => setEditing({ open: true, personId: null })}><Plus className="h-4 w-4" />Nueva persona</Button>
          </>
        ) : null}
      />

      <PersonSheet open={editing.open} onOpenChange={(open) => setEditing((e) => ({ ...e, open }))} person={editingPerson} lookups={lookups} canManage={canManagePeople} />
      <PersonCredentialsSheet person={credentialsPerson} onClose={() => setCredentialsId(null)} canManage={canManagePeople} />
      <PeopleImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => queryClient.invalidateQueries({ queryKey: ['attendance', 'people'] })} />
      <ConfirmDialog
        open={confirmImport}
        onOpenChange={setConfirmImport}
        title="Importar desde RH"
        description="Se crearán personas para los empleados activos de Recursos Humanos que aún no existan en Asistencia."
        confirmLabel="Importar"
        loading={importHr.isPending}
        onConfirm={runImport}
      />
    </PageShell>
  )
}
