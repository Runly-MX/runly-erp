import { useState } from 'react'
import { Badge, Button, CheckboxField, ConfirmDialog, DataTable, DistDropZone, TextField } from '@runly/ui'
import { AlertTriangle, Download, FileText, RefreshCw, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteDocumentTemplate, useDocumentTemplates, useDownloadDocumentTemplate, useReplaceDocumentTemplateFile,
  useUpdateDocumentTemplate, useUploadDocumentTemplate,
} from '../../hooks/useInventoryCustody.js'
import { templateTagCount, templateWarnings } from '../../lib/custody-api.js'
import { CatalogPanel } from './CatalogPanel.jsx'
import { CatalogEditSheet } from './CatalogEditSheet.jsx'
import { TemplatePlaceholderReference } from './TemplatePlaceholderReference.jsx'

const EMPTY = { file: null, name: '', isDefault: false }
const formatOf = (file) => (/\.xlsx$/i.test(file?.name ?? '') ? 'xlsx' : /\.docx$/i.test(file?.name ?? '') ? 'docx' : null)

function Warnings({ list }) {
  if (!list.length) return null
  return (
    <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />Advertencias de la plantilla</p>
      <ul className="list-disc space-y-0.5 pl-5 text-[hsl(var(--muted-foreground))]">
        {list.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </div>
  )
}

// Company document templates (.docx/.xlsx) for custody records.
export function TemplatesPanel() {
  const { data, isLoading, isError, refetch } = useDocumentTemplates()
  const rows = (data ?? []).filter((row) => row.enabled !== false)
  const upload = useUploadDocumentTemplate()
  const update = useUpdateDocumentTemplate()
  const remove = useDeleteDocumentTemplate()
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [lastWarnings, setLastWarnings] = useState([])
  const [deleting, setDeleting] = useState(null)
  const download = useDownloadDocumentTemplate()
  const replace = useReplaceDocumentTemplateFile()
  const [replacing, setReplacing] = useState(null)
  const [replaceFile, setReplaceFile] = useState(null)
  const [replaceWarnings, setReplaceWarnings] = useState([])

  function openUpload() {
    setForm({ ...EMPTY, isDefault: rows.length === 0 })
    setLastWarnings([])
    setUploading(true)
  }

  function pickFile(file) {
    if (!formatOf(file)) {
      toast.error('Sube un archivo .docx o .xlsx')
      return
    }
    setForm((f) => ({ ...f, file, name: f.name || file.name.replace(/\.(docx|xlsx)$/i, '') }))
  }

  async function submit() {
    try {
      const template = await upload.mutateAsync({ file: form.file, name: form.name.trim(), format: formatOf(form.file), isDefault: form.isDefault })
      const warnings = templateWarnings(template)
      if (warnings.length) {
        setLastWarnings(warnings)
        toast.warning('Plantilla guardada con advertencias')
        return
      }
      toast.success('Plantilla guardada')
      setUploading(false)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo subir la plantilla')
    }
  }

  async function downloadTemplate(row) {
    try {
      await download.mutateAsync(row ? { id: row.id, fileName: `${row.name}.${row.format}` } : {})
    } catch (err) { toast.error(err?.message ?? 'No se pudo descargar la plantilla') }
  }

  function openReplace(row) {
    setReplaceFile(null)
    setReplaceWarnings([])
    setReplacing(row)
  }

  async function submitReplace() {
    try {
      const template = await replace.mutateAsync({ id: replacing.id, file: replaceFile })
      const warnings = templateWarnings(template)
      if (warnings.length) {
        setReplaceWarnings(warnings)
        toast.warning('Plantilla actualizada con advertencias')
        return
      }
      toast.success(`«${replacing.name}» actualizada`)
      setReplacing(null)
    } catch (err) { toast.error(err?.message ?? 'No se pudo reemplazar la plantilla') }
  }

  async function makeDefault(row) {
    try {
      await update.mutateAsync({ id: row.id, isDefault: true })
      toast.success(`«${row.name}» es ahora la plantilla predeterminada`)
    } catch (err) { toast.error(err?.message ?? 'No se pudo actualizar la plantilla') }
  }

  const columns = [
    { accessorKey: 'name', header: 'Plantilla', cell: ({ row }) => (
      <span className="flex items-center gap-2 font-medium">
        {row.original.name}
        {row.original.isDefault ? <Badge variant="success">Predeterminada</Badge> : null}
      </span>
    ) },
    { accessorKey: 'format', header: 'Formato', cell: ({ row }) => <span className="font-mono text-xs uppercase">{row.original.format}</span> },
    { id: 'tags', header: 'Etiquetas', enableSorting: false, cell: ({ row }) => {
      const count = templateTagCount(row.original)
      if (count === null) return <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>
      return count === 0
        ? <Badge variant="warning" title="La plantilla no contiene etiquetas {{…}}; el documento se generará sin datos.">Sin etiquetas</Badge>
        : <span className="tabular-nums text-sm">{count}</span>
    } },
    { id: 'warnings', header: 'Advertencias', enableSorting: false, cell: ({ row }) => {
      const list = templateWarnings(row.original)
      return list.length
        ? <span title={list.join('\n')} className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{list.length}</span>
        : <span className="text-xs text-[hsl(var(--muted-foreground))]">Ninguna</span>
    } },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        {!row.original.isDefault ? (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => makeDefault(row.original)} disabled={update.isPending}>
            <Star className="mr-1.5 h-3.5 w-3.5" />Predeterminar
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Descargar para editar"
          aria-label={`Descargar ${row.original.name}`} onClick={() => downloadTemplate(row.original)} disabled={download.isPending}>
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Reemplazar archivo"
          aria-label={`Reemplazar ${row.original.name}`} onClick={() => openReplace(row.original)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--destructive))]"
          aria-label={`Eliminar ${row.original.name}`} onClick={() => setDeleting(row.original)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    ) },
  ]

  return (
    <CatalogPanel catalogKey="templates" createLabel="Subir plantilla" onCreate={openUpload}>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} onRetry={refetch} getRowId={(row) => row.id}
        searchPlaceholder="Buscar plantilla..." emptyTitle="Sin plantillas"
        emptyDescription="Sube tu formato de resguardo en Word o Excel. Sin plantilla se usa el formato estándar."
        emptyIcon={FileText} emptyAction={{ label: 'Subir plantilla', onClick: openUpload }} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
        <span>Para cambiar una plantilla: descárgala, edítala en Word o Excel respetando las etiquetas y usa «Reemplazar archivo». ¿Empiezas desde cero? Descarga el ejemplo con todas las etiquetas.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadTemplate(null)} disabled={download.isPending}>
          <Download className="mr-1.5 h-3.5 w-3.5" />Descargar ejemplo
        </Button>
      </div>
      <TemplatePlaceholderReference />

      <CatalogEditSheet open={Boolean(replacing)} onOpenChange={(v) => { if (!v) setReplacing(null) }}
        title={`Reemplazar «${replacing?.name ?? ''}»`} busy={replace.isPending}
        saveDisabled={!replaceFile || replaceWarnings.length > 0} onSave={submitReplace}>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Sube la versión editada. Se conservan el nombre, si es predeterminada y los resguardos que la usan; los documentos ya generados no cambian.</p>
        <DistDropZone accept=".docx,.xlsx" maxSizeMB={10} file={replaceFile}
          onFile={(file) => { if (!formatOf(file)) { toast.error('Sube un archivo .docx o .xlsx'); return } setReplaceFile(file); setReplaceWarnings([]) }}
          onClear={() => setReplaceFile(null)} isUploading={replace.isPending}
          emptyLabel="Arrastra la plantilla editada .docx o .xlsx" />
        <Warnings list={replaceWarnings} />
        {replaceWarnings.length ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">El archivo se reemplazó. Corrige las etiquetas y vuelve a subirlo si lo necesitas, o cierra este panel.</p>
        ) : null}
      </CatalogEditSheet>

      <CatalogEditSheet open={uploading} onOpenChange={setUploading} title="Subir plantilla" busy={upload.isPending}
        saveDisabled={!form.file || !form.name.trim() || lastWarnings.length > 0} onSave={submit}>
        <DistDropZone accept=".docx,.xlsx" maxSizeMB={10} file={form.file} onFile={pickFile}
          onClear={() => setForm((f) => ({ ...f, file: null }))} isUploading={upload.isPending}
          emptyLabel="Arrastra tu plantilla .docx o .xlsx" />
        <TextField label="Nombre" required value={form.name} maxLength={120} placeholder="Resguardo de equipo de cómputo"
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <CheckboxField label="Usar como plantilla predeterminada" checked={form.isDefault}
          onChange={(e) => setForm((f) => ({ ...f, isDefault: Boolean(e?.target ? e.target.checked : e) }))} />
        <Warnings list={lastWarnings} />
        {lastWarnings.length ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">La plantilla se guardó. Corrige las etiquetas y vuelve a subirla si lo necesitas, o cierra este panel.</p>
        ) : null}
      </CatalogEditSheet>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(v) => { if (!v) setDeleting(null) }}
        title={`Eliminar «${deleting?.name ?? ''}»`}
        description="La plantilla deja de ofrecerse para nuevos resguardos. Los documentos ya generados no cambian."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(deleting.id)
            toast.success('Plantilla eliminada')
            setDeleting(null)
          } catch (err) { toast.error(err?.message ?? 'No se pudo eliminar la plantilla') }
        }}
      />
    </CatalogPanel>
  )
}
