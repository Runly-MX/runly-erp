import { Badge, Button, ErrorState, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton } from '@runly/ui'
import { History, Pencil } from 'lucide-react'
import { useGuestItem, useGuestItemHistory } from '../../hooks/useInventoryGuest.js'
import { GUEST_STATUS_LABEL } from '../../lib/guest-session.js'
import { GuestItemFiles } from './GuestItemFiles.jsx'
import { muted } from './GuestPortalParts.jsx'

function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className={muted}>{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  )
}

const fmtDate = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function customValueText(cv) {
  if (cv.value === null || cv.value === undefined || String(cv.value).trim() === '') return null
  if (cv.fieldType === 'boolean') return String(cv.value).toLowerCase() === 'true' ? 'Sí' : null
  return String(cv.value)
}

function HistoryList({ itemId }) {
  const history = useGuestItemHistory(itemId)
  const rows = history.data ?? []
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" />Historial</h3>
      {history.isLoading ? <Skeleton className="h-16 w-full" /> : rows.length === 0 ? (
        <p className={`text-sm ${muted}`}>Sin movimientos.</p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))]/60">
          {rows.map((h) => (
            <li key={h.id} className="py-2 text-sm">
              <p>{h.label}</p>
              <p className={`text-xs ${muted}`}>
                {h.actor?.self ? 'Tú' : h.actor?.name || (h.actor?.kind === 'guest' ? 'Proveedor' : 'Equipo')} · {fmtDate(h.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Read-only item view in a Sheet (photos, fields, custom values, history). Edit opens the form.
export function GuestItemDetail({ itemId, open, onOpenChange, onEdit, areaName }) {
  const item = useGuestItem(open ? itemId : null)
  const data = item.data
  const customs = (data?.customValues ?? []).map((cv) => [cv.label, customValueText(cv)]).filter(([, v]) => v)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="shrink-0">
          <SheetTitle>{data?.name ?? 'Item'}</SheetTitle>
          <SheetDescription>{[data?.folio, areaName].filter(Boolean).join(' · ') || 'Detalle del item'}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain py-4">
          {item.isLoading ? (
            <><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /></>
          ) : item.isError ? (
            <ErrorState title="No se pudo cargar el item" description={item.error?.message} onRetry={() => item.refetch()} showReport={false} />
          ) : data ? (
            <>
              <GuestItemFiles itemId={data.id} canWrite={data.canWrite} />
              <section>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Datos</h3>
                  {data.status ? <Badge variant="secondary">{GUEST_STATUS_LABEL[data.status] ?? data.status}</Badge> : null}
                </div>
                <dl className="divide-y divide-[hsl(var(--border))]/60">
                  <Row label="Categoría">{data.categoryName}</Row>
                  <Row label="Marca">{data.brandName}</Row>
                  <Row label="Modelo">{data.model}</Row>
                  <Row label="Número de parte">{data.partNumber}</Row>
                  <Row label="Número de serie">{data.serialNumber ? <span className="font-mono">{data.serialNumber}</span> : null}</Row>
                  <Row label="Número de activo">{data.assetTag ? <span className="font-mono">{data.assetTag}</span> : null}</Row>
                  <Row label="Ubicación">{data.locationName}</Row>
                  <Row label="Condición">{data.conditionName}</Row>
                  {customs.map(([label, value]) => <Row key={label} label={label}>{value}</Row>)}
                </dl>
                {data.description ? <p className="mt-3 whitespace-pre-line text-sm">{data.description}</p> : null}
                {data.notes ? <p className={`mt-3 whitespace-pre-line text-sm ${muted}`}>{data.notes}</p> : null}
              </section>
              <HistoryList itemId={data.id} />
            </>
          ) : null}
        </div>
        {data?.canWrite ? (
          <div className="shrink-0 border-t border-[hsl(var(--border))] pt-4">
            <Button className="w-full" onClick={() => onEdit(data)}><Pencil className="mr-2 h-4 w-4" />Editar item</Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
