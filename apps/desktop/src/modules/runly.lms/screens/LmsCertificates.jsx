import { useMemo, useState } from 'react'
import {
  Badge, Button, ConfirmDialog, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, PageHeader,
} from '@runly/ui'
import { AlertTriangle, Award, Ban, Download, FileText, MoreHorizontal, Palette, Pencil, RefreshCw, RotateCcw, Upload, WandSparkles } from 'lucide-react'
import { CertificateTemplateSheet } from '../components/certificates/CertificateTemplateSheet.jsx'
import { CertSuggestDialog } from '../components/certificates/CertSuggestDialog.jsx'
import { CertDocxReference, OfficeNotice } from '../components/certificates/DocxTemplateNotes.jsx'
import { DocxTemplateSheet } from '../components/certificates/DocxTemplateSheet.jsx'
import { DocxUploadSheet } from '../components/certificates/DocxUploadSheet.jsx'
import { PageShell } from '../components/shared.jsx'
import { useDisableCertificateTemplate, useEnableCertificateTemplate } from '../hooks/useLmsCerts.js'
import { useCertificateTemplatesInfo, useDownloadCertificateDocx } from '../hooks/useLmsCertDocx.js'
import { isDocxTemplate } from '../lib/lmsCert.js'
import { formatShortDate } from '../lib/lmsLabels.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

function SourceCell({ template }) {
  if (!isDocxTemplate(template)) return <Badge variant="outline">Diseño integrado</Badge>
  const warnings = template.warnings ?? []
  return (
    <span className="flex items-center gap-2">
      <Badge variant="secondary">Word</Badge>
      {template.tagCount === 0 ? <Badge variant="warning">Sin etiquetas</Badge> : null}
      {warnings.length && template.tagCount !== 0 ? (
        <span title={warnings.join('\n')} className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />{warnings.length}
        </span>
      ) : null}
    </span>
  )
}

// Certificados: templates a course can use to issue certificates on completion,
// either the built-in design or the company's own Word file.
export default function LmsCertificates() {
  const info = useCertificateTemplatesInfo()
  const disable = useDisableCertificateTemplate(), enable = useEnableCertificateTemplate(), download = useDownloadCertificateDocx()
  const [editing, setEditing] = useState(null) // null closed, {} new design, template to edit
  const [editingDocxId, setEditingDocxId] = useState(null)
  const [uploadFor, setUploadFor] = useState(null) // null closed, {} new Word template, template to replace
  const [suggesting, setSuggesting] = useState(null)
  const [disableFor, setDisableFor] = useState(null)
  const rows = useMemo(() => info.data?.templates ?? [], [info.data])
  const officeAvailable = info.data?.officeAvailable ?? true
  const hasDocx = rows.some((t) => isDocxTemplate(t) && t.enabled !== false)
  const editingDocx = rows.find((t) => t.id === editingDocxId) ?? null

  async function confirmDisable() {
    try {
      await disable.mutateAsync(disableFor.id)
      setDisableFor(null)
    } catch { /* toast shown by the mutation (IN_USE included) */ }
  }

  const openEditor = (template) => (isDocxTemplate(template) ? setEditingDocxId(template.id) : setEditing(template))

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Plantilla', accessorFn: (t) => `${t.name} ${t.title ?? ''}`,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-8 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: isDocxTemplate(row.original) ? 'hsl(var(--muted-foreground))' : row.original.accentColor || 'hsl(var(--primary))' }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{row.original.name}</p>
            <p className={`${MUTED} truncate`}>{isDocxTemplate(row.original) ? 'Archivo de Word de la empresa' : row.original.title}</p>
          </div>
        </div>
      ),
    },
    { id: 'source', header: 'Tipo', accessorFn: (t) => (isDocxTemplate(t) ? 1 : 0), cell: ({ row }) => <SourceCell template={row.original} /> },
    { id: 'courses', header: 'Cursos', accessorFn: (t) => t.courseCount ?? 0, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> },
    {
      id: 'status', header: 'Estado', accessorFn: (t) => (t.enabled === false ? 1 : 0),
      cell: ({ row }) => (row.original.enabled === false ? <Badge variant="outline">Desactivada</Badge> : <Badge variant="success">Activa</Badge>),
    },
    { id: 'updated', header: 'Actualizada', accessorFn: (t) => t.updatedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.updatedAt)}</span> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => {
        const t = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${t.name}`}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openEditor(t)}><Pencil />Editar</DropdownMenuItem>
              {isDocxTemplate(t) ? (
                <>
                  {t.tagCount === 0 ? <DropdownMenuItem onSelect={() => setSuggesting(t)}><WandSparkles />Sugerir etiquetas</DropdownMenuItem> : null}
                  <DropdownMenuItem disabled={download.isPending} onSelect={() => download.mutate({ id: t.id, name: t.name })}><Download />Descargar para editar</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setUploadFor(t)}><RefreshCw />Reemplazar archivo</DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              {t.enabled === false ? (
                <DropdownMenuItem disabled={enable.isPending} onSelect={() => enable.mutate(t.id)}><RotateCcw />Activar</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setDisableFor(t)} className="text-[hsl(var(--destructive))]"><Ban />Desactivar</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [enable.isPending, download.isPending])

  const actions = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Button variant="outline" onClick={() => setEditing({})}><Palette />Diseño integrado</Button>
      <Button onClick={() => setUploadFor({})}><Upload />Subir plantilla de Word</Button>
    </div>
  )

  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Certificados"
        description="Plantillas de certificado. Asigna una a un curso en su Configuración y se emitirá al completarlo."
        actions={actions}
        className="mb-2 pb-0"
      />
      {hasDocx && !officeAvailable ? <OfficeNotice /> : null}
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(t) => t.id}
        isLoading={info.isLoading}
        isError={info.isError}
        onRetry={() => info.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar plantilla…"
        emptyIcon={Award}
        emptyTitle="Aún no hay plantillas"
        emptyDescription="Sube el certificado de tu empresa en Word o usa el diseño integrado. Cada certificado lleva folio y código QR de verificación."
        emptyAction={<Button onClick={() => setUploadFor({})}><Upload />Subir plantilla de Word</Button>}
      />
      <div className="flex flex-col gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span className={MUTED}>
          Para cambiar una plantilla de Word: descárgala, edítala respetando las etiquetas y usa «Reemplazar archivo». ¿Empiezas desde cero? Descarga el ejemplo con todas las etiquetas.
        </span>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => download.mutate({})} disabled={download.isPending}>
          <FileText />Descargar ejemplo
        </Button>
      </div>
      <CertDocxReference />

      <CertificateTemplateSheet
        open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}
        template={editing?.id ? editing : null}
      />
      <DocxTemplateSheet
        open={Boolean(editingDocx)} onOpenChange={(open) => { if (!open) setEditingDocxId(null) }}
        template={editingDocx} officeAvailable={officeAvailable} onReplace={setUploadFor} onSuggest={setSuggesting}
      />
      <DocxUploadSheet
        open={Boolean(uploadFor)} onOpenChange={(open) => { if (!open) setUploadFor(null) }}
        template={uploadFor?.id ? uploadFor : null}
        onUploaded={(saved) => {
          // A new file without tags goes straight to "Sugerir etiquetas".
          if (!uploadFor?.id && saved?.id && saved.tagCount === 0) { setUploadFor(null); setSuggesting(saved) }
        }}
      />
      <CertSuggestDialog template={suggesting} onOpenChange={(open) => { if (!open) setSuggesting(null) }} />
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
