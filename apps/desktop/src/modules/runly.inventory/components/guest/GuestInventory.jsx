import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, ErrorState, PageHeader, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton } from '@runly/ui'
import { FolderTree, Lock, Plus } from 'lucide-react'
import { useIsDesktop } from '../../../../hooks/useIsDesktop.js'
import { useGuestCatalogs, useGuestItems, useGuestMe, useGuestSession } from '../../hooks/useInventoryGuest.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { GuestAreaNav } from './GuestAreaNav.jsx'
import { GuestBrandBar, muted } from './GuestPortalParts.jsx'
import { GuestItemDetail } from './GuestItemDetail.jsx'
import { GuestItemDialog } from './GuestItemDialog.jsx'
import { EMPTY_FILTERS, GuestItemFilters, filtersToQuery } from './GuestItemFilters.jsx'
import { GuestItemList } from './GuestItemList.jsx'

const PAGE_SIZE = 25

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// Simplified inventory for a signed-in supplier: its folders, items, detail and forms.
export function GuestInventory() {
  const { session, logout } = useGuestSession()
  const isDesktop = useIsDesktop()
  const me = useGuestMe()
  const catalogs = useGuestCatalogs()
  const [areaId, setAreaId] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState(null)
  const [form, setForm] = useState({ open: false, item: null })
  const debounced = useDebounced(search.trim())

  const areas = useMemo(() => me.data?.areas ?? [], [me.data])
  const canCreate = areas.some((a) => a.canWrite)
  const readOnly = areas.length > 0 && !canCreate

  const query = useMemo(() => ({
    ...(debounced ? { search: debounced } : {}), ...filtersToQuery(filters),
    ...(areaId ? { areaId } : {}), page, pageSize: PAGE_SIZE,
  }), [debounced, filters, areaId, page])
  const items = useGuestItems(query)

  useEffect(() => { setPage(1) }, [debounced, filters, areaId])
  const openItem = useCallback((id) => setDetailId(id), [])
  const detailAreaName = areas.length && detailId ? areaPathLabel(areas, items.data?.data?.find((i) => i.id === detailId)?.areaId) : ''

  const selectArea = (id) => { setAreaId(id); setNavOpen(false) }
  const nav = <GuestAreaNav areas={areas} value={areaId} onChange={selectArea} />
  const title = areaId ? areaPathLabel(areas, areaId) : 'Inventario'

  return (
    <div className="min-h-dvh">
      <GuestBrandBar companyName={me.data?.company?.name ?? session?.company?.name} guestName={me.data?.guest?.name ?? session?.guest?.name} onLogout={logout} />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5 md:px-8">
        {isDesktop ? (
          <aside className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-64 shrink-0 self-start overflow-y-auto overscroll-contain md:block">
            {me.isLoading ? <Skeleton className="h-40 w-full" /> : nav}
          </aside>
        ) : null}
        <main className="min-w-0 flex-1 space-y-4">
          <PageHeader
            title={title}
            description={me.data ? `${areas.length} ${areas.length === 1 ? 'carpeta' : 'carpetas'} con acceso` : undefined}
            actions={(
              <div className="flex items-center gap-2">
                {!isDesktop ? <Button type="button" variant="outline" size="sm" onClick={() => setNavOpen(true)}><FolderTree className="mr-1.5 h-4 w-4" />Carpetas</Button> : null}
                {canCreate ? <Button type="button" size="sm" onClick={() => setForm({ open: true, item: null })}><Plus className="mr-1.5 h-4 w-4" />Agregar</Button> : null}
              </div>
            )}
          />
          {readOnly ? (
            <div className={`flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-3 py-2 text-sm ${muted}`}>
              <Lock className="h-4 w-4 shrink-0" />Tu acceso es de solo lectura: puedes consultar los items pero no modificarlos.
            </div>
          ) : null}
          {me.isError ? (
            <ErrorState title="No se pudo cargar tu acceso" description={me.error?.message} onRetry={() => me.refetch()} showReport={false} />
          ) : (
            <>
              <GuestItemFilters search={search} onSearch={setSearch} filters={filters} onFilters={setFilters} catalogs={catalogs.data} />
              <GuestItemList query={items} isDesktop={isDesktop} onOpen={openItem} onPage={setPage}
                canCreate={canCreate} onCreate={() => setForm({ open: true, item: null })} />
            </>
          )}
        </main>
      </div>

      {!isDesktop ? (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="flex w-full flex-col sm:max-w-sm">
            <SheetHeader className="shrink-0">
              <SheetTitle>Carpetas</SheetTitle>
              <SheetDescription>Elige la carpeta que quieres consultar.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">{nav}</div>
          </SheetContent>
        </Sheet>
      ) : null}

      <GuestItemDetail
        itemId={detailId} open={Boolean(detailId)} areaName={detailAreaName}
        onOpenChange={(v) => { if (!v) setDetailId(null) }}
        onEdit={(item) => setForm({ open: true, item })}
      />
      <GuestItemDialog
        open={form.open} item={form.item} areas={areas} defaultAreaId={areaId} catalogs={catalogs.data}
        onOpenChange={(v) => setForm((f) => ({ ...f, open: v }))}
      />
    </div>
  )
}
