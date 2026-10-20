import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, ErrorState, PageHeader, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton } from '@runly/ui'
import { FileSpreadsheet, FolderTree, Lock, Plus } from 'lucide-react'
import { useIsDesktop } from '../../../../hooks/useIsDesktop.js'
import { useGuestCatalogs, useGuestItems } from '../../hooks/useInventoryGuest.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { capabilitiesFor, importAreaOptions, writableAreas } from '../../lib/guest-capabilities.js'
import { GuestAreaNav } from './GuestAreaNav.jsx'
import { GuestImportDialog } from './GuestImportDialog.jsx'
import { EMPTY_FILTERS, GuestItemFilters, filtersToQuery } from './GuestItemFilters.jsx'
import { GuestItemList } from './GuestItemList.jsx'

const PAGE_SIZE = 25
const coarse = '[@media(pointer:coarse)]:min-h-11'

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// Item list with folder navigation (only the folders the supplier was invited to), search, filters
// and numbered pagination. The single primary action is "Agregar item"; Excel import is secondary.
export function GuestListView({ me, onOpen, onCreate }) {
  const isDesktop = useIsDesktop()
  const catalogs = useGuestCatalogs()
  const [areaId, setAreaId] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [importOpen, setImportOpen] = useState(false)
  const debounced = useDebounced(search.trim())

  const areas = useMemo(() => me.data?.areas ?? [], [me.data])
  const canCreate = writableAreas(me.data).length > 0
  const readOnly = areas.length > 0 && !canCreate
  const canImport = capabilitiesFor(me.data, areaId).canImport && importAreaOptions(me.data).length > 0

  const query = useMemo(() => ({
    ...(debounced ? { search: debounced } : {}), ...filtersToQuery(filters),
    ...(areaId ? { areaId } : {}), page, pageSize: PAGE_SIZE,
  }), [debounced, filters, areaId, page])
  const items = useGuestItems(query)
  useEffect(() => { setPage(1) }, [debounced, filters, areaId])

  const nav = <GuestAreaNav areas={areas} value={areaId} onChange={(id) => { setAreaId(id); setNavOpen(false) }} />
  const title = areaId ? areaPathLabel(areas, areaId) : 'Inventario'

  return (
    <div className="flex gap-6">
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
            <div className="flex flex-wrap items-center gap-2">
              {!isDesktop ? <Button type="button" variant="outline" size="sm" className={coarse} onClick={() => setNavOpen(true)}><FolderTree className="mr-1.5 h-4 w-4" />Carpetas</Button> : null}
              {canImport ? <Button type="button" variant="outline" size="sm" className={coarse} onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-1.5 h-4 w-4" />Importar desde Excel</Button> : null}
              {canCreate ? <Button type="button" size="sm" className={coarse} onClick={onCreate}><Plus className="mr-1.5 h-4 w-4" />Agregar item</Button> : null}
            </div>
          )}
        />
        {readOnly ? <Alert><Lock className="h-4 w-4" /><p className="text-sm">Tu acceso es de solo lectura: puedes consultar los items pero no modificarlos.</p></Alert> : null}
        {me.isError ? (
          <ErrorState title="No se pudo cargar tu acceso" description={me.error?.message} onRetry={() => me.refetch()} showReport={false} />
        ) : (
          <>
            <GuestItemFilters search={search} onSearch={setSearch} filters={filters} onFilters={setFilters} catalogs={catalogs.data} />
            <GuestItemList query={items} isDesktop={isDesktop} onOpen={onOpen} onPage={setPage} canCreate={canCreate} onCreate={onCreate} />
          </>
        )}
      </main>

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
      {canImport ? <GuestImportDialog open={importOpen} onOpenChange={setImportOpen} me={me.data} /> : null}
    </div>
  )
}
