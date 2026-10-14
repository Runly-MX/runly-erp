import { useState } from 'react'
import { Badge, Button, CheckboxField, ConfirmDialog, DataTable, DistDropZone, TextField } from '@runly/ui'
import { AlertTriangle, FileText, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteDocumentTemplate, useDocumentTemplates, useUpdateDocumentTemplate, useUploadDocumentTemplate,
} from '../../hooks/useInventoryCustody.js'
import { templateWarnings } from '../../lib/custody-api.js'
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
      <TemplatePlaceholderReference />

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
