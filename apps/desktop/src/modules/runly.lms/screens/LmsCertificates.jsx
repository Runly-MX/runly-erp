import { useMemo, useState } from 'react'
import {
  Badge, Button, ConfirmDialog, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, PageHeader,
} from '@runly/ui'
import { Award, Ban, MoreHorizontal, Pencil, Plus, RotateCcw } from 'lucide-react'
import { CertificateTemplateSheet } from '../components/certificates/CertificateTemplateSheet.jsx'
import { PageShell } from '../components/shared.jsx'
import { useCertificateTemplates, useDisableCertificateTemplate, useEnableCertificateTemplate } from '../hooks/useLmsCerts.js'
import { formatShortDate } from '../lib/lmsLabels.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Certificados: templates a course can use to issue certificates on completion.
export default function LmsCertificates() {
  const templates = useCertificateTemplates()
  const disable = useDisableCertificateTemplate(), enable = useEnableCertificateTemplate()
  const [editing, setEditing] = useState(null) // null closed, {} new, template to edit
  const [disableFor, setDisableFor] = useState(null)
  const rows = useMemo(() => templates.data ?? [], [templates.data])

  async function confirmDisable() {
    try {
      await disable.mutateAsync(disableFor.id)
      setDisableFor(null)
    } catch { /* toast shown by the mutation (IN_USE included) */ }
  }

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Plantilla', accessorFn: (t) => `${t.name} ${t.title ?? ''}`,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-8 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: row.original.accentColor || 'hsl(var(--primary))' }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{row.original.name}</p>
            <p className={`${MUTED} truncate`}>{row.original.title}</p>
          </div>
        </div>
      ),
    },
    { id: 'courses', header: 'Cursos', accessorFn: (t) => t.courseCount ?? 0, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> },
    {
      id: 'status', header: 'Estado', accessorFn: (t) => (t.enabled === false ? 1 : 0),
      cell: ({ row }) => (row.original.enabled === false ? <Badge variant="outline">Desactivada</Badge> : <Badge variant="success">Activa</Badge>),
    },
    { id: 'updated', header: 'Actualizada', accessorFn: (t) => t.updatedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.updatedAt)}</span> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(row.original)}><Pencil />Editar</DropdownMenuItem>
            {row.original.enabled === false ? (
              <DropdownMenuItem disabled={enable.isPending} onSelect={() => enable.mutate(row.original.id)}><RotateCcw />Activar</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setDisableFor(row.original)} className="text-[hsl(var(--destructive))]"><Ban />Desactivar</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [enable.isPending])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Certificados"
        description="Plantillas de certificado. Asigna una a un curso en su Configuración y se emitirá al completarlo."
        actions={<Button onClick={() => setEditing({})} className="w-full sm:w-auto"><Plus />Nueva plantilla</Button>}
        className="mb-2 pb-0"
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(t) => t.id}
        isLoading={templates.isLoading}
        isError={templates.isError}
        onRetry={() => templates.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar plantilla…"
        emptyIcon={Award}
        emptyTitle="Aún no hay plantillas"
        emptyDescription="Crea una plantilla para que tus cursos emitan certificados con folio y código QR de verificación."
        emptyAction={<Button onClick={() => setEditing({})}><Plus />Nueva plantilla</Button>}
      />
      <CertificateTemplateSheet
        open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}
        template={editing?.id ? editing : null}
      />
      <ConfirmDialog
        open={Boolean(disableFor)} onOpenChange={(open) => { if (!open) setDisableFor(null) }}
        icon={Ban}
        title="Desactivar plantilla"
        description={`«${disableFor?.name ?? ''}» dejará de aparecer al configurar cursos. Los certificados ya emitidos siguen siendo válidos.`}
        confirmLabel="Desactivar"
        loading={disable.isPending}
        onConfirm={confirmDisable}
      />
    </PageShell>
  )
}
