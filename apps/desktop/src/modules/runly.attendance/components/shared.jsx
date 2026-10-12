import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button, PageHeader, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, SwitchField, cn,
} from '@runly/ui'

export const TEAL = '#0d9488'

// Right-hand form sheet: header and footer stay fixed, only the body scrolls.
// `createAnother` ({ visible, checked, onChange }) adds the "Crear otro" switch on the left of
// the footer, identical to the Module Builder field sheet. `bodyRef` lets the owner focus the
// first field after a save that keeps the sheet open (see useCreateAnother).
export function FormSheet({ open, onOpenChange, title, description, children, footer, createAnother, bodyRef }) {
  const showSwitch = Boolean(createAnother?.visible)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4 pr-12 max-md:pb-3 max-md:pr-5">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer || showSwitch ? (
          <div data-dialog-footer="" className="flex shrink-0 items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-5 py-3 max-md:py-2">
            {showSwitch ? <SwitchField label="Crear otro" checked={Boolean(createAnother.checked)} onChange={createAnother.onChange} /> : <span />}
            <div className="flex items-center gap-2">{footer}</div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

// State + post-save behaviour for the "Crear otro" switch. After a successful save call
// `finish({ reset, close })`: with the switch on it resets the draft, keeps the sheet open and
// focuses the first field (the mutation already shows the success toast); otherwise it closes.
export function useCreateAnother() {
  const [checked, setChecked] = useState(false)
  const bodyRef = useRef(null)
  const finish = useCallback(({ reset, close }) => {
    if (!checked) { close(); return }
    reset()
    requestAnimationFrame(() => {
      bodyRef.current?.querySelector('input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])')?.focus()
    })
  }, [checked])
  return { checked, setChecked, bodyRef, finish }
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

// One vertical rhythm per screen: every direct child is separated by 16px (header, tabs,
// toolbar, content). ScreenHeader adds 8px so the title block breathes without stray margins.
export function PageShell({ children }) {
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
}

// PageHeader without its built-in bottom padding (PageShell's gap owns the spacing).
export function ScreenHeader({ title, description, actions }) {
  return <PageHeader eyebrow="Asistencia" title={title} description={description} actions={actions} className="mb-2 pb-0" />
}

// Search/filters on the left, the single primary action on the right, same row (wraps on mobile).
export function Toolbar({ start, end, description, className }) {
  if (!start && !end && !description) return null
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{start}</div>
        {end ? <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{end}</div> : null}
      </div>
      {description ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
    </div>
  )
}

// Rounded card with consistent padding and an optional title row.
export function SectionCard({ title, description, icon: Icon, actions, children, className, padded = true }) {
  return (
    <section className={cn('rounded-2xl surface-card', padded && 'p-4 sm:p-5', className)}>
      {title || actions ? (
        <header className={cn('mb-4 flex flex-wrap items-start justify-between gap-2', !padded && 'px-4 pt-4 sm:px-5 sm:pt-5')}>
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 text-teal-700 dark:text-teal-400"><Icon className="h-4 w-4" aria-hidden="true" /></span> : null}
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">{title}</h2>
              {description ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p> : null}
            </div>
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  )
}

const BADGE_TONES = {
  emerald: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  teal: 'border-teal-600/30 bg-teal-600/10 text-teal-800 dark:text-teal-300',
  blue: 'border-blue-600/30 bg-blue-600/10 text-blue-800 dark:text-blue-300',
  violet: 'border-violet-600/30 bg-violet-600/10 text-violet-800 dark:text-violet-300',
  amber: 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300',
  rose: 'border-rose-600/30 bg-rose-600/10 text-rose-800 dark:text-rose-300',
  slate: 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
}

// Small colored pill for kinds, access chips and flags (works in light and dark).
export function ToneBadge({ tone = 'slate', icon: Icon, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', BADGE_TONES[tone] ?? BADGE_TONES.slate, className)}>
      {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      {children}
    </span>
  )
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
