import { Badge } from '@runly/ui'
import { AlertTriangle, BadgeCheck, Copy, Store, XCircle } from 'lucide-react'
import { compatibilityLabel, publisherLabel } from '../../../../lib/marketplace-import.js'

// What is being imported from the Marketplace and what the server's E1b inspection found.
export function MarketplaceSource({ resource, diagnostics }) {
  const errors = diagnostics?.errors ?? [], warnings = diagnostics?.warnings ?? []
  return (
    <section aria-label="Recurso del Marketplace" className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"><Store className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{resource.title}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            {publisherLabel(resource)}{resource.publisher?.verified ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Publicador verificado" /> : null}
            <span aria-hidden>·</span><span className="tabular-nums">v{resource.version}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{resource.license}</Badge><Badge variant="outline">{compatibilityLabel(resource)}</Badge>{resource.trust === 'resource' ? <Badge variant="outline" className="border-emerald-600/40 text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300">Firma verificada</Badge> : null}</div>
        </div>
      </div>
      <p className="flex items-start gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Copy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Se crea una copia nueva en esta empresa. La publicación original del Marketplace no cambia y las copias anteriores no se sobrescriben.</p>
      {errors.length || warnings.length ? (
        <ul aria-label="Diagnóstico del paquete" className="space-y-1 text-sm">
          {errors.map((row, index) => <li key={`e${index}`} className="flex items-start gap-2 text-red-700 dark:text-red-300"><XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{row.message}</span></li>)}
          {warnings.map((row, index) => <li key={`w${index}`} className="flex items-start gap-2 text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{row.message}</span></li>)}
        </ul>
      ) : null}
    </section>
  )
}

// The server's package report with the E1b blocking diagnostics added, so the existing
// fidelity rules (classifyImport) see every reason that blocks the import.
export function marketplaceReport(pkg, diagnostics) {
  const known = new Set(pkg?.blockingErrors ?? [])
  return { ...pkg, blockingErrors: [...known, ...(diagnostics?.errors ?? []).map((row) => row.message).filter((text) => !known.has(text))] }
}
