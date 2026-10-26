import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Activity, Boxes, CalendarPlus, Download, FolderInput, GitPullRequestArrow, FolderOpen, FolderTree, MapPin, PanelLeft, PanelLeftClose, Plus, QrCode, ShieldCheck, ShoppingCart, Sparkles, Tag, Upload, UserCheck, Wrench } from 'lucide-react'
import { RunlyTable, Badge, Button, ConfirmDialog, EmptyState, PageHeader, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { useInventoryCategories, useInventoryBrands, useInventoryLocations } from '../hooks/useInventoryCatalogs.js'
import { useInventoryModels } from '../hooks/useInventoryModels.js'
import { ITEM_STATUSES } from '../lib/inventory-constants.js'
import { useMiraiRecordContext, openMiraiSidebar } from '../../runly.chat/lib/miraiPageContext.js'
import { InventoryItemImportDialog } from '../components/InventoryItemImportDialog.jsx'
import { InventoryExportDialog } from '../components/InventoryExportDialog.jsx'
import { InventoryAdminKpis } from '../components/InventoryAdminKpis.jsx'
import { InventoryAdminTransitionDialog } from '../components/InventoryAdminTransitionDialog.jsx'
import { useInventoryCan, useInventoryConditions, useInventorySummary } from '../hooks/useInventoryAdmin.js'
import { ADMIN_ACTIONS, ADMIN_FILTER_OPTIONS, ADMIN_STATUSES } from '../lib/admin-status.js'
import { buildLabelsPath } from '../lib/label-queue.js'
import { useAreaChoices } from '../hooks/useAreaChoices.js'
import { AreaMoveDialog } from '../components/areas/AreaMoveDialog.jsx'
import { AreaTreeDock } from '../components/areas/AreaTreeDock.jsx'
import { AreaTreePanel } from '../components/areas/AreaTreePanel.jsx'
import { useAreaTreeDock } from '../hooks/useAreaTreeDock.js'
import { areaPathLabel } from '../lib/area-tree.js'
import { componentRegistry } from '../../../lib/moduleComponentRegistry.js'
import { customFieldValueLabel } from '../lib/custom-field-filter.js'
import { InventoryProposalsSheet } from '../components/proposals/InventoryProposalsSheet.jsx'
import { useChangeProposals } from '../hooks/useChangeProposals.js'

const ADMIN_COLORS = Object.fromEntries(ADMIN_STATUSES.map(s => [s.value, s.color]))
const STATUS_OPTIONS = ITEM_STATUSES.map(s => ({ value: s.value, label: s.label }))
// Deep links from Catálogos (e.g. ?categoryId=...) open the list pre-filtered.
// Exact-match text filters opened from the detail view magnifier (?serialNumber=...).
const TEXT_FILTER_LABELS = { model: 'Modelo', folio: 'Folio', assetTag: 'N.º de activo', serialNumber: 'No. Serie', partNumber: 'N.º de parte' }
const URL_FILTERS = ['status', 'adminStatus', 'conditionId', 'categoryId', 'brandId', 'locationId', 'modelId', 'createdFrom', 'createdTo', 'labeled', 'areaId', 'mine', 'customField', ...Object.keys(TEXT_FILTER_LABELS)]
const MINE_OPTIONS = [{ value: 'true', label: 'Solo mis items' }]
const LABELED_OPTIONS = [{ value: 'false', label: 'Sin etiquetar' }, { value: 'true', label: 'Etiquetados' }]
const ADMIN_OPTIONS = ADMIN_STATUSES.map(s => ({ value: s.value, label: s.label }))

export default function InventoryScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilters = useMemo(
    () => Object.fromEntries(URL_FILTERS.map(key => [key, searchParams.get(key)]).filter(([, value]) => value)),
    [searchParams],
  )
  const initialSearch = searchParams.get('search') ?? ''
  // areaId is excluded: the folder tree drives it through `externalFilters`, without remounting the table.
  const filterKey = JSON.stringify({ ...initialFilters, areaId: undefined, search: initialSearch })
  const { session } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()
  const queryClient = useQueryClient()

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [proposalsOpen, setProposalsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // What the table currently shows (selection, search, filters, total), for the export dialog.
  const [tableContext, setTableContext] = useState({ selectedIds: [], search: '', filters: {}, total: 0 })
  // Only users who can update items review proposals (the API also limits them to the areas they can write).
  const canReviewProposals = useInventoryCan()('inventory.item.update')
  const pendingProposals = useChangeProposals({ enabled: canReviewProposals }).data?.length ?? 0
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [bulk, setBulk] = useState(null)
  const [moveIds, setMoveIds] = useState(null)
  const areaChoices = useAreaChoices()
  const dock = useAreaTreeDock()
  const showTree = !areaChoices.noAccess && areaChoices.areas.length > 0
  const areaValue = searchParams.get('areaId') ?? ''
  // Folder tree and the table's "Área" filter share one value, kept in the URL.
  const areaValueRef = useRef(areaValue)
  const lastTableArea = useRef(initialFilters.areaId ?? '')
  const selectArea = useCallback((value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set('areaId', value)
      else next.delete('areaId')
      return next
    }, { replace: true })
  }, [setSearchParams])
  const selectAreaRef = useRef(selectArea)
  useEffect(() => { areaValueRef.current = areaValue; selectAreaRef.current = selectArea })
  const can = useInventoryCan()
  // Label stats come only with inventory.label.read; printing needs inventory.label.print.
  const canReadLabels = can('inventory.label.read')
  const canPrintLabels = can('inventory.label.print')
  const summary = useInventorySummary()
  // Published to the global MirAI sidebar (shared contract: selection =
  // { mode: "filtered" | "selected", ids, filters }) — null when the list has
  // neither a selection nor active filters, so no selection is published.
  const [miraiSelection, setMiraiSelection] = useState(null)
  const updateMiraiSelection = useCallback(({ selectedIds, search, filters, total }) => {
    setTableContext(current => (JSON.stringify(current) === JSON.stringify({ selectedIds, search, filters, total }) ? current : { selectedIds, search, filters, total }))
    const tableArea = filters?.areaId ?? ''
    if (tableArea !== lastTableArea.current) {
      lastTableArea.current = tableArea
      if (tableArea !== areaValueRef.current) selectAreaRef.current(tableArea)
    }
    const activeFilters = Object.fromEntries(Object.entries({ ...filters, search }).filter(([, value]) => value !== '' && value != null && value !== 'all'))
    const next = selectedIds.length
      ? { mode: 'selected', ids: selectedIds, filters: {} }
      : Object.keys(activeFilters).length
        ? { mode: 'filtered', ids: [], filters: activeFilters }
        : null
    setMiraiSelection(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
  }, [])
  useMiraiRecordContext({ selection: miraiSelection })

  const { data: categoriesData } = useInventoryCategories()
  const { data: brandsData } = useInventoryBrands()
  const { data: locationsData } = useInventoryLocations()

  const categoryOptions = useMemo(
    () => (categoriesData?.data ?? []).map(c => ({ value: c.id, label: c.name })),
    [categoriesData?.data],
  )
  const brandOptions = useMemo(
    () => (brandsData?.data ?? []).map(b => ({ value: b.id, label: b.name })),
    [brandsData?.data],
  )
  const locationOptions = useMemo(
    () => (locationsData?.data ?? []).map(l => ({ value: l.id, label: l.name })),
    [locationsData?.data],
  )
  const { data: conditionsData } = useInventoryConditions()
  const conditionOptions = useMemo(
    () => (conditionsData?.data ?? []).map(c => ({ value: c.id, label: c.name })),
    [conditionsData?.data],
  )

  // One bulk action per administrative transition the user may perform,
  // shown only when every selected item is in that action's source status.
  const bulkActions = useMemo(() => [
    ...(canPrintLabels ? [(rows) => (rows.length ? {
      label: 'Imprimir etiquetas',
      icon: QrCode,
      onClick: (selected) => navigate(buildLabelsPath({ itemIds: selected.map(r => r.id) }), { state: { labelItems: selected } }),
    } : null)] : []),
    ...(can('inventory.item.update') && areaChoices.writeOptions.length > 0 ? [(rows) => (rows.length ? {
      label: 'Mover a área',
      icon: FolderInput,
      onClick: (selected) => setMoveIds(selected.map(r => r.id)),
    } : null)] : []),
    ...Object.entries(ADMIN_ACTIONS)
      .filter(([, action]) => can(action.permission))
      .map(([key, action]) => (rows) => (rows.length && rows.every(r => r.adminStatus === action.from)
        ? { label: action.label, variant: action.destructive ? 'destructive' : undefined, onClick: (selected) => setBulk({ action: key, ids: selected.map(r => r.id) }) }
        : null)),
  ], [can, canPrintLabels, navigate, areaChoices.writeOptions])

  // Only needed to label a ?modelId= deep link; the list has no model filter otherwise.
  const { data: modelsData } = useInventoryModels()
  const modelOptions = useMemo(() => (modelsData ?? []).map(m => ({ value: m.id, label: m.name })), [modelsData])

  const blueprint = useMemo(() => ({
    key: 'inventory.items.table',
    schema: {
      apiPath: '/inventory/items',
      primaryField: 'name',
      // List/grid cards show the tag under the item's name.
      subtitleField: 'assetTag',
      searchable: true,
      searchPlaceholder: 'Buscar por serie, activo, nombre, colaborador, compra, comentario...',
      columns: [
        {
          field: 'coverImageFileId',
          label: 'Imagen',
          type: 'image-asset',
          sortable: false,
          imagesApiPath: '/inventory/items/:id/files',
        },
        { field: 'folio',          label: 'Folio', sortable: true },
        { field: 'assetTag',       label: 'N.º de activo', sortable: true  },
        { field: 'name',           label: 'Nombre',      sortable: true,  link: true },
        { field: 'categoryName',   label: 'Tipo',        sortable: true  },
        { field: 'brandName',      label: 'Marca',       sortable: true  },
        { field: 'areaName',       label: 'Área',        sortable: true  },
        {
          field: 'status', label: 'Disponibilidad', sortable: true, type: 'select',
          options: STATUS_OPTIONS,
        },
        { field: 'adminStatus',    label: 'Estado',      sortable: true,  type: 'select', options: ADMIN_OPTIONS },
        { field: 'assignedToName', label: 'Responsable', sortable: true  },
        { field: 'purchaseInvoiceNumber', label: 'Factura', sortable: false },
        { field: 'purchaseOrderNumber', label: 'Orden de compra', sortable: false },
        ...(canReadLabels ? [{ field: 'labelPrintCount', label: 'Etiqueta', sortable: false, component: 'runly.inventory:LabelStateCell' }] : []),
        { field: 'conditionName',  label: 'Condición',   sortable: true,  defaultVisible: false },
        { field: 'locationName',   label: 'Ubicacion',   sortable: true,  defaultVisible: false },
        { field: 'serialNumber',   label: 'No. Serie',   sortable: true,  defaultVisible: false },
        { field: 'model',          label: 'Modelo',      sortable: true,  defaultVisible: false },
        { field: 'purchaseDate',   label: 'Compra',      sortable: true,  type: 'date', defaultVisible: false },
        { field: 'warrantyExpiry', label: 'Garantia',    sortable: true,  type: 'date', defaultVisible: false },
        { field: 'createdAt',      label: 'Alta',        sortable: true,  type: 'date', defaultVisible: false },
        { field: 'updatedAt',      label: 'Actualizado', sortable: true,  type: 'date', defaultVisible: false },
      ],
      filters: [
        { key: 'adminStatus', label: 'Estado', type: 'select', icon: ShieldCheck, options: ADMIN_FILTER_OPTIONS.map(o => ({ ...o, color: ADMIN_COLORS[o.value] })) },
        { key: 'status',     label: 'Disponibilidad', type: 'select', icon: Activity, options: STATUS_OPTIONS },
        { key: 'conditionId', label: 'Condición', type: 'select', icon: Wrench, options: conditionOptions },
        { key: 'categoryId', label: 'Tipo', type: 'select', icon: Boxes, options: categoryOptions },
        { key: 'brandId',    label: 'Marca',     type: 'select', icon: Tag, options: brandOptions },
        { key: 'locationId', label: 'Ubicación', type: 'select', icon: MapPin, options: locationOptions },
        // -> areaId=<uuid>|__none__ (General); only when the user has areas to filter by.
        ...(areaChoices.filterOptions.length ? [{ key: 'areaId', label: 'Área', type: 'select', icon: FolderTree, options: areaChoices.filterOptions }] : []),
        // -> mine=true: items I created or that are assigned to me (the API resolves who I am).
        { key: 'mine',       label: 'Míos', type: 'select', icon: UserCheck, options: MINE_OPTIONS },
        // -> labeled=false|true on /inventory/items (print log based).
        { key: 'labeled',    label: 'Etiqueta', type: 'select', icon: QrCode, options: LABELED_OPTIONS },
        ...Object.entries(TEXT_FILTER_LABELS)
          .filter(([key]) => initialFilters[key])
          .map(([key, label]) => ({ key, label, type: 'select', options: [{ value: initialFilters[key], label: initialFilters[key] }] })),
        ...(initialFilters.customField ? [{ key: 'customField', label: searchParams.get('customFieldLabel') || 'Campo personalizado', type: 'select', options: [{ value: initialFilters.customField, label: customFieldValueLabel(initialFilters.customField) }] }] : []),
        ...(initialFilters.modelId ? [{ key: 'modelId', label: 'Modelo', type: 'select', options: modelOptions }] : []),
        // -> createdFrom/createdTo and purchaseFrom/purchaseTo on /inventory/items.
        { key: 'created',    label: 'Fecha de alta',   type: 'daterange', icon: CalendarPlus },
        { key: 'purchase',   label: 'Fecha de compra', type: 'daterange', icon: ShoppingCart },
      ],
      emptyState: { message: 'No hay activos registrados.' },
    },
  }), [categoryOptions, brandOptions, locationOptions, conditionOptions, modelOptions, initialFilters, searchParams, canReadLabels, areaChoices.filterOptions])

  const deleteMutation = useMutation({
    mutationFn: id => runly.inventory.deleteItem(id, token),
    onSuccess: () => {
      setConfirmDelete(null)
      setRefreshSignal(s => s + 1)
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] })
      toast.success('Activo desactivado', { description: 'Puedes reactivarlo o eliminarlo definitivamente en Desactivados.' })
    },
    onError: err => toast.error(err?.message ?? 'No se pudo eliminar el activo'),
  })

  const openItem = useCallback(row => {
    queryClient.prefetchQuery({
      queryKey: ['inventory', 'items', row.id],
      queryFn: () => runly.inventory.getItem(row.id, token),
      staleTime: 5 * 60 * 1000,
    })
    navigate(`/app/m/runly.inventory/inventory/${row.id}`)
  }, [queryClient, token, navigate])

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-dvh">
      <PageHeader
        eyebrow="Runly Inventario"
        title="Inventario"
        description="Gestiona y rastrea todos los activos de la empresa"
        actions={
          <>
          {showTree ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={dock.active ? 'secondary' : 'outline'}
                    size="icon"
                    aria-label={dock.active ? 'Ocultar carpetas' : 'Mostrar carpetas'}
                    aria-pressed={dock.active}
                    onClick={dock.toggle}
                  >
                    {dock.active ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{dock.active ? 'Ocultar carpetas' : 'Mostrar carpetas'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {canReviewProposals ? (
            <Button variant="outline" onClick={() => setProposalsOpen(true)}>
              <GitPullRequestArrow className="mr-2 h-4 w-4" />Propuestas
              {pendingProposals > 0 ? <Badge className="ml-2 px-1.5 py-0">{pendingProposals}</Badge> : null}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => openMiraiSidebar()}><Sparkles className="mr-2 h-4 w-4" />Consultar con IA</Button>
          <Button variant="outline" onClick={() => setExportOpen(true)}><Download className="mr-2 h-4 w-4" />Exportar</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Importar</Button>
          <Button variant="outline" onClick={() => navigate('/app/m/runly.inventory/inventory/intake')}><Sparkles className="mr-2 h-4 w-4" />Registro con IA</Button>
          <Button onClick={() => navigate('/app/m/runly.inventory/inventory/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo item
          </Button>
          </>
        }
      />

      {areaChoices.noAccess ? (
        <EmptyState
          icon={FolderTree}
          title="No tienes áreas de inventario asignadas"
          description="Pide acceso a un administrador."
        />
      ) : (<>
      <InventoryAdminKpis
        summary={summary.data}
        isLoading={summary.isLoading}
        active={searchParams.get('adminStatus') || null}
        onSelect={(value) => {
          const next = new URLSearchParams(searchParams)
          if (searchParams.get('adminStatus') === value) next.delete('adminStatus')
          else next.set('adminStatus', value)
          setSearchParams(next, { replace: true })
        }}
      />

      <div ref={dock.containerRef} className="flex items-start">
      {showTree && dock.isDesktop ? (
        <AreaTreeDock dock={dock} areas={areaChoices.areas} value={areaValue} onSelect={selectArea} loading={areaChoices.isLoading} />
      ) : null}
      <div className="min-w-0 flex-1 space-y-2">
      {showTree && areaValue ? (
        <p className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
          <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{areaValue === '__none__' ? 'General (sin área)' : areaPathLabel(areaChoices.areas, areaValue)}</span>
        </p>
      ) : null}
      <RunlyTable
        externalFilters={{ areaId: areaValue }}
        key={`${activeCompanyId}:${filterKey}`}
        bulkActions={bulkActions}
        onExport={() => setExportOpen(true)}
        initialFilters={initialFilters}
        initialSearch={initialSearch}
        onContextChange={updateMiraiSelection}
        blueprint={blueprint}
        componentRegistry={componentRegistry}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={getApiUrl()}
        onView={openItem}
        onRowOpen={openItem}
        rowHref={row => `/app/m/runly.inventory/inventory/${row.id}`}
        onEdit={row => navigate(`/app/m/runly.inventory/inventory/${row.id}/edit`)}
        onDelete={row => setConfirmDelete(row)}
        deleteLabel="Desactivar"
        refreshSignal={refreshSignal}
      />
      </div>
      </div>
      </>)}

      {showTree && !dock.isDesktop ? (
        <Sheet open={dock.sheetOpen} onOpenChange={dock.setSheetOpen}>
          <SheetContent side="left" className="flex w-full flex-col sm:max-w-sm">
            <SheetHeader className="shrink-0">
              <SheetTitle className="flex items-center gap-2"><FolderTree className="h-5 w-5" />Carpetas</SheetTitle>
              <SheetDescription>Elige un área para filtrar el inventario.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AreaTreePanel
                areas={areaChoices.areas}
                value={areaValue}
                touch
                onSelect={(value) => { selectArea(value); dock.setSheetOpen(false) }}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}


      <InventoryAdminTransitionDialog
        action={bulk?.action}
        ids={bulk?.ids}
        open={Boolean(bulk)}
        onOpenChange={(open) => { if (!open) setBulk(null) }}
        onDone={() => setRefreshSignal(s => s + 1)}
      />

      <AreaMoveDialog
        open={Boolean(moveIds)}
        onOpenChange={(open) => { if (!open) setMoveIds(null) }}
        itemIds={moveIds ?? []}
        options={areaChoices.writeOptions}
        onDone={() => setRefreshSignal(s => s + 1)}
      />

      <InventoryProposalsSheet open={proposalsOpen} onOpenChange={setProposalsOpen} />

      <InventoryExportDialog open={exportOpen} onOpenChange={setExportOpen} context={tableContext} />

      <InventoryItemImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => setRefreshSignal(s => s + 1)} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={v => !v && setConfirmDelete(null)}
        title="Desactivar activo"
        description="Dejará de mostrarse en el inventario; sus datos se conservan. Podrás reactivarlo o eliminarlo definitivamente en Inventario > Desactivados."
        detail={confirmDelete ? [confirmDelete.assetTag, confirmDelete.name].filter(Boolean).join(' — ') : ''}
        confirmLabel="Desactivar"
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
