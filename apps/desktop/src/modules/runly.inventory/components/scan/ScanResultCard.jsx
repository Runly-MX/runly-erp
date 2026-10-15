import { CheckCircle2, CopyCheck, ImageOff, Loader2, Plus, SearchX } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { InventoryStatusBadge } from '../InventoryStatusBadge.jsx'
import { useScanCoverUrl } from '../../hooks/useInventoryScan.js'

const MATCHED_BY = { link: 'código QR de Runly', folio: 'folio', assetTag: 'número de activo', serial: 'número de serie' }

export function ScanThumb({ fileId, className }) {
  const { data: url } = useScanCoverUrl(fileId)
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]', className)}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImageOff className="size-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
    </div>
  )
}

// Last read: loading, found (added / to add), already in the list, or not found.
// result: { code, item, matchedBy, state: 'loading'|'added'|'pending'|'duplicate'|'missing'|'error', message? }
export function ScanResultCard({ result, onAdd, onOpen }) {
  if (!result) {
    return (
      <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Apunta la cámara a la etiqueta o escribe el folio, la serie o el número de activo.
      </div>
    )
  }
  if (result.state === 'loading') {
    return (
      <div className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-4 text-sm" role="status">
        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="min-w-0 truncate">Buscando <span className="font-mono">{result.code}</span>…</span>
      </div>
    )
  }
  if (result.state === 'missing' || result.state === 'error') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-sm dark:border-red-500/40 dark:bg-red-500/10" role="alert">
        <SearchX className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-red-700 dark:text-red-300">{result.state === 'error' ? 'No se pudo buscar' : 'No encontrado'}</p>
          <p className="truncate font-mono text-xs text-red-700/80 dark:text-red-300/80">{result.code}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {result.state === 'error' ? result.message : 'Ningún equipo activo de esta empresa tiene ese código. Se guarda en la lista como no encontrado.'}
          </p>
        </div>
        {result.state === 'missing' && onAdd ? <Button type="button" size="sm" variant="outline" onClick={onAdd}><Plus />Agregar</Button> : null}
      </div>
    )
  }
  const { item } = result
  const duplicate = result.state === 'duplicate'
  return (
    <div className={cn('rounded-md border p-3', duplicate ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10' : 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10')} role="status">
      <div className="flex gap-3">
        <ScanThumb fileId={item.coverImageFileId} className="size-20" />
        <div className="min-w-0 flex-1">
          <p className={cn('flex items-center gap-1.5 text-xs font-semibold', duplicate ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>
            {duplicate ? <CopyCheck className="size-4" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
            {duplicate ? 'Ya está en la lista' : result.state === 'added' ? 'Agregado a la lista' : 'Encontrado'}
          </p>
          <button type="button" onClick={() => onOpen?.(item)} className="block max-w-full truncate text-left text-base font-semibold hover:underline">{item.name}</button>
          <p className="truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">{item.folio ?? 'Sin folio'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <InventoryAdminStatusBadge status={item.adminStatus} />
            <InventoryStatusBadge status={item.status} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="truncate">{[item.locationName, MATCHED_BY[result.matchedBy] ? `por ${MATCHED_BY[result.matchedBy]}` : null].filter(Boolean).join(' · ')}</span>
        {result.state === 'pending' && onAdd ? <Button type="button" size="sm" onClick={onAdd}><Plus />Agregar a la lista</Button> : null}
      </div>
    </div>
  )
}
