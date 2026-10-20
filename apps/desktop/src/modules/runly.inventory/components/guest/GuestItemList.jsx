import { useMemo } from 'react'
import { Badge, Button, DataTable, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { ChevronLeft, ChevronRight, ImageOff, PackageOpen } from 'lucide-react'
import { GUEST_STATUS_LABEL } from '../../lib/guest-session.js'
import { muted } from './GuestPortalParts.jsx'

function Thumb({ url, className = 'h-14 w-14' }) {
  return (
    <span className={`flex ${className} shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]`}>
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className={`h-4 w-4 ${muted}`} />}
    </span>
  )
}

const statusBadge = (status) => (status ? <Badge variant="secondary">{GUEST_STATUS_LABEL[status] ?? status}</Badge> : null)

function ItemCard({ item, onOpen }) {
  const sub = [item.categoryName, item.brandName, item.model].filter(Boolean).join(' · ')
  return (
    <button type="button" onClick={() => onOpen(item.id)}
      className="flex w-full items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left transition-colors hover:bg-[hsl(var(--muted))]/50">
      <Thumb url={item.coverUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        {item.folio ? <span className={`block font-mono text-xs ${muted}`}>{item.folio}</span> : null}
        {sub ? <span className={`block truncate text-xs ${muted}`}>{sub}</span> : null}
        {item.locationName ? <span className={`block truncate text-xs ${muted}`}>{item.locationName}</span> : null}
      </span>
      {statusBadge(item.status)}
    </button>
  )
}

function buildColumns(onOpen) {
  const text = (key, header, mono) => ({
    accessorKey: key, header, enableSorting: false,
    cell: ({ row }) => <span className={mono ? 'font-mono text-xs' : ''}>{row.original[key] || '—'}</span>,
  })
  return [
    {
      id: 'name', header: 'Item', enableSorting: false,
      cell: ({ row }) => (
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onOpen(row.original.id)}>
          <Thumb url={row.original.coverUrl} className="h-10 w-10" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{row.original.name}</span>
            {row.original.folio ? <span className={`block font-mono text-xs ${muted}`}>{row.original.folio}</span> : null}
          </span>
        </button>
      ),
    },
    text('categoryName', 'Categoría'),
    text('brandName', 'Marca'),
    text('model', 'Modelo'),
    text('locationName', 'Ubicación'),
    text('serialNumber', 'Serie', true),
    { id: 'status', header: 'Estado', enableSorting: false, cell: ({ row }) => statusBadge(row.original.status) },
  ]
}

function Pager({ pagination, onPage }) {
  const { page, pageSize, total } = pagination
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  return (
    <div className={`flex items-center justify-between gap-3 pt-1 text-sm ${muted}`}>
      <span>{from}–{Math.min(total, page * pageSize)} de {total}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-2 tabular-nums">{page} / {pages}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

// Server-paginated items: cards on mobile, DataTable on desktop.
export function GuestItemList({ query, isDesktop, onOpen, onPage, canCreate, onCreate }) {
  const rows = query.data?.data ?? []
  const pagination = query.data?.pagination ?? { page: 1, pageSize: 25, total: 0 }
  const columns = useMemo(() => buildColumns(onOpen), [onOpen])

  if (query.isError) return <ErrorState title="No se pudieron cargar los items" description={query.error?.message} onRetry={() => query.refetch()} showReport={false} />
  if (query.isLoading) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}</div>
  if (rows.length === 0) {
    return (
      <EmptyState icon={PackageOpen} title="No hay items" description="Cambia los filtros o la carpeta para ver otros resultados."
        action={canCreate ? <Button onClick={onCreate}>Agregar item</Button> : undefined} />
    )
  }
  return (
    <div className="space-y-3">
      {isDesktop ? (
        <DataTable columns={columns} data={rows} showToolbar={false} showPagination={false} pageSize={Math.max(rows.length, 25)} getRowId={(r) => r.id} />
      ) : (
        <div className="space-y-2">{rows.map((item) => <ItemCard key={item.id} item={item} onOpen={onOpen} />)}</div>
      )}
      <Pager pagination={pagination} onPage={onPage} />
    </div>
  )
}
