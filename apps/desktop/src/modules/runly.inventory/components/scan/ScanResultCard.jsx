import { AlertTriangle, CheckCircle2, CopyCheck, ExternalLink, ImageOff, Plus, Printer, RefreshCw, ScanLine, Search, SearchX, X } from 'lucide-react'
import { Button, Skeleton, cn } from '@runly/ui'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { InventoryStatusBadge } from '../InventoryStatusBadge.jsx'
import { useScanCoverUrl } from '../../hooks/useInventoryScan.js'

const MATCHED_BY = { link: 'QR de Runly', folio: 'folio', assetTag: 'número de activo', serial: 'número de serie', search: 'búsqueda' }

export function ScanThumb({ fileId, className }) {
  const { data: url } = useScanCoverUrl(fileId)
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]', className)}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImageOff className="size-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
    </div>
  )
}

export const HEAD = {
  added: { icon: CheckCircle2, text: 'Encontrado y agregado', tone: 'text-emerald-700 dark:text-emerald-300', strip: 'bg-emerald-500/10' },
  pending: { icon: CheckCircle2, text: 'Encontrado', tone: 'text-emerald-700 dark:text-emerald-300', strip: 'bg-emerald-500/10' },
  duplicate: { icon: CopyCheck, text: 'Ya está en la lista', tone: 'text-amber-800 dark:text-amber-300', strip: 'bg-amber-500/12' },
  missing: { icon: SearchX, text: 'No encontrado', tone: 'text-red-700 dark:text-red-300', strip: 'bg-red-500/10' },
  error: { icon: AlertTriangle, text: 'No se pudo buscar', tone: 'text-red-700 dark:text-red-300', strip: 'bg-red-500/10' },
}

function Shell({ children, className, onDismiss }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]', className)}>
      {children}
      {onDismiss ? (
        <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1 size-10" aria-label="Cerrar resultado" onClick={onDismiss}>
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}

function Head({ state, extra, dismissible }) {
  const head = HEAD[state]
  const Icon = head.icon
  return (
    <p className={cn('flex min-h-10 items-center gap-2 px-4 py-2 text-sm font-semibold', head.strip, head.tone, dismissible && 'pr-12')}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{head.text}{extra ? <span className="font-medium"> · {extra}</span> : null}</span>
    </p>
  )
}

// Last read. result: { code, item, matchedBy, reads?, state: 'loading'|'added'|'pending'|'duplicate'|'missing'|'error', message? }
export function ScanResultCard({ result, canPrint, onAdd, onOpen, onPrint, onSearch, onRetry, onDismiss }) {
  if (!result) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-[hsl(var(--border))] p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]"><ScanLine className="size-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /></span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Listo para escanear</p>
          <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">Apunta la cámara a la etiqueta, usa un lector o busca el equipo arriba. El último resultado aparece aquí.</p>
        </div>
      </div>
    )
  }

  if (result.state === 'loading') {
    return (
      <Shell>
        <div className="flex items-center gap-3 p-4" aria-hidden="true">
          <Skeleton className="size-20" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">Buscando <span className="font-mono text-[hsl(var(--foreground))]">{result.code}</span>...</p>
            <Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </Shell>
    )
  }

  if (result.state === 'missing' || result.state === 'error') {
    const failed = result.state === 'error'
    return (
      <Shell onDismiss={onDismiss}>
        <Head state={result.state} dismissible={Boolean(onDismiss)} />
        <div className="space-y-3 p-4">
          <div className="min-w-0">
            <p className="break-all font-mono text-sm font-semibold">{result.code}</p>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {failed ? result.message : result.added
                ? 'Ningún equipo activo tiene ese folio, serie o número de activo. Quedó en la lista como no encontrado.'
                : 'Ningún equipo activo tiene ese folio, serie o número de activo.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {failed ? <Button type="button" className="h-11" onClick={() => onRetry?.(result.code)}><RefreshCw className="mr-2 size-4" />Reintentar</Button> : null}
            {!failed ? <Button type="button" variant={result.added ? 'default' : 'outline'} className="h-11" onClick={() => onSearch?.(result.code)}><Search className="mr-2 size-4" />Buscar manualmente</Button> : null}
            {!failed && !result.added && onAdd ? <Button type="button" variant="outline" className="h-11" onClick={onAdd}><Plus className="mr-2 size-4" />Agregar como no encontrado</Button> : null}
          </div>
        </div>
      </Shell>
    )
  }

  const { item } = result
  const pending = result.state === 'pending'
  const details = [
    ['Serie', item.serialNumber],
    ['N.º de activo', item.assetTag],
    ['Ubicación', item.locationName],
    ['Tipo', item.categoryName],
  ].filter(([, v]) => v)
  const extra = result.state === 'duplicate' ? `Leído ${result.reads ?? 2} veces` : null
  return (
    <Shell onDismiss={onDismiss}>
      <Head state={result.state} extra={extra} dismissible={Boolean(onDismiss)} />
      <div className="flex gap-3 p-4">
        <ScanThumb fileId={item.coverImageFileId} className="size-24" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-snug">{item.name ?? 'Equipo'}</p>
          <p className="truncate font-mono text-sm text-[hsl(var(--muted-foreground))]">{item.folio ?? item.assetTag ?? 'Sin folio'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <InventoryAdminStatusBadge status={item.adminStatus} />
            <InventoryStatusBadge status={item.status} />
          </div>
        </div>
      </div>
      {details.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[hsl(var(--border))] px-4 py-3 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
              <dd className="truncate font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] px-4 py-3">
        {pending && onAdd ? <Button type="button" className="h-11 px-5" onClick={onAdd}><Plus className="mr-2 size-4" />Agregar</Button> : null}
        <Button type="button" variant="outline" className="h-11" onClick={() => onOpen?.(item)}><ExternalLink className="mr-2 size-4" />Abrir ficha</Button>
        {canPrint ? (
          <Button type="button" variant="outline" className="h-11" onClick={() => onPrint?.(item)} aria-label="Imprimir etiqueta">
            <Printer className="mr-2 size-4" />Imprimir etiqueta
          </Button>
        ) : null}
        {MATCHED_BY[result.matchedBy] ? <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">Por {MATCHED_BY[result.matchedBy]}</span> : null}
      </div>
    </Shell>
  )
}
