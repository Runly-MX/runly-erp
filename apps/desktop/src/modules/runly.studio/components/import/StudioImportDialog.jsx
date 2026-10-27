import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FileUploader, TextField, cn } from '@runly/ui'
import { AlertTriangle, FileUp, Loader2, ShieldCheck } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyImport, importErrorMessage, importTargets, validateImportFile } from '../../lib/studio-import.js'
import { useTemplatePermissions } from '../templates/template-access.js'
import { ImportReport } from './ImportReport.jsx'

const unwrap = response => response?.data ?? response
const baseName = file => file.name.replace(/\.(runlystudio|svg)$/i, '').trim().slice(0, 160)
const PROGRESS = { inspecting: 'Revisando el archivo…', preparing: 'Preparando la importación…', confirming: 'Guardando…' }

function TargetPicker({ targets, value, onChange, locked }) {
  if (targets.length === 1) return <p className="text-sm"><span className="text-[hsl(var(--muted-foreground))]">Destino: </span><span className="font-medium">{targets[0].label}</span></p>
  const arrows = event => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!delta || locked) return
    event.preventDefault()
    const next = targets[(targets.findIndex(row => row.value === value) + delta + targets.length) % targets.length]
    onChange(next.value)
    requestAnimationFrame(() => event.currentTarget.querySelector('[aria-checked="true"]')?.focus())
  }
  return (
    <div role="radiogroup" aria-label="Destino de la importación" onKeyDown={arrows} className="grid gap-2 sm:grid-cols-3">
      {targets.map(target => {
        const active = target.value === value
        return (
          <button key={target.value} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} disabled={locked} onClick={() => onChange(target.value)}
            className={cn('rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60',
              active ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
            <span className="block text-sm font-semibold">{target.label}</span>
            <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{target.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

// Import flow: choose file -> inspect (no writes) -> choose destination ->
// prepare (staged, nothing visible) -> review again with real images -> confirm.
// Every step calls the real interchange endpoints; nothing is simulated.
export function StudioImportDialog({ open, onOpenChange, token, onImported }) {
  const permissions = useTemplatePermissions(), targets = importTargets(permissions)
  const [phase, setPhase] = useState('choose')
  const [file, setFile] = useState(null), [report, setReport] = useState(null), [prepared, setPrepared] = useState(null), [images, setImages] = useState({})
  const [name, setName] = useState(''), [target, setTarget] = useState(''), [accepted, setAccepted] = useState(false), [error, setError] = useState('')
  const job = useRef(null), staged = useRef(null), urls = useRef([])

  const revokeImages = useCallback(() => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current = []; setImages({}) }, [])
  // Cancelling always aborts the request in flight and releases a prepared, unconfirmed import.
  const release = useCallback(() => {
    job.current?.abort(); job.current = null
    const id = staged.current; staged.current = null
    if (id) runly.studio.cancelPackageImport(id, token).catch(() => {})
  }, [token])
  const reset = useCallback(() => { release(); revokeImages(); setPhase('choose'); setFile(null); setReport(null); setPrepared(null); setName(''); setAccepted(false); setError('') }, [release, revokeImages])
  useEffect(() => { if (!open) reset() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
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
    setPhase('confirming')
    const sig = signal()
    try {
      const result = unwrap(await runly.studio.confirmPackageImport(id, { digest, acceptWarnings: accept }, token, sig))
      staged.current = null
      onImported?.(result)
    } catch (failure) {
      if (aborted(sig)) return
      setError(importErrorMessage(failure)); setPhase('prepared')
    }
  }

  async function prepare() {
    setError(''); setPhase('preparing')
    const sig = signal()
    try {
      const data = unwrap(await runly.studio.preparePackageImport(file, { target, name: name.trim() }, token, sig))
      if (aborted(sig)) { runly.studio.cancelPackageImport(data.id, token).catch(() => {}); return }
      staged.current = data.id; setPrepared(data)
      // Nothing to review (no losses, notices or images): the person already saw everything.
      if (!classifyImport(data).needsAcceptance && !(data.resources?.length)) { await confirm(data.id, data.digest, false); return }
      setPhase('prepared')
      loadImages(data, sig)
    } catch (failure) {
      if (aborted(sig)) return
      setError(importErrorMessage(failure)); setPhase('review')
    }
  }

  // Cancel while a request runs: back to a clear state, with the reason visible.
  function cancelRunning() { release(); revokeImages(); setPrepared(null); setAccepted(false); setPhase('cancelled') }

  const shown = prepared ?? report, assess = shown ? classifyImport(shown) : null
  const busy = phase in PROGRESS, locked = phase === 'prepared' || busy
  const canPrepare = phase === 'review' && assess && !assess.cannotImport && targets.length > 0 && Boolean(target) && Boolean(name.trim())
  const needsAcceptance = phase === 'prepared' && assess?.needsAcceptance
  const acceptLabel = assess?.level === 'raster' ? 'Entiendo que parte del diseño se convierte en imagen y ya no será editable.' : assess?.losses.length ? 'Entiendo que Studio ajusta estos elementos y el resultado no será idéntico al original.' : 'Entiendo que las licencias no están verificadas y revisaré los derechos.'

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) { if (phase === 'confirming') return; reset() } onOpenChange(next) }}>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={FileUp}>
          <DialogTitle>Importar diseño o plantilla</DialogTitle>
          <DialogDescription>Abre un paquete .runlystudio o un SVG. Antes de guardar verás qué se conserva y qué cambia.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-busy={busy}>
          {error ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" aria-hidden /><div><AlertTitle>No se pudo importar</AlertTitle><AlertDescription>{error}</AlertDescription></div></Alert> : null}
          {!targets.length ? <Alert variant="warning" role="status"><ShieldCheck className="h-4 w-4" aria-hidden /><div><AlertTitle>Sin permiso para importar</AlertTitle><AlertDescription>Pide a un administrador permiso para crear diseños o plantillas.</AlertDescription></div></Alert> : null}
          {phase === 'choose' ? (
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
          {busy && !shown ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{PROGRESS[phase]}</p> : null}
          {shown && assess && ['review', 'preparing', 'prepared', 'confirming'].includes(phase) ? (
            <>
              <ImportReport report={shown} assess={assess} images={images} pending={phase === 'review'} />
              {!assess.cannotImport && targets.length ? (
                <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
                  <TextField id="studio-import-name" label="Nombre" value={name} maxLength={160} disabled={locked} onChange={event => setName(event.target.value)} />
                  <TargetPicker targets={targets} value={target} onChange={setTarget} locked={locked} />
                  {needsAcceptance ? <CheckboxField label={acceptLabel} checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /> : null}
                </div>
              ) : null}
              {busy ? <p role="status" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{PROGRESS[phase]}</p> : null}
            </>
          ) : null}
        </div>
        <DialogFooter>
          {busy ? <Button variant="outline" disabled={phase === 'confirming'} onClick={cancelRunning}>Cancelar importación</Button> : null}
          {phase === 'cancelled' ? <Button onClick={reset}>Elegir otro archivo</Button> : null}
          {phase === 'choose' ? <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button> : null}
          {['review', 'prepared'].includes(phase) && shown ? <Button variant="ghost" onClick={reset}>Elegir otro archivo</Button> : null}
          {phase === 'review' && !assess?.cannotImport ? <Button disabled={!canPrepare} onClick={prepare} className="gap-1.5">Revisar e importar</Button> : null}
          {phase === 'prepared' ? <Button disabled={needsAcceptance && !accepted} onClick={() => confirm(prepared.id, prepared.digest, accepted)}>Importar</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
