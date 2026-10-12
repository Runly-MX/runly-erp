import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Skeleton,
} from '@runly/ui'

export const TEAL = '#0d9488'

// Right-hand form sheet: header and footer stay fixed, only the body scrolls.
export function FormSheet({ open, onOpenChange, title, description, children, footer }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <SheetFooter className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  )
}

export function QrImage({ value, size = 168 }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => { if (alive) setSrc(url) })
      .catch(() => { if (alive) setSrc('') })
    return () => { alive = false }
  }, [value, size])
  if (!src) return <Skeleton className="rounded-lg" style={{ width: size, height: size }} />
  return <img src={src} alt="Código QR" width={size} height={size} className="rounded-lg border border-[hsl(var(--border))] bg-white p-1" />
}

export function CopyButton({ value, label = 'Copiar' }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('No se pudo copiar.') }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copiado' : label}
    </Button>
  )
}

// Read-only link row with copy button, optional QR below.
export function LinkBlock({ label, value, qr = true }) {
  return (
    <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-[hsl(var(--muted))] px-2 py-1.5 text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
      {qr ? <div className="flex justify-center pt-1"><QrImage value={value} /></div> : null}
    </div>
  )
}

export function PageShell({ children }) {
  return <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
}

export function CardSkeletons({ count = 3, className = 'h-28' }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={`${className} rounded-2xl`} />)}
    </div>
  )
}

export const toOptions = (rows) => [
  ...(rows ?? []).filter((r) => r.enabled !== false).map((r) => ({ value: r.id, label: r.name })),
]
