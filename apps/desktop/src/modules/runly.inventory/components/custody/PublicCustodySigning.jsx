import { useEffect, useState } from 'react'
import { Button, SignaturePad } from '@runly/ui'
import { ChevronDown, PenLine } from 'lucide-react'
import { muted } from './PublicCustodyParts.jsx'

// Max pad height (the pad is 5:2) from the viewport so it stays usable for a finger in portrait
// and still fits with the button in landscape.
function usePadHeight({ ratio, min, max }) {
  const compute = () => (typeof window === 'undefined' ? max : Math.round(Math.min(max, Math.max(min, window.innerHeight * ratio))))
  const [height, setHeight] = useState(compute)
  useEffect(() => {
    const onResize = () => setHeight(compute())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  })
  return height
}

function SignButton({ disabled, pending, onSign }) {
  return (
    <Button size="lg" className="w-full" onClick={onSign} disabled={disabled}>
      <PenLine className="mr-2 h-4 w-4" />{pending ? 'Firmando...' : 'Firmar resguardo'}
    </Button>
  )
}

function Footnote({ error, expiresAt }) {
  return (
    <>
      {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
      {expiresAt ? (
        <p className={`text-center text-xs ${muted}`}>
          Este enlace vence el {new Date(expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}.
        </p>
      ) : null}
    </>
  )
}

// Desktop / tablet: inline card at the end of the page.
export function InlineSigning({ signature, onChange, onSign, pending, disabled, error, expiresAt }) {
  return (
    <section className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div>
        <h2 className="text-base font-semibold">Tu firma</h2>
        <p className={`text-sm ${muted}`}>Firma dentro del recuadro con el mouse, un lápiz o el dedo.</p>
      </div>
      <SignaturePad onChange={onChange} disabled={disabled || pending} height={240} />
      <SignButton disabled={!signature || pending || disabled} pending={pending} onSign={onSign} />
      <Footnote error={error} expiresAt={expiresAt} />
    </section>
  )
}

// Phones: sticky bottom bar that expands into the signing sheet.
export function MobileSigning({ signature, onChange, onSign, pending, disabled, error, expiresAt }) {
  const [open, setOpen] = useState(false)
  const padHeight = usePadHeight({ ratio: 0.36, min: 140, max: 280 })

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-black/40" aria-hidden="true" onClick={() => setOpen(false)} /> : null}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {/* The pad stays mounted while collapsed so the drawn strokes survive. */}
        <div role="dialog" aria-label="Firmar resguardo" aria-hidden={!open}
          className={`mx-auto max-h-[100dvh] max-w-xl space-y-3 overflow-y-auto px-4 pt-3 ${open ? '' : 'hidden'}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-base font-semibold">Tu firma</p>
              <p className={`text-xs ${muted}`}>Firma con el dedo dentro del recuadro.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Ocultar firma" onClick={() => setOpen(false)} disabled={pending}>
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
          <SignaturePad onChange={onChange} disabled={disabled || pending} height={padHeight} />
          <SignButton disabled={!signature || pending || disabled} pending={pending} onSign={onSign} />
          <Footnote error={error} expiresAt={expiresAt} />
        </div>
        {!open ? (
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 pt-3">
            <p className={`min-w-0 flex-1 text-xs leading-snug ${error ? 'text-[hsl(var(--destructive))]' : muted}`}>
              {error || (signature ? 'Tu firma está lista.' : 'Revisa el equipo y firma para confirmar.')}
            </p>
            <Button className="shrink-0" onClick={() => (signature ? onSign() : setOpen(true))} disabled={disabled || pending}>
              <PenLine className="mr-2 h-4 w-4" />{signature ? (pending ? 'Firmando...' : 'Firmar resguardo') : 'Firmar'}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}
