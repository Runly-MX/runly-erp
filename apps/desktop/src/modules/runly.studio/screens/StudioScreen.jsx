import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorState, Skeleton } from '@runly/ui'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { DesignEditor } from '../components/DesignEditor.jsx'
import { StudioHome } from '../components/home/StudioHome.jsx'
import { blankDocument, validateDocument } from '../../../../../shared/studio/document.js'

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
  const [creating, setCreating] = useState(null)
  const queryClient = useQueryClient()
  const scopeKey = [profileCompanyId, userProfile?.id]
  const design = useQuery({ queryKey: ['studio', ...scopeKey, 'design', id],
    queryFn: async () => unwrap(await runly.studio.getDesign(id, token)), enabled: Boolean(token && id), refetchOnWindowFocus: false })
  // `rethrow` lets the size dialog keep itself open and show the error.
  async function create(kind, value, rethrow = false) {
    setCreating(kind === 'format' || kind === 'template' ? value.key : kind)
    try {
      const record = unwrap(await (kind === 'template' ? runly.studio.createFromTemplate(value.key, token) : runly.studio.createDesign(draftFor(kind, value), token)))
      setParams(withView({ design: record.id }))
    } catch (error) { if (rethrow) throw error; toast.error(error.message) } finally { setCreating(null) }
  }
  if (id) {
    if (design.isPending) return <EditorSkeleton />
    if (design.error) return <div className="flex h-full items-center justify-center p-6"><ErrorState title="No se pudo abrir el diseño" description={design.error.message} onRetry={design.refetch} /></div>
    return <DesignEditor key={`${profileCompanyId}:${userProfile?.id}:${id}`} record={design.data} token={token} scope={`${profileCompanyId}:${userProfile?.id}:${id}`}
      onCopy={copyId => setParams(withView({ design: copyId }))} onBack={() => { setParams(withView({})); queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'designs'] }) }} />
  }
  return <StudioHome token={token} scopeKey={scopeKey} creating={creating} onCreate={create} onOpen={designId => setParams(withView({ design: designId }))}
    view={view} onView={next => setParams(next === 'home' ? {} : { view: next })} />
}
