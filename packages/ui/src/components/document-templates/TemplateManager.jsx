import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Building2, Download, Eye, FileText, FilePenLine, Info, Link2, Lock, MoreHorizontal, RefreshCw, ScanSearch, Star, Trash2, Upload, WandSparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../Badge.jsx'
import { Button } from '../Button.jsx'
import { ConfirmDialog } from '../ConfirmDialog.jsx'
import { DataTable } from '../DataTable.jsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu.jsx'
import { TemplateFieldReference } from './TemplateFieldReference.jsx'
import { TemplateMappingDialog } from './TemplateMappingDialog.jsx'
import { TemplatePreviewDialog } from './TemplatePreviewDialog.jsx'
import { TemplateReplaceDialog } from './TemplateReplaceDialog.jsx'
import { TemplateSuggestDialog } from './TemplateSuggestDialog.jsx'
import { TemplateUploadDialog } from './TemplateUploadDialog.jsx'
import { FORMAT_LABELS, errorText, saveBlob, unknownTags } from './template-utils.js'

const EDITABLE_IN_OFFICE = ['docx', 'xlsx', 'pptx']
const TOKEN_FIRST = ['listFileTemplates']
const TOKEN_LAST = [
  'suggestTemplate', 'replaceTemplateFile', 'saveTemplateMapping', 'publishFileTemplate', 'setTemplateDefault',
  'getTemplateFile', 'deleteTemplate', 'uploadTemplate', 'setTemplateVisibility', 'createBlankTemplate', 'generateDocument', 'previewDocument',
]

// Binds the SDK documents domain to a token so components call api.method(args).
// Methods whose optional last argument is a query/payload are padded so the
// token always lands in its own position.
function bindApi(client, token) {
  const arity = {
    suggestTemplate: 2, replaceTemplateFile: 3, saveTemplateMapping: 3, publishFileTemplate: 2, setTemplateDefault: 1,
    getTemplateFile: 1, setTemplateVisibility: 2, deleteTemplate: 1, uploadTemplate: 1, createBlankTemplate: 1, generateDocument: 1, previewDocument: 1,
  }
  const bound = {}
  for (const name of TOKEN_LAST) {
    bound[name] = (...args) => {
      const padded = [...args]
      while (padded.length < arity[name]) padded.push(undefined)
      if (name === 'getTemplateFile') return client[name](padded[0], token, args[1] ?? {})
      return client[name](...padded.slice(0, arity[name]), token)
    }
  }
  for (const name of TOKEN_FIRST) bound[name] = (...args) => client[name](token, ...args)
  return bound
}

/**
 * Manager of the file templates (Word, Excel, PowerPoint, PDF) of one document
 * kind: upload or blank document, suggested tags, field mapping, publishing,
 * default, replace, download, sample preview and soft delete. Embed it in any
 * module screen; the hub (runly.documents) uses it for every registered kind.
 *
 * Props: client (SDK `documents` domain), token, kind ({ key, label, formats,
 * schema }), scopeKey?, canManage (show write actions), onEditDocument?(template)
 * (open the file in the office editor).
 */
