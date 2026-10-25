import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, PageHeader, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { Palette } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { STUDIO_TEMPLATES, templateDocument } from '../../../../../shared/studio/templates.js'
import { DesignEditor } from '../components/DesignEditor.jsx'

const unwrap = response => response?.data ?? response

export default function StudioScreen() {
  const { session, profileCompanyId, userProfile } = useAuth(), token = session?.access_token
  const [params, setParams] = useSearchParams(), id = params.get('design')
  const [error, setError] = useState(''), [creating, setCreating] = useState(false), [page, setPage] = useState(1)
  const designs = useQuery({ queryKey: ['studio', profileCompanyId, userProfile?.id, 'designs', page],
    queryFn: async () => unwrap(await runly.studio.listDesigns(token, { page })), enabled: Boolean(token) && !id })
  const design = useQuery({ queryKey: ['studio', profileCompanyId, userProfile?.id, 'design', id],
    queryFn: async () => unwrap(await runly.studio.getDesign(id, token)), enabled: Boolean(token && id), refetchOnWindowFocus: false })
  async function create(templateKey) {
    setCreating(true); setError('')
    try {
      const template = STUDIO_TEMPLATES.find(item => item.key === templateKey)
      const record = unwrap(await runly.studio.createDesign({ name: template?.name ?? 'Diseño sin título', document: templateDocument(templateKey) }, token))
      setParams({ design: record.id })
    } catch (error) { setError(error.message) } finally { setCreating(false) }
  }
  if (id) {
    if (design.isPending) return <Skeleton className="m-4 h-96" />
    if (design.error) return <ErrorState description={design.error.message} onRetry={design.refetch} />
    return <DesignEditor key={`${profileCompanyId}:${id}`} record={design.data} token={token} scope={`${profileCompanyId}:${userProfile?.id}:${id}`} onCopy={copyId => setParams({ design: copyId })} onBack={() => { setParams({}); designs.refetch() }} />
  }
  return <div className="space-y-6 p-4 md:p-6">
    <PageHeader title="Runly Studio" eyebrow="IDEAS QUE TOMAN FORMA" description="Crea composiciones propias con texto, formas e imágenes."
      actions={<Button disabled={creating} onClick={() => create(null)}>Crear diseño</Button>} />
    {error && <ErrorState description={error} showReport={false} />}
    <section className="space-y-3" aria-label="Plantillas originales">
      <h2 className="text-lg font-semibold">Un punto de partida</h2>
      <div className="grid gap-3 sm:grid-cols-3">{STUDIO_TEMPLATES.map(template => <div key={template.key} className="rounded-lg border border-border bg-card p-5">
        <Palette className="mb-4 text-primary" /><h3 className="font-semibold">{template.name}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{template.width} × {template.height} px · Editable</p>
        <Button variant="outline" disabled={creating} onClick={() => create(template.key)}>Usar plantilla</Button>
      </div>)}</div>
    </section>
    <section className="space-y-3" aria-label="Mis diseños">
      <h2 className="text-lg font-semibold">Mis diseños</h2>
      {designs.isPending ? <Skeleton className="h-32" /> : designs.error ? <ErrorState description={designs.error.message} onRetry={designs.refetch} /> :
        !designs.data?.length ? <EmptyState icon={Palette} title="Tu próxima idea empieza aquí" description="Crea un diseño o elige una plantilla para comenzar." /> :
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{designs.data.map(item => <Button key={item.id} className="justify-start" variant="outline" onClick={() => setParams({ design: item.id })}>{item.name}</Button>)}</div>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button>
        <Button variant="ghost" disabled={designs.data?.length !== 24} onClick={() => setPage(value => value + 1)}>Siguiente</Button></div>
    </section>
  </div>
}
