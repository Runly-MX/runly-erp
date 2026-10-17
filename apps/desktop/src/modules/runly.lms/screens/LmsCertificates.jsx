import { useMemo, useState } from 'react'
import {
  Badge, Button, ConfirmDialog, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, PageHeader,
} from '@runly/ui'
import {
  AlertTriangle, Award, Ban, ChevronDown, Download, FileText, FileType, LayoutTemplate, MoreHorizontal, Palette, Pencil, Plus, Presentation,
  RefreshCw, RotateCcw, WandSparkles,
} from 'lucide-react'
import { CertificateTemplateSheet } from '../components/certificates/CertificateTemplateSheet.jsx'
import { CertSuggestDialog } from '../components/certificates/CertSuggestDialog.jsx'
import { CertDocxReference, OfficeNotice } from '../components/certificates/DocxTemplateNotes.jsx'
import { PdfLayoutEditor } from '../components/certificates/PdfLayoutEditor.jsx'
import { TemplateFileSheet } from '../components/certificates/TemplateFileSheet.jsx'
import { TemplateUploadSheet } from '../components/certificates/TemplateUploadSheet.jsx'
import { PageShell } from '../components/shared.jsx'
import { useDisableCertificateTemplate, useEnableCertificateTemplate } from '../hooks/useLmsCerts.js'
import { useCertificateTemplatesInfo, useDownloadCertificateDocx } from '../hooks/useLmsCertDocx.js'
import { formatInfo, isFileTemplate, isPdfTemplate, isTaggedTemplate } from '../lib/lmsCert.js'
import { formatShortDate } from '../lib/lmsLabels.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const SUBTITLE = { docx: 'Archivo de Word de la empresa', pptx: 'Presentación de PowerPoint de la empresa', pdf: 'PDF de la empresa con campos colocados' }

function SourceCell({ template }) {
  if (!isFileTemplate(template)) return <Badge variant="outline">Diseño integrado</Badge>
  const warnings = template.warnings ?? []
  const empty = isPdfTemplate(template) ? template.fieldCount === 0 : template.tagCount === 0
  return (
    <span className="flex items-center gap-2">
      <Badge variant="secondary">{formatInfo(template.source).badge}</Badge>
      {empty ? <Badge variant="warning">{isPdfTemplate(template) ? 'Sin campos' : 'Sin etiquetas'}</Badge> : null}
      {warnings.length && !empty ? (
        <span title={warnings.join('\n')} className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />{warnings.length}
        </span>
      ) : null}
    </span>
  )
}

