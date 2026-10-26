import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ProgressBar } from '@runly/ui'
import { AlertTriangle, Eraser, Loader2, ShieldCheck } from 'lucide-react'

const CHECKER = { backgroundImage: 'conic-gradient(hsl(var(--muted)) 25%, transparent 0 50%, hsl(var(--muted)) 0 75%, transparent 0)', backgroundSize: '18px 18px' }

// "Quitar fondo". Only mounted when the engine exposes removeBackground (see
// docs/architecture/studio-editor-ui-contract.md for the expected contract):
// removeBackground(id, { signal, onProgress }) → { beforeUrl, afterUrl, apply(), discard() }.
// The original file is never modified: apply() stores a new copy.
export function BackgroundRemovalDialog({ open, onOpenChange, run }) {
  const [state, setState] = useState('idle'), [progress, setProgress] = useState(0), [result, setResult] = useState(null), [error, setError] = useState('')
  const [split, setSplit] = useState(50)
  const controller = useRef(null)
  useEffect(() => { if (!open) { controller.current?.abort(); setState('idle'); setProgress(0); setResult(null); setError('') } }, [open])
  async function start() {
    controller.current = new AbortController(); setState('working'); setProgress(0); setError('')
    try {
      const next = await run({ signal: controller.current.signal, onProgress: value => setProgress(Math.round(value * 100)) })
      setResult(next); setState('preview')
    } catch (failure) {
      if (failure?.name === 'AbortError') { setState('idle'); return }
      setError(failure?.message || 'No se pudo quitar el fondo.'); setState('error')
    }
  }
  async function confirm() {
    setState('saving')
    try { await result.apply(); onOpenChange(false) } catch (failure) { setError(failure?.message || 'No se pudo guardar.'); setState('error') }
  }
  function close() {
    if (state === 'working') controller.current?.abort()
    if (result && state !== 'saving') result.discard?.()
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) close() }}>
      <DialogContent size="lg">
        <DialogHeader icon={Eraser}>
          <DialogTitle>Quitar fondo</DialogTitle>
          <DialogDescription>Separamos el sujeto del fondo. Tu foto original no cambia: el resultado se guarda como una copia.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {state === 'preview' || state === 'saving' ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))]" style={CHECKER}>
              <img src={result.beforeUrl} alt="Antes" className="absolute inset-0 h-full w-full object-contain" />
              <img src={result.afterUrl} alt="Después" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
              <span aria-hidden className="absolute inset-y-0 w-0.5 bg-fuchsia-500 shadow" style={{ left: `${split}%` }} />
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">Antes</span>
              <span className="absolute right-2 top-2 rounded-full bg-fuchsia-600 px-2 py-0.5 text-xs text-white">Después</span>
              <input type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Comparar antes y después"
                className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
            </div>
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] p-6 text-center" style={state === 'working' ? CHECKER : undefined}>
              {state === 'working' ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-fuchsia-600 motion-reduce:animate-none" />
                  <p className="text-sm font-medium">Separando el sujeto…</p>
                  <ProgressBar value={progress} className="w-56" />
                </>
              ) : (
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/12 text-fuchsia-600"><Eraser className="h-7 w-7" /></span>
                  <p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">Funciona mejor con personas, productos y objetos con bordes definidos.</p>
                </>
              )}
            </div>
          )}
          {state === 'error' ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error} Tu foto no se modificó.</AlertDescription></Alert> : null}
          <p className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />El original se conserva en Files.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>{state === 'working' ? 'Cancelar' : 'Cerrar'}</Button>
          {state === 'preview' || state === 'saving'
            ? <Button disabled={state === 'saving'} onClick={confirm}>{state === 'saving' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Usar resultado</Button>
            : <Button disabled={state === 'working'} onClick={start}>{state === 'error' ? 'Reintentar' : 'Quitar fondo'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
