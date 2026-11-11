import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BadgeCheck, ImageOff, Loader2, Store, XCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, Badge, Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton, TextField, cn } from '@runly/ui'
import { runly } from '../../../../lib/runly.js'
import { isTerminal, marketplaceError, publisherLabel, releaseRef } from '../../../../lib/marketplace-import.js'
import { MarketplaceState } from '../../../../components/marketplace/MarketplaceResourcePicker.jsx'
import { classifyImport, importTargets } from '../../lib/studio-import.js'
import { useTemplatePermissions } from '../templates/template-access.js'
import { StudioThumbnail } from '../StudioThumbnail.jsx'
import { marketplaceReport } from '../import/MarketplaceSource.jsx'

const unwrap = response => response?.data ?? response
const pageDocument = (row, index) => ({ schemaVersion: 7, unit: 'px', page: row.page, objects: row.objects ?? [], additionalPages: [], key: index })

// Large preview with every page of the template. Falls back to the packaged PNG or the cover only.
function Gallery({ item, token }) {
  const [index, setIndex] = useState(0)
  const preview = useQuery({ queryKey: ['studio', 'marketplace-preview', item.releaseId], enabled: Boolean(token), staleTime: 10 * 60_000, retry: false,
    queryFn: async ({ signal }) => (await runly.studio.marketplaceTemplatePreview(releaseRef(item), token, signal))?.data })
  const data = preview.data, pages = data?.pages?.length ? data.pages : data?.document ? [{ page: data.document.page, objects: data.document.objects }] : []
  const current = pages[Math.min(index, pages.length - 1)]
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex h-[min(52vh,32rem)] items-center justify-center overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-5">
        {preview.isLoading ? <Skeleton className="h-full w-2/3 rounded-md" />
          : data?.png ? <img src={data.png} alt={`Vista previa de ${item.title}`} className="max-h-full max-w-full rounded-sm object-contain shadow-md" />
          : current ? <div className="h-full max-w-full shadow-md" style={{ aspectRatio: current.page.width / current.page.height }}><StudioThumbnail document={pageDocument(current, index)} images={data.images} frameRatio={current.page.width / current.page.height} /></div>
          : <ImageOff className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-label="Sin vista previa" />}
      </div>
      {pages.length > 1 ? (
        <ul aria-label="Páginas de la plantilla" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {pages.map((row, i) => (
            <li key={i} className="shrink-0">
              <button type="button" onClick={() => setIndex(i)} aria-label={`Página ${i + 1}`} aria-current={i === index ? 'true' : undefined}
                className={cn('flex h-24 w-20 items-center justify-center rounded-lg border bg-[hsl(var(--muted)/0.5)] p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]', i === index ? 'border-fuchsia-500 ring-1 ring-fuchsia-500' : 'border-[hsl(var(--border))] hover:border-fuchsia-500/50')}>
                <StudioThumbnail document={pageDocument(row, i)} images={data.images} frameRatio={row.page.width / row.page.height} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Targets({ targets, value, onChange, disabled }) {
  if (targets.length < 2) return null
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Guardar como</legend>
      <div role="radiogroup" aria-label="Guardar como" className="space-y-1.5">
        {targets.map(option => {
          const active = option.value === value
          return (
            <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)}
              className={cn('flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-60',
                active ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
              <span aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border-2', active ? 'border-fuchsia-600 bg-fuchsia-600 shadow-[inset_0_0_0_2px_hsl(var(--background))]' : 'border-[hsl(var(--muted-foreground)/0.6)]')} />
              <span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{option.hint}</span></span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function Body({ item, acknowledged, token, onClose, onImported }) {
  const targets = importTargets(useTemplatePermissions())
  const [phase, setPhase] = useState('inspecting'), [info, setInfo] = useState(null), [name, setName] = useState(String(item.title ?? '').slice(0, 160))
  const [target, setTarget] = useState(''), [accepted, setAccepted] = useState(false), [state, setState] = useState(null), [attempt, setAttempt] = useState(0)
  const job = useRef(null), staged = useRef(null)
  const signal = () => { job.current?.abort(); job.current = new AbortController(); return job.current.signal }
  const discard = () => { const id = staged.current; staged.current = null; if (id) runly.studio.cancelPackageImport(id, token).catch(() => {}) }
  useEffect(() => { if (!target && targets.length) setTarget((targets.find(row => row.value === 'design') ?? targets[0]).value) }, [target, targets])
  useEffect(() => {
    const sig = signal()
    setPhase('inspecting'); setState(null)
    runly.studio.inspectMarketplaceTemplate(releaseRef(item, acknowledged), token, sig).then(response => {
      const data = unwrap(response)
      setInfo({ resource: data.resource, diagnostics: data.diagnostics, report: marketplaceReport(data.package, data.diagnostics) })
      if (data.resource?.title) setName(String(data.resource.title).trim().slice(0, 160))
      setPhase('ready')
    }, failure => { if (!sig.aborted) { setState(marketplaceError(failure)); setPhase('failed') } })
    return () => { job.current?.abort(); discard() }
  }, [item.releaseId, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const assess = info ? classifyImport(info.report) : null
  const notices = info ? [...new Set([...(assess.losses.map(row => row.text)), ...(info.diagnostics?.warnings ?? []).map(row => row.message)])] : []
  const pages = info?.report?.pages ?? [], first = pages[0]
  const blocked = Boolean(assess?.cannotImport) || phase === 'failed'
  const working = phase === 'working'
  const ready = phase === 'ready' && !blocked && Boolean(name.trim()) && Boolean(target) && (!assess?.needsAcceptance || accepted)

  async function submit() {
    const sig = signal()
    setPhase('working'); setState(null)
    try {
      const data = unwrap(await runly.studio.prepareMarketplaceTemplateImport({ ...releaseRef(item, acknowledged), target, name: name.trim() }, token, sig))
      if (sig.aborted) { runly.studio.cancelPackageImport(data.id, token).catch(() => {}); return }
      staged.current = data.id
      // What was actually prepared may need a decision the first look did not: stop and show it.
      if (classifyImport(marketplaceReport(data, data.diagnostics)).needsAcceptance && !accepted) { discard(); setInfo(current => ({ ...current, report: marketplaceReport(data, data.diagnostics) })); setPhase('ready'); return }
      const result = unwrap(await runly.studio.confirmPackageImport(data.id, { digest: data.digest, acceptWarnings: accepted }, token, sig))
      staged.current = null
      onImported(result)
    } catch (failure) {
      if (sig.aborted) return
      const next = marketplaceError(failure), diagnostics = next.details?.diagnostics
      if (diagnostics) setInfo(current => ({ ...current, diagnostics, report: marketplaceReport(current.report, diagnostics) }))
      if (isTerminal(next)) staged.current = null
      setState(next); setPhase(isTerminal(next) && !diagnostics ? 'failed' : 'ready')
    }
  }

  return (
    <>
      <DialogHeader icon={Store}>
        <DialogTitle>{item.title}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-1.5">
          {publisherLabel(item)}{item.publisher?.verified ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Publicador verificado" /> : null}
          <span aria-hidden>·</span><span className="tabular-nums">v{item.version}</span>
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy={phase === 'inspecting' || working}>
        <Gallery item={item} token={token} />
        <div className="min-w-0 space-y-4">
          {state ? <MarketplaceState state={state} onRetry={state.retryable ? () => (phase === 'failed' ? setAttempt(n => n + 1) : submit()) : undefined} /> : null}
          {phase === 'inspecting' ? <p role="status" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />Verificando la plantilla…</p> : null}
          {item.description ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{item.description}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {item.official === true ? <Badge variant="outline"><BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden />Oficial Runly</Badge> : null}
            {item.license ? <Badge variant="outline">{item.license}</Badge> : null}
            {pages.length ? <Badge variant="outline">{pages.length} {pages.length === 1 ? 'página' : 'páginas'}{first ? ` · ${Math.round(first.width)} × ${Math.round(first.height)} px` : ''}</Badge> : null}
          </div>
          {assess?.cannotImport ? (
            <Alert variant="destructive"><XCircle className="h-4 w-4" aria-hidden /><div><AlertTitle>No se puede importar</AlertTitle><AlertDescription><ul className="list-disc pl-4">{assess.blockers.map((row, i) => <li key={i}>{row.text}</li>)}</ul></AlertDescription></div></Alert>
          ) : null}
          {phase !== 'failed' && info ? (
            <>
              <TextField label="Nombre" value={name} maxLength={160} disabled={working} onChange={event => setName(event.target.value)} />
              <Targets targets={targets} value={target} onChange={setTarget} disabled={working} />
              {!targets.length ? <Alert variant="warning"><AlertTriangle className="h-4 w-4" aria-hidden /><div><AlertTitle>Sin permiso para importar</AlertTitle><AlertDescription>Pide a un administrador permiso para crear diseños o plantillas.</AlertDescription></div></Alert> : null}
              {assess?.needsAcceptance && !assess.cannotImport ? (
                <Alert variant="warning"><AlertTriangle className="h-4 w-4" aria-hidden />
                  <div className="min-w-0 space-y-2"><AlertTitle>Antes de continuar</AlertTitle>
                    <AlertDescription>{notices.length ? <ul className="list-disc space-y-0.5 pl-4">{notices.slice(0, 5).map((text, i) => <li key={i} className="break-words">{text}</li>)}</ul> : 'Revisa las licencias antes de usar el contenido.'}</AlertDescription>
                    <CheckboxField label={assess.level === 'raster' ? 'Entiendo que parte del diseño se convierte en imagen y ya no será editable.' : assess.losses.length ? 'Entiendo que el resultado no será idéntico al original.' : 'Revisaré los derechos de las licencias.'} checked={accepted} disabled={working} onChange={event => setAccepted(event.target.checked)} />
                  </div>
                </Alert>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={working} onClick={onClose}>Cancelar</Button>
        {phase === 'failed' ? null : <Button disabled={!ready || working} onClick={submit}>{working ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{working ? 'Creando…' : target === 'design' || !target ? 'Crear diseño' : 'Guardar plantilla'}</Button>}
      </DialogFooter>
    </>
  )
}

// One click on a Marketplace card opens this: every page, name, destination and the notices that need a
// decision, all on one screen. The primary action does the whole import (prepare + confirm).
export function MarketplaceUseDialog({ item, acknowledged, token, onClose, onImported }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col md:max-w-5xl">
        {item ? <Body key={item.releaseId} item={item} acknowledged={acknowledged} token={token} onClose={onClose} onImported={onImported} /> : null}
      </DialogContent>
    </Dialog>
  )
}