// "Nueva plantilla": built-in design or an uploaded Word / PowerPoint / PDF file.
function CreateMenu({ onDesign, onUpload, label = 'Nueva plantilla' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button><Plus />{label}<ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDesign}><Palette />Diseño integrado</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onUpload('docx')}><FileText />Subir Word</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onUpload('pptx')}><Presentation />Subir PowerPoint</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onUpload('pdf')}><FileType />Subir PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Certificados: templates a course can use to issue certificates on completion:
// the built-in design or the company's own Word, PowerPoint or PDF file.
export default function LmsCertificates() {
  const info = useCertificateTemplatesInfo()
  const disable = useDisableCertificateTemplate(), enable = useEnableCertificateTemplate(), download = useDownloadCertificateDocx()
  const [editing, setEditing] = useState(null) // null closed, {} new design, template to edit
  const [editingFileId, setEditingFileId] = useState(null)
  const [layoutId, setLayoutId] = useState(null)
  const [uploadFor, setUploadFor] = useState(null) // null closed, { format } new upload, template to replace
  const [suggesting, setSuggesting] = useState(null)
  const [disableFor, setDisableFor] = useState(null)
  const rows = useMemo(() => info.data?.templates ?? [], [info.data])
  const officeAvailable = info.data?.officeAvailable ?? true
  const hasOfficeTemplates = rows.some((t) => isTaggedTemplate(t) && t.enabled !== false)
  const editingFile = rows.find((t) => t.id === editingFileId) ?? null
  const layoutTemplate = rows.find((t) => t.id === layoutId) ?? null

  async function confirmDisable() {
    try {
      await disable.mutateAsync(disableFor.id)
      setDisableFor(null)
    } catch { /* toast shown by the mutation (IN_USE included) */ }
  }

  const openEditor = (template) => (isFileTemplate(template) ? setEditingFileId(template.id) : setEditing(template))
  const startUpload = (format) => setUploadFor({ format })

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Plantilla', accessorFn: (t) => `${t.name} ${t.title ?? ''}`,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-8 w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: isFileTemplate(row.original) ? 'hsl(var(--muted-foreground))' : row.original.accentColor || 'hsl(var(--primary))' }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{row.original.name}</p>
            <p className={`${MUTED} truncate`}>{SUBTITLE[row.original.source] ?? row.original.title}</p>
          </div>
        </div>
      ),
    },
    { id: 'source', header: 'Tipo', accessorFn: (t) => (isFileTemplate(t) ? t.source : ''), cell: ({ row }) => <SourceCell template={row.original} /> },
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
              {isPdfTemplate(t) ? <DropdownMenuItem onSelect={() => setLayoutId(t.id)}><LayoutTemplate />Editar campos</DropdownMenuItem> : null}
              {isTaggedTemplate(t) && t.tagCount === 0 ? <DropdownMenuItem onSelect={() => setSuggesting(t)}><WandSparkles />Sugerir etiquetas</DropdownMenuItem> : null}
              {isFileTemplate(t) ? (
                <>
                  <DropdownMenuItem disabled={download.isPending} onSelect={() => download.mutate({ id: t.id, name: t.name, format: t.source })}>
                    <Download />{isPdfTemplate(t) ? 'Descargar PDF' : 'Descargar para editar'}
                  </DropdownMenuItem>
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

  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Certificados"
        description="Plantillas de certificado. Asigna una a un curso en su Configuración y se emitirá al completarlo."
        actions={<CreateMenu onDesign={() => setEditing({})} onUpload={startUpload} />}
        className="mb-2 pb-0"
      />
      {hasOfficeTemplates && !officeAvailable ? <OfficeNotice /> : null}
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
        emptyDescription="Sube el certificado de tu empresa en Word, PowerPoint o PDF, o usa el diseño integrado. Cada certificado lleva folio y código QR de verificación."
        emptyAction={<CreateMenu label="Crear plantilla" onDesign={() => setEditing({})} onUpload={startUpload} />}
      />
      <div className="flex flex-col gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span className={MUTED}>
          Para cambiar una plantilla de Word o PowerPoint: descárgala, edítala respetando las etiquetas y usa «Reemplazar archivo». Las plantillas PDF se ajustan en «Editar campos». ¿Empiezas desde cero? Descarga un ejemplo con todas las etiquetas.
        </span>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => download.mutate({ format: 'docx' })} disabled={download.isPending}><FileText />Ejemplo Word</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => download.mutate({ format: 'pptx' })} disabled={download.isPending}><Presentation />Ejemplo PowerPoint</Button>
        </div>
      </div>
      <CertDocxReference format="office" />

      <CertificateTemplateSheet
        open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }}
        template={editing?.id ? editing : null}
      />
      <TemplateFileSheet
        open={Boolean(editingFile)} onOpenChange={(open) => { if (!open) setEditingFileId(null) }}
        template={editingFile} officeAvailable={officeAvailable} onReplace={setUploadFor} onSuggest={setSuggesting}
        onEditLayout={(t) => setLayoutId(t.id)}
      />
      <PdfLayoutEditor open={Boolean(layoutTemplate)} onOpenChange={(open) => { if (!open) setLayoutId(null) }} template={layoutTemplate} />
      <TemplateUploadSheet
        open={Boolean(uploadFor)} onOpenChange={(open) => { if (!open) setUploadFor(null) }}
        template={uploadFor?.id ? uploadFor : null} format={uploadFor?.format ?? 'docx'}
        onUploaded={(saved) => {
          if (uploadFor?.id || !saved?.id) return
          // A new PDF opens the field editor; a new Word/PowerPoint file without tags goes to "Sugerir etiquetas".
          if (isPdfTemplate(saved)) { setUploadFor(null); setLayoutId(saved.id) } else if (saved.tagCount === 0) { setUploadFor(null); setSuggesting(saved) }
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
