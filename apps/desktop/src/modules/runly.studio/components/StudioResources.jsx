import { useEffect, useRef, useState } from 'react'
import { Button, Input, SelectField, EmptyState, ErrorState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { runly } from '../../../lib/runly.js'

const unwrap = response => response?.data ?? response
// Limit simultaneous decoding/downloads even when many cards enter the viewport.
const waiting = []
let active = 0
function pump() {
  while (active < 2 && waiting.length) {
    const job = waiting.shift()
    if (job.signal.aborted) { job.reject(new DOMException('Cancelado', 'AbortError')); continue }
    active++
    job.work().then(job.resolve, job.reject).finally(() => { active--; pump() })
  }
}
function scheduled(work, signal) {
  if (waiting.length >= 48) return Promise.reject(new Error('Vuelve a abrir la biblioteca.'))
  return new Promise((resolve, reject) => { waiting.push({ work, signal, resolve, reject }); pump() })
}

function ResourceCard({ asset, token, onPreview }) {
  const node = useRef(null)
  const [url, setUrl] = useState(''), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = '', requested = false
    const observer = new IntersectionObserver(entries => {
      if (requested || !entries.some(entry => entry.isIntersecting)) return
      requested = true; observer.disconnect(); setError(false)
      scheduled(() => runly.studio.thumbnail(asset.id, token, controller.signal), controller.signal).then(blob => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
      }).catch(error => { if (error.name !== 'AbortError' && !controller.signal.aborted) setError(true) })
    }, { rootMargin: '100px' })
    observer.observe(node.current)
    return () => { controller.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [asset.id, token, retry])
  return <div ref={node} className="min-w-0 rounded border p-2">
    <Button variant="ghost" className="h-auto w-full flex-col gap-2 p-1" aria-label={`Previsualizar ${asset.name}`} onClick={() => onPreview(asset)}>
      {url ? <img src={url} alt="" loading="lazy" className="h-20 w-full object-contain" /> : <span className="h-20 text-xs">{error ? 'Imagen no disponible' : 'Miniatura…'}</span>}
      <span className="w-full truncate text-xs">{asset.name}</span>
    </Button>
    {error && <Button size="sm" variant="ghost" onClick={() => setRetry(value => value + 1)}>Reintentar miniatura</Button>}
  </div>
}

export function StudioResources({ token, disabled, onInsert, uploader }) {
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [workspace, setWorkspace] = useState('mine')
  const [format, setFormat] = useState('all'), [page, setPage] = useState(1), [result, setResult] = useState(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState(null), [inserting, setInserting] = useState(false)
  const previewGeneration = useRef(0)
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1) }, 300); return () => clearTimeout(timer) }, [search])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setResult(null); setError('')
    runly.studio.resources(token, { q: query, workspace, format: format === 'all' ? '' : format, page }, controller.signal).then(response => {
      if (!controller.signal.aborted) setResult(unwrap(response))
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, query, workspace, format, page, retry])
  useEffect(() => () => { previewGeneration.current++ }, [])
  async function open(asset) {
    const generation = ++previewGeneration.current
    setPreview({ asset }); setError('')
    try {
      const signed = unwrap(await runly.files.getSignedUrl(asset.id, token))
      if (generation === previewGeneration.current) setPreview({ asset, url: signed.signedUrl })
    } catch (error) { if (generation === previewGeneration.current) { setPreview(null); setError(error.message) } }
  }
  function close() { previewGeneration.current++; setPreview(null) }
  async function insert() {
    if (!preview?.url || disabled || inserting) return
    setInserting(true)
    try { await onInsert(preview.asset); close() } catch (error) { setError(error.message) } finally { setInserting(false) }
  }
  return <section aria-label="Recursos" className="space-y-3 border-t pt-3">
    <h2 className="text-sm font-semibold">Recursos</h2>
    <SelectField label="Biblioteca de imágenes" value={workspace} onChange={value => { setWorkspace(value); setPage(1) }} options={[
      { value: 'mine', label: 'Mis imágenes' }, { value: 'company', label: 'Imágenes de la empresa' }]} />
    <Input aria-label="Buscar imágenes por nombre" placeholder="Buscar por nombre…" value={search} maxLength={80} onChange={event => setSearch(event.target.value)} />
    <SelectField label="Formato de imagen" value={format} onChange={value => { setFormat(value); setPage(1) }} options={[
      { value: 'all', label: 'Todos los formatos' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WebP' }]} />
    {uploader}
    <Button size="sm" variant="ghost" onClick={() => setRetry(value => value + 1)}>Actualizar recursos</Button>
    {error && <ErrorState title="Recurso no disponible" description={error} showReport={false} onRetry={() => setRetry(value => value + 1)} />}
    {loading && <p role="status" className="text-xs">Buscando imágenes…</p>}
    {result?.data.length === 0 && <EmptyState title="Sin imágenes disponibles" description="Sube una imagen o cambia la búsqueda." />}
    <div className="grid max-h-96 grid-cols-2 gap-2 overflow-auto">{result?.data.map(asset => <ResourceCard key={asset.id} asset={asset} token={token} onPreview={open} />)}</div>
    <div className="flex items-center justify-between gap-1 text-xs">
      <Button size="sm" variant="ghost" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior recurso</Button>
      <span>{page} / {result?.pagination.totalPages ?? 1}</span>
      <Button size="sm" variant="ghost" disabled={!result || page >= result.pagination.totalPages || loading} onClick={() => setPage(value => value + 1)}>Siguiente recurso</Button>
    </div>
    <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) close() }}><DialogContent><DialogHeader>
      <DialogTitle>{preview?.asset.name ?? 'Previsualizar imagen'}</DialogTitle><DialogDescription>Se insertará el archivo existente. La exportación utiliza el original.</DialogDescription>
    </DialogHeader>{preview?.url && <img src={preview.url} alt={preview.asset.name} className="max-h-96 w-full object-contain" />}
      <Button disabled={disabled || inserting || !preview?.url} onClick={insert}>Insertar imagen</Button>
    </DialogContent></Dialog>
  </section>
}
