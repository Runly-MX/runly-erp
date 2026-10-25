import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, PageHeader, EmptyState, ErrorState, Skeleton, ConfirmDialog } from '@runly/ui'
import { Palette } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { STUDIO_TEMPLATES, templateDocument } from '../../../../../shared/studio/templates.js'
import { StudioWorkspace } from '../components/StudioWorkspace.jsx'

const unwrap = response => response?.data ?? response

function DesignEditor({ record, token, onBack }) {
  const [initial] = useState(record.document), [name, setName] = useState(record.name)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const editorRef = useRef(null), revision = useRef(record.revision), generation = useRef(0)
  const changed = useCallback(() => { generation.current++; setDirty(true) }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const resolveImage = useCallback(async id => {
    const signed = unwrap(await runly.files.getSignedUrl(id, token))
    if (!signed.signedUrl) throw new Error('No se pudo abrir la imagen original.')
    return signed.signedUrl
  }, [token])
  const uploadImage = useCallback(async file => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen PNG, JPG o WebP.')
    const bitmap = await createImageBitmap(file)
    const width = bitmap.width, height = bitmap.height
    bitmap.close()
    if (width * height > 25_000_000) throw new Error('La imagen supera 25 megapíxeles.')
    const form = new FormData()
    form.append('file', file); form.append('moduleKey', 'runly.files'); form.append('entityType', 'AtlasFile')
    form.append('metadata', JSON.stringify({ source: 'runly.studio', originalWidth: width, originalHeight: height }))
    const asset = unwrap(await runly.files.upload(form, token))
    const scale = Math.min(1, initial.page.width / width / 2, initial.page.height / height / 2)
    return { id: asset.id, width: Math.max(1, width * scale), height: Math.max(1, height * scale) }
  }, [token, initial])
  async function save() {
    if (!editorRef.current) return
    setBusy(true); setError('')
    const sentGeneration = generation.current
    try {
      const saved = unwrap(await runly.studio.updateDesign(record.id, { name, document: editorRef.current.snapshot(), revision: revision.current }, token))
      revision.current = saved.revision
      if (generation.current === sentGeneration) setDirty(false)
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function exportPng() {
    if (!editorRef.current) return
    try {
      setError('')
      const blob = await editorRef.current.exportPng(), url = URL.createObjectURL(blob)
      const link = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'diseño'}.png` })
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setError(error.message) }
  }
  return <div className="space-y-4 p-4">
    <PageHeader compact title="Runly Studio" description="Tu espacio para dar forma a las ideas" onBack={() => dirty ? setLeaving(true) : onBack()} actions={<div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={exportPng}>Exportar PNG</Button><Button onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
    </div>} />
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label="Nombre del diseño" className="max-w-sm" value={name} maxLength={160} onChange={event => { setName(event.target.value); changed() }} />
      <span role="status" className="text-xs text-muted-foreground">{busy ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
    </div>
    {error && <ErrorState title="El diseño conserva tus cambios" description={error} showReport={false} />}
    <StudioWorkspace initial={initial} resolveImage={resolveImage} uploadImage={uploadImage} onChange={changed} editorRef={editorRef} />
    <ConfirmDialog open={leaving} onOpenChange={setLeaving} title="Salir sin guardar" description="Los cambios pendientes se perderán."
      confirmLabel="Salir sin guardar" onConfirm={onBack} />
  </div>
}

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
    return <DesignEditor key={`${profileCompanyId}:${id}`} record={design.data} token={token} onBack={() => { setParams({}); designs.refetch() }} />
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
