import { useMemo, useState } from 'react'
import { Alert, Button, ErrorState, PageHeader, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@runly/ui'
import { ChevronDown, FileSpreadsheet, FolderTree, Lock, Plus } from 'lucide-react'
import { useIsDesktop } from '../../../../hooks/useIsDesktop.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { capabilitiesFor, importAreaOptions, writableAreas } from '../../lib/guest-capabilities.js'
import { GuestAreaNav } from './GuestAreaNav.jsx'
import { GuestImportDialog } from './GuestImportDialog.jsx'
import { GuestItemsTable } from './GuestItemsTable.jsx'

const coarse = '[@media(pointer:coarse)]:min-h-11'

// Item list with folder navigation (only the folders the supplier was invited to) and the same table as the
// main inventory (search, filters, columns, views and numbered pagination). The single primary action is "Agregar item"; Excel import is secondary.
export function GuestListView({ me, onOpen, onCreate, onEdit = null }) {
  const isDesktop = useIsDesktop()
  const [areaId, setAreaId] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const areas = useMemo(() => me.data?.areas ?? [], [me.data])
  const canCreate = writableAreas(me.data).length > 0
  const readOnly = areas.length > 0 && !canCreate
  const canImport = capabilitiesFor(me.data, areaId).canImport && importAreaOptions(me.data).length > 0

  const nav = <GuestAreaNav areas={areas} value={areaId} onChange={(id) => { setAreaId(id); setNavOpen(false) }} />
  const title = areaId ? areaPathLabel(areas, areaId) : 'Inventario'
  const folderButton = (
    <Button type="button" variant="outline" size="sm" className={`${coarse} max-w-56`} disabled={me.isLoading} aria-label="Elegir carpeta" onClick={isDesktop ? undefined : () => setNavOpen(true)}>
      <FolderTree className="mr-1.5 h-4 w-4 shrink-0" /><span className="truncate">{areaId ? areaPathLabel(areas, areaId) : 'Todas mis carpetas'}</span><ChevronDown className="ml-1.5 h-4 w-4 shrink-0" />
    </Button>
  )

  return (
    <div>
      <main className="min-w-0 space-y-4">
        <PageHeader
          title={title}
          description={me.data ? `${areas.length} ${areas.length === 1 ? 'carpeta' : 'carpetas'} con acceso` : undefined}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {isDesktop ? (
                <Popover open={navOpen} onOpenChange={setNavOpen}>
                  <PopoverTrigger asChild>{folderButton}</PopoverTrigger>
                  <PopoverContent align="end" className="max-h-[70dvh] w-72 overflow-y-auto overscroll-contain p-2">{nav}</PopoverContent>
                </Popover>
              ) : folderButton}
              {canImport ? <Button type="button" variant="outline" size="sm" className={coarse} onClick={() => setImportOpen(true)}><FileSpreadsheet className="mr-1.5 h-4 w-4" />Importar desde Excel</Button> : null}
              {canCreate ? <Button type="button" size="sm" className={coarse} onClick={onCreate}><Plus className="mr-1.5 h-4 w-4" />Agregar item</Button> : null}
            </div>
          )}
        />
        {readOnly ? <Alert><Lock className="h-4 w-4" /><p className="text-sm">Tu acceso es de solo lectura: puedes consultar los items pero no modificarlos.</p></Alert> : null}
        {me.isError ? (
          <ErrorState title="No se pudo cargar tu acceso" description={me.error?.message} onRetry={() => me.refetch()} showReport={false} />
        ) : (
          <GuestItemsTable areaId={areaId} onOpen={onOpen} onEdit={canCreate ? onEdit : null} />
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
