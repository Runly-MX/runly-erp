import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, EmptyState, ErrorState, SearchInput, SegmentedControl, Skeleton, ToolButton, cn } from '@runly/ui'
import { ChevronLeft, ChevronRight, Expand, ImageOff, Images, ListFilter, Loader2, Plus, RefreshCw } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { scheduled } from '../lib/resource-queue.js'

const unwrap = response => response?.data ?? response
// Limit simultaneous decoding/downloads even when many cards enter the viewport.

const FORMATS = [{ value: 'all', label: 'Todos los formatos' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WebP' }]

function ResourceCard({ asset, token, disabled, inserting, onInsert, onPreview }) {
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
  return (
    <div ref={node} className="group relative aspect-square overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]">
      <button type="button" disabled={disabled || !url} onClick={() => onInsert(asset)} aria-label={`Insertar ${asset.name}`} title={asset.name}
        className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]">
        {url ? <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none" />
          : error ? <ImageOff className="h-5 w-5 text-[hsl(var(--muted-foreground))]" /> : <Skeleton className="h-full w-full rounded-none" />}
        {url ? <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow">{inserting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="h-4 w-4" />}</span>
        </span> : null}
      </button>
      {error ? <Button size="sm" variant="secondary" className="absolute inset-x-2 bottom-2 h-8 text-xs" onClick={() => setRetry(value => value + 1)}>Reintentar</Button> : null}
      {url ? <button type="button" aria-label={`Ver ${asset.name}`} onClick={() => onPreview(asset)}
        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <Expand className="h-3.5 w-3.5" />
      </button> : null}
    </div>
  )
}

export function StudioResources({ token, disabled, onInsert, uploader }) {
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [workspace, setWorkspace] = useState('mine')
  const [format, setFormat] = useState('all'), [page, setPage] = useState(1), [result, setResult] = useState(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState(null), [inserting, setInserting] = useState(null)
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
  async function insert(asset) {
    if (disabled || inserting) return
    setInserting(asset.id)
    try { await onInsert(asset); close() } catch (error) { setError(error.message) } finally { setInserting(null) }
  }
  const totalPages = result?.pagination.totalPages ?? 1
  return (
    <section aria-label="Imágenes" className="space-y-3">
      {uploader}
      <SegmentedControl ariaLabel="Biblioteca de imágenes" value={workspace} onChange={value => { setWorkspace(value); setPage(1) }}
        options={[{ value: 'mine', label: 'Mis imágenes' }, { value: 'company', label: 'Empresa' }]} />
      <div className="flex items-center gap-1.5">
        <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar por nombre" aria-label="Buscar imágenes por nombre" maxLength={80} className="min-w-0 flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Filtrar por formato" className={cn('relative shrink-0', format !== 'all' && 'border-fuchsia-500/50 text-fuchsia-600 dark:text-fuchsia-300')}><ListFilter /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>Formato</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={format} onValueChange={value => { setFormat(value); setPage(1) }}>
              {FORMATS.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolButton label="Actualizar" side="left" onClick={() => setRetry(value => value + 1)} className="shrink-0"><RefreshCw /></ToolButton>
      </div>
      {error ? <ErrorState title="Recurso no disponible" description={error} showReport={false} onRetry={() => setRetry(value => value + 1)} /> : null}
      {loading ? <div className="grid grid-cols-2 gap-2" aria-busy="true" aria-label="Buscando imágenes">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-xl" />)}</div> : null}
      {result?.data.length === 0 ? <EmptyState variant="compact" icon={Images} title="Sin imágenes" description="Sube una imagen o cambia la búsqueda." /> : null}
      {result?.data.length ? <div className="grid grid-cols-2 gap-2">{result.data.map(asset => (
        <ResourceCard key={asset.id} asset={asset} token={token} disabled={disabled || Boolean(inserting)} inserting={inserting === asset.id} onInsert={insert} onPreview={open} />
      ))}</div> : null}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-1">
          <ToolButton label="Página anterior" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft /></ToolButton>
          <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{page} / {totalPages}</span>
          <ToolButton label="Página siguiente" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}><ChevronRight /></ToolButton>
        </div>
      ) : null}
      <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) close() }}>
        <DialogContent size="lg">
          <DialogHeader icon={Images}>
            <DialogTitle className="truncate">{preview?.asset.name ?? 'Previsualizar imagen'}</DialogTitle>
            <DialogDescription>Se inserta el archivo existente; al exportar se usa el original.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-48 items-center justify-center rounded-xl bg-[hsl(var(--muted)/0.5)] p-2">
            {preview?.url ? <img src={preview.url} alt={preview.asset.name} className="max-h-[60dvh] w-full object-contain" /> : <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))] motion-reduce:animate-none" />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancelar</Button>
            <Button disabled={disabled || Boolean(inserting) || !preview?.url} onClick={() => insert(preview.asset)}>
              {inserting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Plus />}Insertar imagen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
