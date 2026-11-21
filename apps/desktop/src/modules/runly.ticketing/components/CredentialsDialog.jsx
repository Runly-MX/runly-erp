import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { Printer, QrCode } from 'lucide-react'

// The QR text exists only in the response that created it (only its hash is stored):
// this is the moment to hand it over (show, print). Closing loses it; a lost QR is
// replaced with "Reemitir", which invalidates the old one.
export function CredentialsDialog({ credentials, title = 'Boletos emitidos', onClose }) {
  const [images, setImages] = useState({})
  useEffect(() => {
    let stop = false
    Promise.all((credentials ?? []).map(async (c) => [c.ticketId, await QRCode.toDataURL(c.qr, { margin: 1, width: 360, errorCorrectionLevel: 'M' })]))
      .then((pairs) => { if (!stop) setImages(Object.fromEntries(pairs)) })
    return () => { stop = true }
  }, [credentials])

  function print() {
    const win = window.open('', '_blank', 'width=720,height=900')
    if (!win) return
    const cards = (credentials ?? []).map((c) => `<div class="card"><img src="${images[c.ticketId] ?? ''}" alt="QR"/><p class="code">${c.code}</p>${c.label ? `<p>${c.label.replace(/[<>&]/g, '')}</p>` : ''}</div>`).join('')
    win.document.write(`<!doctype html><title>Boletos</title><style>body{font-family:system-ui,sans-serif;margin:24px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.card{border:1px solid #ccc;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}img{width:220px;height:220px}.code{font:600 18px ui-monospace,monospace;letter-spacing:.1em}</style><div class="grid">${cards}</div><script>window.onload=()=>window.print()</script>`)
    win.document.close()
  }

  return (
    <Dialog open={Boolean(credentials?.length)} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={QrCode} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Entrega o imprime estos QR ahora: por seguridad no se guardan. Si alguno se pierde, reemítelo desde la orden.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(credentials ?? []).map((c) => (
              <li key={c.ticketId} className="flex flex-col items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-neutral-900">
                {images[c.ticketId] ? <img src={images[c.ticketId]} alt={`QR del boleto ${c.code}`} className="h-44 w-44" /> : <div className="h-44 w-44 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none" />}
                <p className="font-mono text-base font-semibold tracking-widest">{c.code}</p>
                {c.label ? <p className="text-xs text-neutral-600">{c.label}</p> : null}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="outline" onClick={print}><Printer />Imprimir</Button>
          <Button type="button" onClick={onClose}>Listo, ya los entregué</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
