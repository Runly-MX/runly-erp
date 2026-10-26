import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button } from '@runly/ui'
import { LayoutTemplate, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { TemplateFormDialog } from './TemplateFormDialog.jsx'
import { templateErrorMessage, useTemplatePermissions } from './template-access.js'

const unwrap = response => response?.data ?? response

// Waits for pending editor work (font loads, image ops, live adjustments)
// and returns one coherent, validated scene.
async function captureScene(editor) {
  if (!editor) throw new Error('El editor aún no está listo.')
  await editor.flush()
  return editor.snapshot()
}

// "Guardar como plantilla" from the editor: posts the full current document
// (never a card preview), so unsaved changes are included.
export function useSaveAsTemplate({ editorRef, token, scopeKey, name }) {
  const permissions = useTemplatePermissions(), queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const available = permissions.canSavePersonal || permissions.canSaveCompany
  const dialog = available ? (
    <TemplateFormDialog open={open} onOpenChange={setOpen} mode="create" template={open ? { name } : null} canSaveCompany={permissions.canSaveCompany}
      onSubmit={async values => {
        const document = await captureScene(editorRef.current)
        const saved = unwrap(await runly.studio.saveTemplate({ ...values, scope: permissions.canSaveCompany ? values.scope : 'personal', document }, token))
        queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'templates'] })
        toast.success(saved?.scope === 'company' ? 'Plantilla compartida con tu empresa' : 'Guardada en «Mis plantillas»')
      }} />
  ) : null
  return { open: available ? () => setOpen(true) : null, dialog }
}

// Editing a template's content: the editor works on a design created from it;
// "Guardar en la plantilla" writes that design's scene back with the revision.
export function useTemplateEditing({ editorRef, token, scopeKey, templateId, onExit }) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['studio', ...scopeKey, 'template', templateId], enabled: Boolean(templateId && token), refetchOnWindowFocus: false,
    queryFn: async () => unwrap(await runly.studio.templateDetail(templateId, token)) })
  const [saving, setSaving] = useState(false), [error, setError] = useState(null)
  if (!templateId) return { notice: null }
  async function save() {
    setSaving(true); setError(null)
    try {
      const document = await captureScene(editorRef.current)
      await runly.studio.updateTemplate(templateId, { revision: detail.data.revision, document }, token)
      await detail.refetch()
      queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'templates'] })
      toast.success(`Plantilla «${detail.data.name}» actualizada`)
    } catch (failure) { setError(failure) } finally { setSaving(false) }
  }
  const notice = detail.data?.canEdit ? (
    <Alert className="pointer-events-auto max-w-xl bg-[hsl(var(--card))] shadow-lg">
      <LayoutTemplate className="h-4 w-4" />
      <AlertTitle>Editando la plantilla «{detail.data.name}»</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Los cambios se aplican a la plantilla al guardar. Los diseños ya creados con ella no cambian.</p>
        {error ? <p className="text-[hsl(var(--destructive))]">{templateErrorMessage(error)}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={saving || detail.isFetching} onClick={save}>{saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar en la plantilla</Button>
          {error?.status === 409 ? <Button size="sm" variant="outline" onClick={() => { setError(null); detail.refetch() }}><RefreshCw />Usar revisión actual</Button> : null}
          <Button size="sm" variant="ghost" onClick={onExit}>Terminar</Button>
        </div>
      </AlertDescription>
    </Alert>
  ) : null
  return { notice }
}
