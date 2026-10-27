import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorState, Skeleton } from '@runly/ui'
import { FilePenLine } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { DesignEditor } from '../components/DesignEditor.jsx'
import { DesignUnavailable, isDesignUnavailable } from '../components/editor/collaboration/DesignUnavailable.jsx'
import { StudioHome } from '../components/home/StudioHome.jsx'
import { StudioImportDialog } from '../components/import/StudioImportDialog.jsx'
import { blankDocument, validateDocument } from '../../../../../shared/studio/document.js'
import { forgetWorkingDesign, rememberWorkingDesign, workingDesignFor } from '../components/templates/template-work.js'

const unwrap = response => response?.data ?? response

// kind: 'format' | 'template' | 'custom' | 'copy'
function draftFor(kind, value) {
  if (kind === 'copy') return value
  if (kind === 'custom') return { name: 'Diseño sin título', document: validateDocument({ ...blankDocument(), page: value }) }
  return { name: value.label ? `${value.label} sin título` : 'Diseño sin título', document: blankDocument(value.width, value.height) }
}

function EditorSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Abriendo diseño">
      <div className="flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] px-3"><Skeleton className="h-8 w-24" /><Skeleton className="h-5 w-48" /></div>
      <div className="flex min-h-0 flex-1"><Skeleton className="hidden w-[72px] rounded-none md:block" /><div className="flex flex-1 items-center justify-center bg-[hsl(var(--muted)/0.4)]"><Skeleton className="aspect-square w-1/3 max-w-md" /></div></div>
    </div>
  )
}

export default function StudioScreen() {
  const { session, profileCompanyId, userProfile } = useAuth(), token = session?.access_token
  const [params, setParams] = useSearchParams(), id = params.get('design')
  // Home view survives opening a design and coming back (?view=designs|templates).
  const view = ['designs', 'templates'].includes(params.get('view')) ? params.get('view') : 'home'
  const withView = extra => ({ ...(view === 'home' ? {} : { view }), ...extra })
  const [creating, setCreating] = useState(null), [resume, setResume] = useState(null), [importing, setImporting] = useState(false)
  // One creation at a time: repeated clicks never create duplicate designs.
  const starting = useRef(false)
  const queryClient = useQueryClient()
  const scopeKey = [profileCompanyId, userProfile?.id]
  // Do not remount a pre-save scene from the route cache when returning home or
  // cancelling history navigation while its background request is in flight.
  const updateRecord = useCallback(record => {
    queryClient.setQueryData(['studio', profileCompanyId, userProfile?.id, 'design', record.id], current => ({ ...current, ...record }))
  }, [queryClient, profileCompanyId, userProfile?.id])
  const design = useQuery({ queryKey: ['studio', ...scopeKey, 'design', id],
    queryFn: async () => unwrap(await runly.studio.getDesign(id, token)), enabled: Boolean(token && id), refetchOnWindowFocus: false })
  // `rethrow` lets the size dialog keep itself open and show the error.
  async function create(kind, value, rethrow = false) {
    if (starting.current) return
    starting.current = true
    setCreating(kind === 'format' || kind === 'template' ? value.key : kind)
    try {
      const record = unwrap(await (kind === 'template' ? runly.studio.createFromTemplate(value.key, token) : runly.studio.createDesign(draftFor(kind, value), token)))
      setParams(withView({ design: record.id }))
    } catch (error) { if (rethrow) throw error; toast.error(error.message) } finally { starting.current = false; setCreating(null) }
  }
  if (id) {
    if (design.isPending) return <EditorSkeleton />
    if (design.error && isDesignUnavailable(design.error)) return <DesignUnavailable error={design.error} onRetry={design.refetch}
      onBack={() => { setParams(withView({})); queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'designs'] }) }} />
    if (design.error) return <div className="flex h-full items-center justify-center p-6"><ErrorState title="No se pudo abrir el diseño" description={design.error.message} onRetry={design.refetch} /></div>
    return <DesignEditor key={`${profileCompanyId}:${userProfile?.id}:${id}`} record={design.data} token={token} scope={`${profileCompanyId}:${userProfile?.id}:${id}`}
      editingTemplateId={params.get('template')}
      onRecordChange={updateRecord}
      onCopy={copyId => setParams(withView({ design: copyId }))} onBack={() => { setParams(withView({})); queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'designs'] }) }} />
  }
  // "Editar contenido": work on a design created from the template, linked by
  // ?template=. A working copy opened before is offered again instead of
  // silently creating another design; repeated clicks start only one.
  async function editTemplateContent(template, fresh = false) {
    if (starting.current) return
    starting.current = true; setCreating(template.key)
    try {
      const known = fresh ? null : workingDesignFor(scopeKey, template.id)
      if (known) {
        const existing = await runly.studio.getDesign(known, token).then(unwrap, error => { if ([403, 404].includes(error.status)) return null; throw error })
        if (existing && existing.canEdit !== false) { setResume({ template, design: existing }); return }
        forgetWorkingDesign(scopeKey, template.id)
      }
      const record = unwrap(await runly.studio.createFromTemplate(template.id, token))
      rememberWorkingDesign(scopeKey, template.id, record.id)
      setResume(null); setParams({ view: 'templates', design: record.id, template: template.id })
    } catch (error) { toast.error(error.message) } finally { starting.current = false; setCreating(null) }
  }
  // A confirmed import is a normal design or template: refresh the lists and open it.
  function imported(result) {
    setImporting(false)
    queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey] })
    if (result.kind === 'design') { toast.success('Diseño importado.'); setParams(withView({ design: result.id })) }
    else { toast.success(result.scope === 'company' ? 'Plantilla de la empresa guardada.' : 'Plantilla personal guardada.'); setParams({ view: 'templates' }) }
  }
  return <>
    <StudioImportDialog open={importing} onOpenChange={setImporting} token={token} onImported={imported} />
    <StudioHome token={token} scopeKey={scopeKey} creating={creating} onImport={() => setImporting(true)} onCreate={create} onEditTemplateContent={template => editTemplateContent(template)} onOpen={designId => setParams(withView({ design: designId }))}
      view={view} onView={next => setParams(next === 'home' ? {} : { view: next })} />
    <Dialog open={Boolean(resume)} onOpenChange={open => { if (!open) setResume(null) }}>
      <DialogContent size="md">
        <DialogHeader icon={FilePenLine}>
          <DialogTitle>Ya tienes una copia de trabajo</DialogTitle>
          <DialogDescription>Editaste antes el contenido de «{resume?.template.name}» en un diseño de Mis diseños.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Continúa con «{resume?.design.name}» para no crear otro diseño. Si la plantilla cambió desde entonces, crea una copia nueva con su contenido actual; la anterior se queda en Mis diseños.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={Boolean(creating)} onClick={() => editTemplateContent(resume.template, true)}>Crear copia nueva</Button>
          <Button disabled={Boolean(creating)} onClick={() => { const { template, design: working } = resume; setResume(null); setParams({ view: 'templates', design: working.id, template: template.id }) }}>Continuar con la copia</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
