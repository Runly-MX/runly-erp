import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

// Copy-to-clipboard chip; flips to "Copiado" for 2 s. Icon-only when label is empty.
export function FormsCopyButton({ text, label = 'Copiar' }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const Icon = copied ? Check : Copy
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copiar: ${text}`}
      aria-label={label ? undefined : copied ? 'Copiado' : 'Copiar ID'}
      className={[
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150',
        'min-h-11 min-w-11 sm:min-h-8 sm:min-w-8',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--ring))]/50 hover:text-[hsl(var(--foreground))]',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label ? (copied ? 'Copiado' : label) : null}
    </button>
  )
}

export function FormsCodeBlock({ code }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 pl-3">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre py-1.5 font-mono text-xs leading-relaxed text-[hsl(var(--foreground))] select-all">
        {code}
      </code>
      <FormsCopyButton text={code} />
    </div>
  )
}