export function TemplateManager({ client, token, kind, scopeKey = null, canManage = false, onEditDocument }) {
  const queryClient = useQueryClient()
  const api = useMemo(() => bindApi(client, token), [client, token])
  const queryKey = ['documents', 'file-templates', kind?.key, scopeKey]
  const query = useQuery({
    queryKey,
    queryFn: () => api.listFileTemplates({ kind: kind.key, ...(scopeKey ? { scopeKey } : {}) }),
    enabled: Boolean(token && kind?.key),
    staleTime: 15_000,
  })
  const rows = query.data?.items ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const [uploadOpen, setUploadOpen] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const [suggesting, setSuggesting] = useState(null)
  const [replacing, setReplacing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [preview, setPreview] = useState({ open: false, blob: null, loading: false, error: '', title: '' })

  // A response that carries a template opens its review step.
  const review = (response) => {
    refresh()
    setReviewing({ template: response.template ?? response, warnings: response.warnings ?? [] })
  }

  const create = useMutation({
    mutationFn: (form) => (form.mode === 'blank'
      ? api.createBlankTemplate({ kind: kind.key, scopeKey, format: form.format, name: form.name, isDefault: form.isDefault, visibility: form.visibility })
      : api.uploadTemplate({ kind: kind.key, scopeKey, file: form.file, name: form.name || undefined, isDefault: form.isDefault, visibility: form.visibility })),
    onSuccess: (response) => { setUploadOpen(false); toast.success('Plantilla guardada'); review(response) },
    onError: (error) => toast.error(errorText(error, 'No se pudo guardar la plantilla')),
  })
  const replace = useMutation({
    mutationFn: ({ template, file }) => api.replaceTemplateFile(template.id, template.version.id, file),
    onSuccess: (response, { file }) => {
      setReplacing(null)
      toast.success(file ? 'Archivo reemplazado' : 'Plantilla analizada de nuevo')
      review(response)
    },
    onError: (error) => toast.error(errorText(error, 'No se pudo actualizar la plantilla')),
  })
  const makeDefault = useMutation({
    mutationFn: (template) => api.setTemplateDefault(template.id),
    onSuccess: (_result, template) => { refresh(); toast.success(`«${template.name}» es ahora la plantilla predeterminada`) },
    onError: (error) => toast.error(errorText(error, 'No se pudo cambiar la plantilla predeterminada')),
  })
  const changeVisibility = useMutation({
    mutationFn: ({ template, visibility }) => api.setTemplateVisibility(template.id, visibility),
    onSuccess: (_result, { template, visibility }) => {
      refresh()
      toast.success(visibility === 'company' ? `«${template.name}» ahora se comparte con la empresa` : `«${template.name}» ahora es personal`)
    },
    onError: (error) => toast.error(errorText(error, 'No se pudo cambiar la visibilidad')),
  })
  const remove = useMutation({
    mutationFn: (template) => api.deleteTemplate(template.id),
    onSuccess: () => { setDeleting(null); refresh(); toast.success('Plantilla eliminada') },
    onError: (error) => toast.error(errorText(error, 'No se pudo eliminar la plantilla')),
  })

  async function download(template) {
    try {
      const { url, fileName } = await api.getTemplateFile(template.id, { versionId: template.version?.id })
      const link = document.createElement('a')
      link.href = url
      link.download = fileName ?? template.name
      link.rel = 'noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) { toast.error(errorText(error, 'No se pudo descargar la plantilla')) }
  }

  async function runPreview(template) {
    setPreview({ open: false, blob: null, loading: true, error: '', title: template.name })
    try {
      const blob = await api.previewDocument({ kind: kind.key, templateId: template.id, versionId: template.version?.id, scopeKey, output: 'pdf' })
      if (/pdf/i.test(blob.type)) {
        setPreview({ open: true, blob, loading: false, error: '', title: template.name })
      } else {
        setPreview((p) => ({ ...p, loading: false }))
        saveBlob(blob, `${template.name}.${template.format}`)
        toast.info('La vista previa en PDF no está disponible; se descargó el documento con datos de ejemplo.')
      }
    } catch (error) {
      setPreview({ open: true, blob: null, loading: false, error: errorText(error, 'Intenta de nuevo.'), title: template.name })
    }
  }

  const columns = [
    { accessorKey: 'name', header: 'Plantilla', cell: ({ row }) => (
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {row.original.name}
        {row.original.isDefault ? <Badge variant="success">Predeterminada</Badge> : null}
        {row.original.visibility === 'personal'
          ? <Badge variant="secondary" title="Solo tú la ves y la usas"><Lock className="mr-1 h-3 w-3" />Personal</Badge>
          : <Badge variant="outline" title="Disponible para toda la empresa"><Building2 className="mr-1 h-3 w-3" />Empresa</Badge>}
      </span>
    ) },
    { id: 'format', header: 'Formato', cell: ({ row }) => <span className="text-xs">{FORMAT_LABELS[row.original.format] ?? row.original.format}</span> },
    { id: 'status', header: 'Estado', enableSorting: false, cell: ({ row }) => {
      const t = row.original
      return t.publishedVersionId ? <Badge variant="success">Publicada</Badge> : <Badge variant="secondary">Borrador</Badge>
    } },
    { id: 'fields', header: 'Campos', enableSorting: false, cell: ({ row }) => {
      const t = row.original
      if (!t.version) return <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>
      const total = t.version.placeholders.length
      const unmapped = unknownTags(kind, t.version.placeholders).filter((tag) => !t.version.mapping?.[tag]).length
      if (!total) return <Badge variant="warning" title="La plantilla no contiene campos; el documento saldrá sin datos.">Sin campos</Badge>
      return unmapped
        ? <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{total} ({unmapped} sin asignar)</span>
        : <span className="text-sm tabular-nums">{total}</span>
    } },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => {
      const t = row.original
      const canWrite = canManage || t.isOwner
      const canEditFile = Boolean(onEditDocument) && EDITABLE_IN_OFFICE.includes(t.format)
      return (
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setReviewing({ template: t, warnings: [] })}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />Campos
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Más acciones de ${t.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => runPreview(t)}><Eye className="mr-2 h-4 w-4" />Probar con datos de ejemplo</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download(t)}><Download className="mr-2 h-4 w-4" />Descargar</DropdownMenuItem>
              {canWrite ? (
                <>
                  <DropdownMenuSeparator />
                  {canEditFile ? <DropdownMenuItem onSelect={() => onEditDocument(t)}><FilePenLine className="mr-2 h-4 w-4" />Editar documento</DropdownMenuItem> : null}
                  {canEditFile ? <DropdownMenuItem onSelect={() => replace.mutate({ template: t, file: null })}><ScanSearch className="mr-2 h-4 w-4" />Volver a analizar</DropdownMenuItem> : null}
                  <DropdownMenuItem onSelect={() => setSuggesting(t)}><WandSparkles className="mr-2 h-4 w-4" />Sugerir etiquetas</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setReplacing(t)}><RefreshCw className="mr-2 h-4 w-4" />Reemplazar archivo</DropdownMenuItem>
                  {t.visibility === 'personal'
                    ? <DropdownMenuItem onSelect={() => changeVisibility.mutate({ template: t, visibility: 'company' })}><Building2 className="mr-2 h-4 w-4" />Compartir con la empresa</DropdownMenuItem>
                    : <DropdownMenuItem onSelect={() => changeVisibility.mutate({ template: t, visibility: 'personal' })}><Lock className="mr-2 h-4 w-4" />Hacer personal</DropdownMenuItem>}
                  {!t.isDefault && t.visibility !== 'personal' ? <DropdownMenuItem onSelect={() => makeDefault.mutate(t)} disabled={!t.publishedVersionId}><Star className="mr-2 h-4 w-4" />Usar como predeterminada</DropdownMenuItem> : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDeleting(t)} className="text-[hsl(var(--destructive))]"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    } },
  ]

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Sube tu propio documento (Word, Excel, PowerPoint o PDF) o crea uno en blanco; las plantillas solo se crean cuando tú lo haces.</span>
      </p>
      <DataTable columns={columns} data={rows} isLoading={query.isLoading} isError={query.isError} onRetry={query.refetch}
        getRowId={(row) => row.id} searchPlaceholder="Buscar plantilla..." emptyTitle="Sin plantillas"
        emptyDescription="Sube tu propio documento (Word, Excel, PowerPoint o PDF) o crea uno en blanco; las plantillas solo se crean cuando tú lo haces. Sin plantilla se usa el formato estándar, si existe."
        emptyIcon={FileText}
        emptyAction={canManage ? { label: 'Nueva plantilla', onClick: () => setUploadOpen(true) } : undefined}
        toolbarActions={canManage ? (
          <Button type="button" size="sm" onClick={() => setUploadOpen(true)}><Upload className="mr-1.5 h-3.5 w-3.5" />Nueva plantilla</Button>
        ) : null} />
      <TemplateFieldReference kind={kind} />

      <TemplateUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} kind={kind} hasTemplates={rows.length > 0}
        busy={create.isPending} onSubmit={(form) => create.mutate(form)} />
      <TemplateReplaceDialog template={replacing} kind={kind} busy={replace.isPending} onOpenChange={(v) => { if (!v) setReplacing(null) }}
        onSubmit={(file) => replace.mutate({ template: replacing, file })} />
      <TemplateSuggestDialog template={suggesting} api={api} schema={kind?.schema} onOpenChange={(v) => { if (!v) setSuggesting(null) }}
        onApplied={(response) => { setSuggesting(null); review(response) }} />
      <TemplateMappingDialog template={reviewing?.template ?? null} warnings={reviewing?.warnings} kind={kind} api={api}
        onOpenChange={(v) => { if (!v) setReviewing(null) }}
        onChanged={(saved) => { refresh(); setReviewing((r) => (r ? { ...r, template: saved?.version ? saved : r.template } : r)) }}
        onPreview={runPreview} />
      <TemplatePreviewDialog open={preview.open} onOpenChange={(v) => setPreview((p) => ({ ...p, open: v }))}
        blob={preview.blob} loading={preview.loading} error={preview.error} title={preview.title} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(v) => { if (!v) setDeleting(null) }}
        title={`Eliminar «${deleting?.name ?? ''}»`} icon={Trash2}
        description="La plantilla deja de ofrecerse para nuevos documentos. Los documentos ya generados no cambian."
        confirmLabel="Eliminar" loading={remove.isPending} onConfirm={() => remove.mutate(deleting)} />
    </div>
  )
}
