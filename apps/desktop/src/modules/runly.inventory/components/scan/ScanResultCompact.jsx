import { ExternalLink, Loader2, Plus, Printer, RefreshCw, Search, X } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { HEAD, ScanThumb } from './ScanResultCard.jsx'

function IconAction({ label, onClick, children }) {
  return (
    <Button type="button" size="icon" variant="outline" className="size-11 shrink-0" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  )
}

// Phone floating card for the last read: one status line and one row with the
// asset and its actions, so it stays short above the list handle.
export function ScanResultCompact({ result, canPrint, onAdd, onOpen, onPrint, onSearch, onRetry, onDismiss }) {
  if (!result) return null
  if (result.state === 'loading') {
    return (
      <div className="flex min-h-14 items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 shadow-xl">
        <Loader2 className="size-5 shrink-0 animate-spin text-[hsl(var(--muted-foreground))] motion-reduce:animate-none" aria-hidden="true" />
        <p className="min-w-0 truncate text-sm">Buscando <span className="font-mono">{result.code}</span>...</p>
      </div>
    )
  }
  const head = HEAD[result.state]
  const Icon = head.icon
  const item = result.item
  const missing = !item
  const extra = result.state === 'duplicate' ? `Leído ${result.reads ?? 2} veces` : null
  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
      <div className={cn('flex min-h-9 items-center gap-2 pl-3 text-sm font-semibold', head.strip, head.tone)}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{head.text}{extra ? <span className="font-medium"> · {extra}</span> : null}</span>
        <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0 text-[hsl(var(--foreground))]" aria-label="Cerrar resultado" onClick={onDismiss}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-3 p-3">
        {missing ? null : <ScanThumb fileId={item.coverImageFileId} className="size-12" />}
        <div className="min-w-0 flex-1">
          {missing ? (
            <p className="truncate font-mono text-sm font-semibold">{result.code}</p>
          ) : (
            <>
              <p className="truncate text-sm font-semibold">{item.name ?? 'Equipo'}</p>
              <p className="flex min-w-0 items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="truncate font-mono">{item.folio ?? item.assetTag ?? 'Sin folio'}</span>
                <InventoryAdminStatusBadge status={item.adminStatus} />
              </p>
            </>
          )}
        </div>
        {result.state === 'error' ? <Button type="button" className="h-11" onClick={() => onRetry?.(result.code)}><RefreshCw className="mr-2 size-4" />Reintentar</Button> : null}
        {result.state === 'missing' ? <Button type="button" variant="outline" className="h-11" onClick={() => onSearch?.(result.code)}><Search className="mr-2 size-4" />Buscar</Button> : null}
        {result.state === 'pending' && onAdd ? <Button type="button" className="h-11" onClick={onAdd}><Plus className="mr-1.5 size-4" />Agregar</Button> : null}
        {!missing ? <IconAction label="Abrir ficha" onClick={() => onOpen?.(item)}><ExternalLink className="size-4" /></IconAction> : null}
        {!missing && canPrint ? <IconAction label="Imprimir etiqueta" onClick={() => onPrint?.(item)}><Printer className="size-4" /></IconAction> : null}
      </div>
    </div>
  )
}
