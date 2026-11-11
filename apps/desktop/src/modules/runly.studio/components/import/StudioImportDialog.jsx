import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FileUploader, TextField, cn } from '@runly/ui'
import { AlertTriangle, FileUp, HardDrive, Loader2, ShieldCheck, Store } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyImport, importErrorMessage, importTargets, validateImportFile } from '../../lib/studio-import.js'
import { useTemplatePermissions } from '../templates/template-access.js'
import { ImportReport } from './ImportReport.jsx'
import { MarketplaceSource, marketplaceReport } from './MarketplaceSource.jsx'
import { MarketplaceResourcePicker, MarketplaceState } from '../../../../components/marketplace/MarketplaceResourcePicker.jsx'
import { isTerminal, marketplaceError, releaseRef } from '../../../../lib/marketplace-import.js'

const unwrap = response => response?.data ?? response
const baseName = file => file.name.replace(/\.(runlystudio|svg)$/i, '').trim().slice(0, 160)
const PROGRESS = { inspecting: 'Revisando el archivo…', preparing: 'Preparando la importación…', confirming: 'Guardando…' }
const MARKET_PROGRESS = { inspecting: 'Descargando y verificando en el servidor…', preparing: 'Preparando la copia…', confirming: 'Guardando la copia…' }
const ORIGINS = [
  { value: 'file', label: 'Desde mi equipo', hint: 'Un paquete .runlystudio o un SVG.', icon: HardDrive },
  { value: 'marketplace', label: 'Desde Marketplace', hint: 'Plantillas publicadas y verificadas.', icon: Store },
]

