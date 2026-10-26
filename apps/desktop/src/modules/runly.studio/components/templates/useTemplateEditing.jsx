import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button } from '@runly/ui'
import { Check, LayoutTemplate, Loader2, RefreshCw } from 'lucide-react'
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
export function useSaveAsTemplate({ editorRef, token, scopeKey, name, ensureSaved }) {
  const permissions = useTemplatePermissions(), queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const available = permissions.canSavePersonal || permissions.canSaveCompany
  const dialog = available ? (
    <TemplateFormDialog open={open} onOpenChange={setOpen} mode="create" template={open ? { name } : null} canSaveCompany={permissions.canSaveCompany}
      onSubmit={async values => {
        await ensureSaved?.()
        const document = await captureScene(editorRef.current)
        const saved = unwrap(await runly.studio.saveTemplate({ ...values, scope: permissions.canSaveCompany ? values.scope : 'personal', document }, token))
        queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'templates'] })
        toast.success(saved?.scope === 'company' ? 'Plantilla compartida con tu empresa' : 'Guardada en «Mis plantillas»')
      }} />
  ) : null
  return { open: available ? () => setOpen(true) : null, dialog }
}

// Editing a template's content: the editor works on a separate working design
// (kept in Mis diseños) created from it. "Guardar en la plantilla" writes that
// scene back with the template revision and also saves the working design, so
// both match. A 409 never discards the edit: the user reloads the revision and
// decides to overwrite, or finishes without touching the template.
export function useTemplateEditing({ editorRef, token, scopeKey, templateId, designName, saveDesign, onExit }) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['studio', ...scopeKey, 'template', templateId], enabled: Boolean(templateId && token), refetchOnWindowFocus: false,
    queryFn: async () => unwrap(await runly.studio.templateDetail(templateId, token)) })
  const [saving, setSaving] = useState(false), [error, setError] = useState(null), [savedAt, setSavedAt] = useState(null)
  const inFlight = useRef(false)
  if (!templateId) return { notice: null }
  async function save() {
    if (inFlight.current) return
    // Clear the previous confirmation so it never shows while this save is pending.
    inFlight.current = true; setSaving(true); setError(null); setSavedAt(null)
    try {
      await saveDesign?.()
      const document = await captureScene(editorRef.current)
      await runly.studio.updateTemplate(templateId, { revision: detail.data.revision, document }, token)
      await detail.refetch()
      queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'templates'] })
      setSavedAt(new Date())
      toast.success(`Plantilla «${detail.data.name}» actualizada`)
    } catch (failure) { setError(failure) } finally { inFlight.current = false; setSaving(false) }
  }
  async function reload() {
    setError(null)
    try { await detail.refetch({ throwOnError: true }); setError({ reloaded: true }) } catch (failure) { setError(failure) }
  }
  const busy = saving || detail.isFetching
  const notice = detail.data?.canEdit ? (
    <Alert className="pointer-events-auto max-w-xl bg-[hsl(var(--card))] shadow-lg">
      <LayoutTemplate className="h-4 w-4" />
      <AlertTitle>Copia de trabajo de la plantilla «{detail.data.name}»</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Editas un diseño aparte{designName ? ` («${designName}»)` : ''}. La plantilla solo cambia al pulsar «Guardar en la plantilla»; los diseños ya creados con ella no cambian.</p>
        {savedAt && !error ? <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" />Plantilla actualizada. Esta copia de trabajo sigue en Mis diseños; puedes seguir editando o eliminarla desde allí.</p> : null}
        {error?.status === 409 ? <p className="text-[hsl(var(--destructive))]">Otra persona guardó la plantilla mientras la editabas. Tus cambios siguen aquí. Carga su revisión y decide si la sobrescribes con tu versión.</p>
          : error?.reloaded ? <p>Revisión actual cargada. «Sobrescribir con mi versión» reemplaza el contenido que guardó la otra persona.</p>
          : error ? <p className="text-[hsl(var(--destructive))]">{templateErrorMessage(error)} Tus cambios siguen aquí.</p> : null}
        <div className="flex flex-wrap gap-2">
          {error?.status === 409 ? <Button size="sm" variant="outline" disabled={busy} onClick={reload}><RefreshCw />Cargar revisión actual</Button>
            : <Button size="sm" disabled={busy} onClick={save}>{saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{error?.reloaded ? 'Sobrescribir con mi versión' : 'Guardar en la plantilla'}</Button>}
          <Button size="sm" variant="ghost" disabled={saving} onClick={onExit}>Terminar</Button>
        </div>
      </AlertDescription>
    </Alert>
  ) : null
  return { notice }
}
