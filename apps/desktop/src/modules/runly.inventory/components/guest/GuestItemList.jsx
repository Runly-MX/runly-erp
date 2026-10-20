import { useMemo } from 'react'
import { Badge, Button, DataTable, EmptyState, ErrorState, PageFooter, Skeleton } from '@runly/ui'
import { ImageOff, PackageOpen } from 'lucide-react'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'
import { GUEST_STATUS_LABEL } from '../../lib/guest-session.js'
import { muted } from './GuestPortalParts.jsx'

function Thumb({ url, className = 'h-14 w-14' }) {
  return (
    <span className={`flex ${className} shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]`}>
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className={`h-4 w-4 ${muted}`} />}
    </span>
  )
}

const statusBadge = (item) => (
  <span className="flex shrink-0 flex-col items-end gap-1">
    <InventoryAdminStatusBadge status={item.adminStatus} />
    {item.status ? <Badge variant="secondary">{GUEST_STATUS_LABEL[item.status] ?? item.status}</Badge> : null}
  </span>
)

function ItemCard({ item, onOpen }) {
  const sub = [item.categoryName, item.brandName, item.model].filter(Boolean).join(' · ')
  return (
    <button type="button" onClick={() => onOpen(item.id)}
      className="flex min-h-14 w-full items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left transition-colors hover:bg-[hsl(var(--muted))]/50">
      <Thumb url={item.coverUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        {item.folio ? <span className={`block font-mono text-xs ${muted}`}>{item.folio}</span> : null}
        {sub ? <span className={`block truncate text-xs ${muted}`}>{sub}</span> : null}
        {item.locationName ? <span className={`block truncate text-xs ${muted}`}>{item.locationName}</span> : null}
      </span>
      {statusBadge(item)}
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
    { id: 'status', header: 'Estado', enableSorting: false, cell: ({ row }) => statusBadge(row.original) },
  ]
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
      <PageFooter
        total={pagination.total} pageIndex={pagination.page - 1} pageSize={pagination.pageSize}
        pageCount={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
        canPrevious={pagination.page > 1} canNext={pagination.page * pagination.pageSize < pagination.total}
        onPrevious={() => onPage(pagination.page - 1)} onNext={() => onPage(pagination.page + 1)} onPageChange={(i) => onPage(i + 1)}
      />
    </div>
  )
}
