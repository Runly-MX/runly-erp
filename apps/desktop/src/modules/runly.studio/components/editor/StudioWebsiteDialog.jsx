import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField, TextField } from '@runly/ui'
import { AlertTriangle, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { documentPages } from '../../../../../../shared/studio/pages.js'
import { convertStudioPage, rasterObjects, websiteKind } from '../../../../../../shared/studio/website-conversion.js'
import { objectBox, rasterizeObject, blobToDataUrl } from '../../lib/object-raster.js'
import { createWebsiteApi, newIdempotencyKey } from '../../../runly.website/lib/websiteApi.js'
import { editorPath } from '../../../runly.website/lib/pageRoute.js'

const unwrap = response => response?.data ?? response
const PLACEHOLDER = 'file:00000000-0000-4000-8000-000000000000'
const slug = text => (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diseno'
const LABELS = { text: 'textos', image: 'fotos', box: 'formas', group: 'grupos' }

// What the Website draft will contain, computed with the same conversion the server runs.
function conversionReport(scenes) {
  const counts = { text: 0, image: 0, box: 0, raster: 0, group: 0 }, losses = new Set(), images = new Map()
  for (const scene of scenes) {
    const result = convertStudioPage(scene, { image: () => ({ src: PLACEHOLDER }), raster: id => ({ src: PLACEHOLDER, box: objectBox(scene.objects.find(item => item.id === id), scene.page) }) })
    for (const key of Object.keys(counts)) counts[key] += result.counts[key]
    result.losses.forEach(loss => losses.add(loss))
    for (const item of rasterObjects(scene)) { const reason = websiteKind(item, scene.page).reason; images.set(reason, (images.get(reason) ?? 0) + 1) }
  }
  return { counts, losses: [...losses], images: [...images] }
}

export function StudioWebsiteDialog({ open, onOpenChange, record, token, editorRef, ensureSaved }) {
  const navigate = useNavigate(), api = useMemo(() => createWebsiteApi(token), [token])
  const [design, setDesign] = useState(null), [sites, setSites] = useState(null), [siteId, setSiteId] = useState('')
  const [selected, setSelected] = useState([]), [targets, setTargets] = useState({}), [routes, setRoutes] = useState([]), [replace, setReplace] = useState(false)
  const [phase, setPhase] = useState('loading'), [error, setError] = useState(''), [progress, setProgress] = useState('')
  const controller = useRef(null), key = useRef(null), save = useRef(ensureSaved)
  save.current = ensureSaved

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase('loading'); setError(''); setReplace(false); key.current = newIdempotencyKey()
    ;(async () => {
      try {
        await save.current()
        const fresh = unwrap(await runly.studio.getDesign(record.id, token)), scenes = documentPages(fresh.document)
        let list = []
        try { list = unwrap(await api.listSites()) ?? [] } catch { list = [] }
        if (cancelled) return
        const base = slug(fresh.name)
        setDesign(fresh); setSites(list.filter(site => !site.archivedAt && site.enabled !== false)); setSiteId(current => current || list[0]?.id || '')
        setSelected(scenes.map(scene => scene.page.id))
        setTargets(Object.fromEntries(scenes.map((scene, index) => [scene.page.id, { routePath: `/${base}${index ? `-${index + 1}` : ''}`, title: scene.page.name || `${fresh.name}${index ? ` ${index + 1}` : ''}`.slice(0, 160) }])))
        setPhase('setup')
      } catch (failure) { if (!cancelled) { setError(failure.message || 'No se pudo preparar el diseño.'); setPhase('error') } }
    })()
    return () => { cancelled = true }
  }, [open, record.id, token, api])

  useEffect(() => {
    if (!open || !siteId) return
    let cancelled = false
    api.listPages(siteId).then(response => { if (!cancelled) setRoutes((unwrap(response) ?? []).flatMap(page => [page.routePath, page.draftMetadata?.routePath]).filter(Boolean)) }).catch(() => { if (!cancelled) setRoutes([]) })
    return () => { cancelled = true }
  }, [open, siteId, api])

  const scenes = useMemo(() => (design ? documentPages(design.document).filter(scene => selected.includes(scene.page.id)) : []), [design, selected])
  const report = useMemo(() => conversionReport(scenes), [scenes])
  const conflicts = scenes.filter(scene => routes.includes(targets[scene.page.id]?.routePath))
  const invalid = scenes.some(scene => !/^\/[a-z0-9-/]*$/.test(targets[scene.page.id]?.routePath ?? '') || !targets[scene.page.id]?.title?.trim())
  const busy = phase === 'converting'
  const close = value => { if (!value) controller.current?.abort(); onOpenChange(value) }

  async function convert() {
    const abort = new AbortController(); controller.current = abort
    setPhase('converting'); setError('')
    try {
      const editor = editorRef.current, rasters = []
      const pending = scenes.flatMap(scene => rasterObjects(scene).map(item => ({ scene, item })))
      for (const [index, { scene, item }] of pending.entries()) {
        setProgress(`Preparando elementos sin equivalente (${index + 1} de ${pending.length})…`)
        const { blob, box } = await rasterizeObject({ editor, design: design.document, scene, item, signal: abort.signal })
        rasters.push({ pageId: scene.page.id, objectId: item.id, box, base64: (await blobToDataUrl(blob)).split(',')[1] })
      }
      setProgress('Copiando fotos y creando los borradores…')
      const site = unwrap(await api.getSite(siteId))
      const body = { siteId, expectedRevision: site.draftRevision, designRevision: design.revision, pages: scenes.map(scene => ({ pageId: scene.page.id, ...targets[scene.page.id], title: targets[scene.page.id].title.trim() })), rasters, replaceExisting: replace, acceptWarnings: true }
      const result = unwrap(await runly.studio.sendToWebsite(record.id, body, key.current, token, abort.signal))
      toast.success(result.pages.length === 1 ? 'Borrador creado en Website.' : `${result.pages.length} borradores creados en Website.`)
      onOpenChange(false)
      navigate(editorPath(siteId, result.firstPageId))
    } catch (failure) {
      if (abort.signal.aborted) { setPhase('setup'); return }
      key.current = newIdempotencyKey()
      setError(failure?.message || 'No se pudo enviar a Website.'); setPhase('setup')
    } finally { setProgress('') }
  }

  const editable = Object.entries(LABELS).filter(([kind]) => report.counts[kind]).map(([kind, label]) => `${report.counts[kind]} ${label}`)
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Globe}>
          <DialogTitle>Enviar a Website</DialogTitle>
          <DialogDescription>Crea páginas en borrador que puedes editar en Website. El sitio no se publica y este diseño no cambia.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          {phase === 'loading' ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />Guardando y revisando el diseño…</p> : null}
          {error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" aria-hidden /><AlertDescription>{error}</AlertDescription></Alert> : null}
          {design && phase !== 'loading' ? (
            <>
              {sites?.length ? (
                <SelectField label="Sitio" value={siteId} onValueChange={setSiteId} disabled={busy} options={sites.map(site => ({ value: site.id, label: site.name }))} />
              ) : <Alert variant="warning" role="status"><AlertDescription>No tienes sitios de Website disponibles o no tienes permiso para crear páginas.</AlertDescription></Alert>}
              <fieldset className="space-y-2" disabled={busy}>
                <legend className="text-sm font-medium">Páginas del diseño</legend>
                {documentPages(design.document).map((scene, index) => {
                  const id = scene.page.id, on = selected.includes(id), target = targets[id] ?? {}
                  return (
                    <div key={id} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
                      <CheckboxField label={`Página ${index + 1}${scene.page.name ? ` · ${scene.page.name}` : ''} (${scene.page.width} × ${scene.page.height} px)`} checked={on}
                        onChange={event => setSelected(list => (event.target.checked ? [...list, id] : list.filter(item => item !== id)))} />
                      {on ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <TextField id={`website-title-${id}`} label="Título de la página" value={target.title ?? ''} maxLength={160} onChange={event => setTargets(all => ({ ...all, [id]: { ...target, title: event.target.value } }))} />
                          <TextField id={`website-route-${id}`} label="Ruta" value={target.routePath ?? ''} maxLength={200} onChange={event => setTargets(all => ({ ...all, [id]: { ...target, routePath: event.target.value.toLowerCase() } }))}
                            error={routes.includes(target.routePath) ? 'Esta ruta ya existe en el sitio.' : undefined} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </fieldset>
              {conflicts.length ? <CheckboxField label="Reemplazar los borradores con la misma ruta (la versión publicada no cambia hasta publicar)" checked={replace} disabled={busy} onChange={event => setReplace(event.target.checked)} /> : null}
              <section aria-label="Resultado de la conversión" className="space-y-1.5 rounded-md border border-[hsl(var(--border))] p-3 text-sm">
                <p className="font-semibold">{editable.length ? `Editables en Website: ${editable.join(', ')}.` : 'Sin elementos editables.'}</p>
                {report.images.length ? <p className="text-xs text-amber-700 dark:text-amber-300">Como imagen de cada elemento (no editable): {report.images.map(([reason, count]) => `${count} por ${reason}`).join('; ')}.</p> : null}
                {report.losses.map(loss => <p key={loss} className="text-xs text-amber-700 dark:text-amber-300">{loss}</p>)}
                <p className="text-xs text-[hsl(var(--muted-foreground))]">En escritorio se conserva la composición; en tableta y teléfono los elementos se apilan en orden de lectura. Puedes ajustarlos después en Website.</p>
              </section>
              {progress ? <p role="status" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{progress}</p> : null}
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{busy ? 'Cancelar' : 'Cerrar'}</Button>
          <Button onClick={convert} disabled={busy || phase !== 'setup' || !siteId || !scenes.length || invalid || (conflicts.length > 0 && !replace)} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}Crear borradores
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
