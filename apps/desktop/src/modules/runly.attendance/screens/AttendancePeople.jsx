import { ExportButton } from '../components/ExportButton.jsx'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, DownloadCloud, FileUp, KeyRound, Pencil, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, ConfirmDialog, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, PersonAvatar } from '@runly/ui'
import { hrName } from '../components/HrLinkPanel.jsx'
import { PeopleImportDialog } from '../components/import/PeopleImportDialog.jsx'
import { PersonCredentialsSheet } from '../components/PersonCredentialsSheet.jsx'
import { AccessChips, HrBadge, KIND_TONES, PersonCard } from '../components/PersonCard.jsx'
import { PersonSheet } from '../components/PersonSheet.jsx'
import { PageShell, ScreenHeader, ToneBadge } from '../components/shared.jsx'
import { useAttendancePermissions, useImportFromHr, usePeople } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { KIND_LABELS, KIND_OPTIONS, fullName } from '../lib/attendanceLabels.js'

const VIEW_MODES = ['table', 'cards']
const STATUS_OPTIONS = [{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }]
const HR_OPTIONS = [{ value: 'yes', label: 'Vinculada a RH' }, { value: 'no', label: 'Sin vínculo con RH' }]
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

  // Derived fields so the toolbar filters can work on computed values.
  const rows = useMemo(() => (people.data ?? []).map((p) => ({
    ...p, statusKey: p.enabled === false ? 'inactive' : 'active', hrLinked: p.hr ? 'yes' : 'no',
  })), [people.data])
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
      cell: ({ row }) => <HrBadge hr={row.original.hr} />,
    },
    {
      id: 'access', header: 'Acceso', enableSorting: false,
      cell: ({ row }) => <AccessChips person={row.original} />,
    },
    {
      id: 'status', header: 'Estado', accessorFn: (p) => (p.enabled === false ? 'Inactivo' : 'Activo'),
      cell: ({ row }) => <Badge variant={row.original.enabled === false ? 'secondary' : 'success'}>{row.original.enabled === false ? 'Inactivo' : 'Activo'}</Badge>,
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Acceso: PIN, tarjeta y teléfono" title="Acceso: PIN, tarjeta y teléfono" onClick={() => setCredentialsId(row.original.id)}><KeyRound className="h-4 w-4" /></Button>
          {canManagePeople ? <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Editar" onClick={() => setEditing({ open: true, personId: row.original.id })}><Pencil className="h-4 w-4" /></Button> : null}
        </div>
      ),
    },
  ], [lookups, canManagePeople])

  const filters = useMemo(() => [
    { key: 'kind', label: 'Tipo', options: KIND_OPTIONS },
    { key: 'groupId', label: 'Grupo', options: lookups.rows.groups.map((g) => ({ value: g.id, label: g.name })) },
    { key: 'categoryId', label: 'Categoría', options: lookups.rows.categories.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'statusKey', label: 'Estado', options: STATUS_OPTIONS },
    { key: 'hrLinked', label: 'RH', options: HR_OPTIONS },
  ], [lookups.rows.groups, lookups.rows.categories])

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
        viewModes={VIEW_MODES}
        viewStorageKey="attendance-people"
        renderCard={(person) => (
          <PersonCard
            person={person}
            lookups={lookups}
            canManage={canManagePeople}
            onCredentials={setCredentialsId}
            onEdit={(personId) => setEditing({ open: true, personId })}
          />
        )}
        searchPlaceholder="Buscar por nombre o código…"
        emptyIcon={Users}
        emptyTitle="Aún no hay personas"
        emptyDescription="Crea personas manualmente o impórtalas desde Recursos Humanos."
        emptyAction={canManagePeople ? { label: 'Nueva persona', onClick: () => setEditing({ open: true, personId: null }) } : undefined}
        toolbarActions={(
          <>
            <ExportButton kind="people" fileName="personas-asistencia" label="Exportar" />
            {canManagePeople ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline"><FileUp className="h-4 w-4" />Importar<ChevronDown className="h-3.5 w-3.5 opacity-60" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setConfirmImport(true)}><DownloadCloud className="h-4 w-4" />Importar desde RH</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar desde archivo</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canManagePeople ? <Button onClick={() => setEditing({ open: true, personId: null })}><Plus className="h-4 w-4" />Nueva persona</Button> : null}
          </>
        )}
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
