import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Badge, Button, CheckboxField, EmptyState, Skeleton, TextField, cn, matchesSearch } from '@runly/ui'
import { AlertTriangle, BadgeCheck, Clock, PackageSearch, Search, SearchX } from 'lucide-react'
import { runly } from '../../lib/runly.js'
import { catalogState, compatibilityLabel, marketplaceError, publisherLabel, resourceBlock } from '../../lib/marketplace-import.js'

const LIST = {
  studio_template: (params, token) => runly.studio.marketplaceTemplates(params, token),
  automation: (params, token) => runly.modules.marketplaceAutomations(params, token),
}

export function MarketplaceState({ state, onRetry, children }) {
  return (
    <Alert variant={state.kind === 'stale' ? 'warning' : 'destructive'} role={state.kind === 'stale' ? 'status' : 'alert'} data-marketplace-state={state.kind}>
      {state.kind === 'stale' ? <Clock className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
      <div className="min-w-0 space-y-2">
        <AlertTitle>{state.title}</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
        {children}
        {state.retryable && onRetry ? <Button size="sm" variant="outline" onClick={onRetry}>Reintentar</Button> : null}
      </div>
    </Alert>
  )
}

// Releases of one type from the verified resource feed. Selection only: the caller inspects.
// `acknowledged` / `onAcknowledge`: explicit consent to use a catalog copy older than a day.
export function MarketplaceResourcePicker({ type, token, value, onChange, acknowledged, onAcknowledge, disabled }) {
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['marketplace-resources', type, acknowledged, token],
    queryFn: async () => (await LIST[type]({ acknowledgeStale: acknowledged ? 'true' : undefined }, token))?.data,
    enabled: Boolean(token), retry: false, staleTime: 30_000,
  })
  if (query.isLoading) return <div className="space-y-2" role="status" aria-label="Cargando el catálogo">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
  if (query.isError) return <MarketplaceState state={marketplaceError(query.error)} onRetry={() => query.refetch()} />
  const catalog = catalogState(query.data?.catalog), items = query.data?.items ?? []
  const visible = items.filter((item) => !search.trim() || matchesSearch(`${item.title} ${publisherLabel(item)} ${item.description ?? ''}`, search))
  const arrows = (event) => {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    const choices = visible.filter((item) => !resourceBlock(item))
    if (!delta || !choices.length || disabled) return
    event.preventDefault()
    const next = choices[(choices.findIndex((item) => item.releaseId === value?.releaseId) + delta + choices.length) % choices.length]
    onChange(next)
    const group = event.currentTarget
    requestAnimationFrame(() => group?.querySelector('[aria-checked="true"]')?.focus())
  }
  return (
    <div className="space-y-3">
      {catalog.blocking ? <MarketplaceState state={catalog} onRetry={() => query.refetch()} /> : null}
      {catalog.stale ? (
        <MarketplaceState state={catalog}>
          <CheckboxField label="Continuar con la copia actual del catálogo" checked={Boolean(acknowledged)} disabled={disabled} onChange={(event) => onAcknowledge(event.target.checked)} />
        </MarketplaceState>
      ) : null}
      {items.length ? <TextField label="Buscar en Marketplace" icon={Search} value={search} placeholder="Nombre o publicador" disabled={disabled} onChange={(event) => setSearch(event.target.value)} /> : null}
      {!items.length ? <EmptyState icon={PackageSearch} title="No hay recursos disponibles" description="El catálogo verificado no tiene recursos de este tipo por ahora." /> : null}
      {items.length && !visible.length ? <EmptyState icon={SearchX} title="Sin resultados" description="Ningún recurso coincide con la búsqueda." /> : null}
      {visible.length ? (
        <div role="radiogroup" aria-label="Recursos del Marketplace" onKeyDown={arrows} className="space-y-2">
          {visible.map((item, index) => {
            const block = catalog.blocking ? catalog : resourceBlock(item), active = value?.releaseId === item.releaseId
            const focusable = active || (!value && index === visible.findIndex((row) => !resourceBlock(row)))
            return (
              <button key={item.releaseId} type="button" role="radio" aria-checked={active} tabIndex={focusable ? 0 : -1} disabled={disabled || Boolean(block)} onClick={() => onChange(item)}
                data-resource-key={item.resourceKey}
                className={cn('w-full cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed',
                  active ? 'border-(--brand-primary) bg-(--brand-primary)/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]', block && 'opacity-70')}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold">{item.title}</span>
                  <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">v{item.version}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {publisherLabel(item)}{item.publisher?.verified ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Publicador verificado" /> : null}
                </span>
                {item.description ? <span className="mt-1 line-clamp-2 block text-sm text-[hsl(var(--muted-foreground))]">{item.description}</span> : null}
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{item.license}</Badge>
                  <Badge variant="outline">{compatibilityLabel(item)}</Badge>
                  {block ? <Badge variant="destructive">{block.title}</Badge> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