function RadioCards({ label, options, value, onChange, locked, columns }) {
  const arrows = event => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!delta || locked) return
    event.preventDefault()
    const next = options[(options.findIndex(row => row.value === value) + delta + options.length) % options.length]
    onChange(next.value)
    const group = event.currentTarget
    requestAnimationFrame(() => group?.querySelector('[aria-checked="true"]')?.focus())
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={arrows} className={cn('grid gap-2', columns)}>
      {options.map(option => {
        const active = option.value === value, Icon = option.icon
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} disabled={locked} onClick={() => onChange(option.value)}
            className={cn('flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60',
              active ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
            {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}
            <span>
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{option.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TargetPicker({ targets, value, onChange, locked }) {
  if (targets.length === 1) return <p className="text-sm"><span className="text-[hsl(var(--muted-foreground))]">Destino: </span><span className="font-medium">{targets[0].label}</span></p>
  return <RadioCards label="Destino de la importación" options={targets} value={value} onChange={onChange} locked={locked} columns="sm:grid-cols-3" />
}

// Import flow: choose file or Marketplace release -> inspect (no writes) -> choose destination ->
// prepare (staged, nothing visible) -> review again with real images -> confirm.
// Every step calls the real interchange endpoints; nothing is simulated. A Marketplace release is
// downloaded and verified by the server: the browser never receives the package.
export function StudioImportDialog({ open, onOpenChange, token, onImported, initialResource }) {
  const permissions = useTemplatePermissions(), targets = importTargets(permissions)
  const [phase, setPhase] = useState('choose')
  const [file, setFile] = useState(null), [report, setReport] = useState(null), [prepared, setPrepared] = useState(null), [images, setImages] = useState({})
  const [name, setName] = useState(''), [target, setTarget] = useState(''), [accepted, setAccepted] = useState(false), [error, setError] = useState('')
  const [origin, setOrigin] = useState('file'), [resource, setResource] = useState(null), [market, setMarket] = useState(null), [marketState, setMarketState] = useState(null)
  const [acknowledged, setAcknowledged] = useState(false), [copyAccepted, setCopyAccepted] = useState(false)
  const job = useRef(null), staged = useRef(null), urls = useRef([]), confirming = useRef(false)
  const fromMarket = origin === 'marketplace'

  const revokeImages = useCallback(() => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current = []; setImages({}) }, [])
  // Cancelling always aborts the request in flight and releases a prepared, unconfirmed import.
  const release = useCallback(() => {
    job.current?.abort(); job.current = null
    const id = staged.current; staged.current = null
    if (id) runly.studio.cancelPackageImport(id, token).catch(() => {})
  }, [token])
  const reset = useCallback(() => {
    release(); revokeImages(); setPhase('choose'); setFile(null); setReport(null); setPrepared(null); setName(''); setAccepted(false); setError('')
    setMarket(null); setMarketState(null); setCopyAccepted(false)
  }, [release, revokeImages])
  const close = useCallback(() => { reset(); setOrigin('file'); setResource(null); setAcknowledged(false) }, [reset])
  useEffect(() => { if (!open) close() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from a Marketplace card: start on the Marketplace origin with that release selected.
  useEffect(() => { if (open && initialResource) { setOrigin('marketplace'); setResource(initialResource) } }, [open, initialResource])
  useEffect(() => () => { release(); for (const url of urls.current) URL.revokeObjectURL(url) }, [release])
  useEffect(() => { if (!target && targets.length) setTarget(targets[0].value) }, [target, targets])

  const signal = () => { job.current = new AbortController(); return job.current.signal }
  const aborted = sig => sig.aborted

  async function pick(chosen) {
    const check = validateImportFile(chosen)
    if (!check.ok) { setError(check.error); return }
    setError(''); setFile(chosen); setName(baseName(chosen)); setPhase('inspecting')
    const sig = signal()
    try {
      const data = unwrap(await runly.studio.inspectPackage(chosen, token, sig))
      if (aborted(sig)) return
      setReport(data); setPhase('review')
    } catch (failure) { if (!aborted(sig)) { setError(importErrorMessage(failure)); setFile(null); setPhase('choose') } }
  }

  async function inspectMarket() {
    if (!resource) return
    setError(''); setMarketState(null); setPhase('inspecting')
    const sig = signal()
    try {
      const data = unwrap(await runly.studio.inspectMarketplaceTemplate(releaseRef(resource, acknowledged), token, sig))
      if (aborted(sig)) return
      setMarket({ resource: data.resource, diagnostics: data.diagnostics }); setReport(marketplaceReport(data.package, data.diagnostics))
      setName(String(data.resource?.title ?? '').trim().slice(0, 160)); setPhase('review')
    } catch (failure) { if (!aborted(sig)) { setMarketState(marketplaceError(failure)); setPhase('choose') } }
  }

  async function loadImages(data, sig) {
    const wanted = (data.preview?.objects ?? []).map(item => item.fileAssetId ?? item.fillPaint?.fileAssetId).filter(Boolean)
    for (const id of [...new Set(wanted)].slice(0, 6)) {
      try {
        const blob = await runly.studio.packageImportAsset(data.id, id, token, sig)
        if (aborted(sig)) return
        const url = URL.createObjectURL(blob); urls.current.push(url)
        setImages(current => ({ ...current, [id]: url }))
      } catch { /* a missing preview image keeps its placeholder; the import itself is validated server side */ }
    }
  }

  async function confirm(id, digest, accept) {
    if (confirming.current) return
    confirming.current = true; setPhase('confirming')
    const sig = signal()
    try {
      const result = unwrap(await runly.studio.confirmPackageImport(id, { digest, acceptWarnings: accept }, token, sig))
      staged.current = null
      onImported?.(result)
    } catch (failure) {
      if (aborted(sig)) return
      if (!fromMarket) { setError(importErrorMessage(failure)); setPhase('prepared'); return }
      const state = marketplaceError(failure)
      // Withdrawn, revoked or untrusted after preparing: the server already discarded the staged copy.
      if (isTerminal(state)) { staged.current = null; revokeImages(); setPrepared(null); setMarketState(state); setPhase('blocked'); return }
      setMarketState(state); setPhase('prepared')
    } finally { confirming.current = false }
  }

  async function prepare() {
    setError(''); setMarketState(null); setPhase('preparing')
    const sig = signal()
    try {
      const data = unwrap(fromMarket
        ? await runly.studio.prepareMarketplaceTemplateImport({ ...releaseRef(resource, acknowledged), target, name: name.trim() }, token, sig)
        : await runly.studio.preparePackageImport(file, { target, name: name.trim() }, token, sig))
      if (aborted(sig)) { runly.studio.cancelPackageImport(data.id, token).catch(() => {}); return }
      staged.current = data.id; setPrepared(fromMarket ? marketplaceReport(data, data.diagnostics) : data)
      // Nothing to review (no losses, notices or images): the person already saw everything.
      // A Marketplace copy is never confirmed without an explicit decision.
      if (!fromMarket && !classifyImport(data).needsAcceptance && !(data.resources?.length)) { await confirm(data.id, data.digest, false); return }
      setPhase('prepared')
      loadImages(data, sig)
    } catch (failure) {
      if (aborted(sig)) return
      if (!fromMarket) { setError(importErrorMessage(failure)); setPhase('review'); return }
      const state = marketplaceError(failure), diagnostics = state.details?.diagnostics
      if (diagnostics) { setMarket(current => ({ ...current, diagnostics })); setReport(current => marketplaceReport(current, diagnostics)) }
      setMarketState(state); setPhase(isTerminal(state) && !diagnostics ? 'blocked' : 'review')
    }
  }

  // Cancel while a request runs: back to a clear state, with the reason visible.
  function cancelRunning() { release(); revokeImages(); setPrepared(null); setAccepted(false); setCopyAccepted(false); setPhase('cancelled') }
  function retryMarket() { reset(); void inspectMarket() }

  const shown = prepared ?? report, assess = shown ? classifyImport(shown) : null
  const busy = phase in PROGRESS, locked = phase === 'prepared' || busy, progress = (fromMarket ? MARKET_PROGRESS : PROGRESS)[phase]
  const canPrepare = phase === 'review' && assess && !assess.cannotImport && targets.length > 0 && Boolean(target) && Boolean(name.trim())
  const needsAcceptance = phase === 'prepared' && assess?.needsAcceptance
  const canConfirm = phase === 'prepared' && !assess?.cannotImport && (!needsAcceptance || accepted) && (!fromMarket || copyAccepted)
  const acceptLabel = assess?.level === 'raster' ? 'Entiendo que parte del diseño se convierte en imagen y ya no será editable.' : assess?.losses.length ? 'Entiendo que Studio ajusta estos elementos y el resultado no será idéntico al original.' : 'Entiendo que las licencias no están verificadas y revisaré los derechos.'
  const retry = marketState?.retryable ? (phase === 'choose' ? inspectMarket : phase === 'review' ? prepare : phase === 'prepared' ? () => confirm(prepared.id, prepared.digest, needsAcceptance && accepted) : null) : null

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) { if (phase === 'confirming') return; close() } onOpenChange(next) }}>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={FileUp}>
          <DialogTitle>Importar diseño o plantilla</DialogTitle>
          <DialogDescription>{fromMarket ? 'Elige una plantilla del Marketplace. Runly la descarga y la verifica; antes de guardar verás qué se conserva y qué cambia.' : 'Abre un paquete .runlystudio o un SVG. Antes de guardar verás qué se conserva y qué cambia.'}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-busy={busy}>
          {error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" aria-hidden /><div><AlertTitle>No se pudo importar</AlertTitle><AlertDescription>{error}</AlertDescription></div></Alert> : null}
          {marketState ? <MarketplaceState state={marketState} onRetry={retry} /> : null}
          {!targets.length ? <Alert variant="warning" role="status"><ShieldCheck className="h-4 w-4" aria-hidden /><div><AlertTitle>Sin permiso para importar</AlertTitle><AlertDescription>Pide a un administrador permiso para crear diseños o plantillas.</AlertDescription></div></Alert> : null}
          {phase === 'choose' && targets.length ? <RadioCards label="Origen" options={ORIGINS} value={origin} onChange={next => { setOrigin(next); setError(''); setMarketState(null) }} columns="sm:grid-cols-2" /> : null}
          {phase === 'choose' && fromMarket && targets.length ? (
            <MarketplaceResourcePicker type="studio_template" token={token} value={resource} onChange={next => { setResource(next); setMarketState(null) }} acknowledged={acknowledged} onAcknowledge={setAcknowledged} />
          ) : null}
          {phase === 'choose' && !fromMarket ? (
            <div className="space-y-3">
              <FileUploader accept=".runlystudio,.svg" maxSizeMB={64} disabled={!targets.length} emptyLabel="Elegir archivo" hint="Arrastra aquí un .runlystudio o un .svg, o búscalo en tu equipo." onChange={chosen => chosen && pick(chosen)} />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                .runlystudio conserva páginas, texto y formas editables. Un SVG admite formas, trazos y degradados simples (hasta 32 KB); el texto, los filtros y las imágenes externas no se importan.
              </p>
            </div>
          ) : null}
          {phase === 'cancelled' ? (
            <div role="status" className="rounded-lg border border-[hsl(var(--border))] p-4 text-sm">
              <p className="font-medium">Importación cancelada</p>
              <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">No se guardó ningún diseño ni plantilla, y se descartaron los archivos preparados.</p>
            </div>
          ) : null}
          {phase === 'blocked' ? (
            <div role="status" className="rounded-lg border border-[hsl(var(--border))] p-4 text-sm">
              <p className="font-medium">No se creó ninguna copia</p>
              <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">Los archivos preparados se descartaron. Elige otro recurso.</p>
            </div>
          ) : null}
          {busy && !shown ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{progress}</p> : null}
          {shown && assess && ['review', 'preparing', 'prepared', 'confirming'].includes(phase) ? (
            <>
              {fromMarket && market?.resource ? <MarketplaceSource resource={market.resource} diagnostics={market.diagnostics} /> : null}
              <ImportReport report={shown} assess={assess} images={images} pending={phase === 'review'} />
              {!assess.cannotImport && targets.length ? (
                <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
                  <TextField id="studio-import-name" label="Nombre" value={name} maxLength={160} disabled={locked} onChange={event => setName(event.target.value)} />
                  <TargetPicker targets={targets} value={target} onChange={setTarget} locked={locked} />
                  {needsAcceptance ? <CheckboxField label={acceptLabel} checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /> : null}
                  {fromMarket && ['prepared', 'confirming'].includes(phase) ? <CheckboxField label="Confirmo que quiero crear esta copia nueva. La publicación original del Marketplace no cambia." checked={copyAccepted} disabled={busy} onChange={event => setCopyAccepted(event.target.checked)} /> : null}
                </div>
              ) : null}
              {busy ? <p role="status" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{progress}</p> : null}
            </>
          ) : null}
        </div>
        <DialogFooter>
          {busy ? <Button variant="outline" disabled={phase === 'confirming'} onClick={cancelRunning}>Cancelar importación</Button> : null}
          {phase === 'cancelled' && fromMarket ? <Button variant="outline" onClick={reset}>Elegir otro recurso</Button> : null}
          {phase === 'cancelled' ? <Button onClick={fromMarket ? retryMarket : reset}>{fromMarket ? 'Volver a revisar' : 'Elegir otro archivo'}</Button> : null}
          {phase === 'blocked' ? <Button onClick={reset}>Elegir otro recurso</Button> : null}
          {phase === 'choose' ? <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button> : null}
          {phase === 'choose' && fromMarket ? <Button disabled={!resource || !targets.length} onClick={inspectMarket}>Revisar</Button> : null}
          {['review', 'prepared'].includes(phase) && shown ? <Button variant="ghost" onClick={reset}>{fromMarket ? 'Elegir otro recurso' : 'Elegir otro archivo'}</Button> : null}
          {phase === 'review' && !assess?.cannotImport ? <Button disabled={!canPrepare} onClick={prepare} className="gap-1.5">Revisar e importar</Button> : null}
          {phase === 'prepared' ? <Button disabled={!canConfirm} onClick={() => confirm(prepared.id, prepared.digest, needsAcceptance && accepted)}>{fromMarket ? 'Crear copia' : 'Importar'}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
