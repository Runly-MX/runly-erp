import { useMemo, useState } from 'react'
import { DownloadCloud, KeyRound, Pencil, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, ConfirmDialog, DataTable, PageHeader } from '@runly/ui'
import { PersonCredentialsSheet } from '../components/PersonCredentialsSheet.jsx'
import { PersonSheet } from '../components/PersonSheet.jsx'
import { PageShell } from '../components/shared.jsx'
import { useAttendancePermissions, useImportFromHr, usePeople } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { KIND_LABELS, KIND_OPTIONS, fullName } from '../lib/attendanceLabels.js'

export default function AttendancePeople() {
  const people = usePeople({ limit: 1000 })
  const lookups = useLookups()
  const { canManagePeople } = useAttendancePermissions()
  const importHr = useImportFromHr()
  const [editing, setEditing] = useState({ open: false, person: null })
  const [credentialsId, setCredentialsId] = useState(null)
  const [confirmImport, setConfirmImport] = useState(false)

  const rows = useMemo(() => people.data ?? [], [people.data])
  const credentialsPerson = rows.find((p) => p.id === credentialsId) ?? null

  const columns = useMemo(() => [
    {
      id: 'person', header: 'Persona', accessorFn: (p) => `${p.code} ${fullName(p)}`,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{fullName(row.original)}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{row.original.code}</p>
        </div>
      ),
    },
    { id: 'kind', header: 'Tipo', accessorFn: (p) => KIND_LABELS[p.kind] ?? p.kind, cell: ({ row }) => <Badge variant="secondary">{KIND_LABELS[row.original.kind] ?? row.original.kind}</Badge> },
    { id: 'group', header: 'Grupo', accessorFn: (p) => lookups.groups.get(p.groupId) ?? '—' },
    { id: 'category', header: 'Categoría', accessorFn: (p) => lookups.categories.get(p.categoryId) ?? '—' },
    { id: 'shift', header: 'Turno', accessorFn: (p) => lookups.shifts.get(p.shiftId) ?? '—' },
    {
      id: 'access', header: 'Acceso', enableSorting: false,
      cell: ({ row }) => {
        const p = row.original
        const cards = (p.credentials ?? []).filter((c) => c.type === 'card').length
        const phones = (p.credentials ?? []).length - cards
        return (
          <div className="flex flex-wrap gap-1">
            {p.hasPin ? <Badge variant="outline">PIN</Badge> : null}
            {cards ? <Badge variant="outline">{cards} tarjeta{cards > 1 ? 's' : ''}</Badge> : null}
            {phones ? <Badge variant="outline">Teléfono</Badge> : null}
            {p.enrollPending ? <Badge variant="warning">Invitación pendiente</Badge> : null}
            {!p.hasPin && !(p.credentials ?? []).length && !p.enrollPending ? <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin credenciales</span> : null}
          </div>
        )
      },
    },
    { id: 'status', header: 'Estado', accessorFn: (p) => (p.enabled === false ? 'Inactivo' : 'Activo'), cell: ({ row }) => <Badge variant={row.original.enabled === false ? 'secondary' : 'success'}>{row.original.enabled === false ? 'Inactivo' : 'Activo'}</Badge> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label="Credenciales" onClick={() => setCredentialsId(row.original.id)}><KeyRound className="h-4 w-4" /></Button>
          {canManagePeople ? <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => setEditing({ open: true, person: row.original })}><Pencil className="h-4 w-4" /></Button> : null}
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
      <PageHeader
        eyebrow="Asistencia"
        title="Personas"
        description="Empleados, contratistas y visitantes que registran entradas y salidas."
        actions={canManagePeople ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirmImport(true)}><DownloadCloud className="h-4 w-4" />Importar desde RH</Button>
            <Button onClick={() => setEditing({ open: true, person: null })}><Plus className="h-4 w-4" />Nueva persona</Button>
          </div>
        ) : null}
      />
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
      />

      <PersonSheet open={editing.open} onOpenChange={(open) => setEditing((e) => ({ ...e, open }))} person={editing.person} lookups={lookups} />
      <PersonCredentialsSheet person={credentialsPerson} onClose={() => setCredentialsId(null)} canManage={canManagePeople} />
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
