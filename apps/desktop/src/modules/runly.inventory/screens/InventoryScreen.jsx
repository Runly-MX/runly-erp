import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Activity, Boxes, CalendarPlus, FolderInput, FolderTree, MapPin, Plus, QrCode, ShieldCheck, ShoppingCart, Sparkles, Tag, Upload, Wrench } from 'lucide-react'
import { RunlyTable, Button, ConfirmDialog, EmptyState, PageHeader } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { useInventoryCategories, useInventoryBrands, useInventoryLocations } from '../hooks/useInventoryCatalogs.js'
import { useInventoryModels } from '../hooks/useInventoryModels.js'
import { ITEM_STATUSES } from '../lib/inventory-constants.js'
import { useMiraiRecordContext, openMiraiSidebar } from '../../runly.chat/lib/miraiPageContext.js'
import { InventoryItemImportDialog } from '../components/InventoryItemImportDialog.jsx'
import { InventoryAdminKpis } from '../components/InventoryAdminKpis.jsx'
import { InventoryAdminTransitionDialog } from '../components/InventoryAdminTransitionDialog.jsx'
import { useInventoryCan, useInventoryConditions, useInventorySummary } from '../hooks/useInventoryAdmin.js'
import { ADMIN_ACTIONS, ADMIN_FILTER_OPTIONS, ADMIN_STATUSES } from '../lib/admin-status.js'
import { buildLabelsPath } from '../lib/label-queue.js'
import { useAreaChoices } from '../hooks/useAreaChoices.js'
import { AreaMoveDialog } from '../components/areas/AreaMoveDialog.jsx'
import { componentRegistry } from '../../../lib/moduleComponentRegistry.js'

const ADMIN_COLORS = Object.fromEntries(ADMIN_STATUSES.map(s => [s.value, s.color]))
const STATUS_OPTIONS = ITEM_STATUSES.map(s => ({ value: s.value, label: s.label }))
// Deep links from Catálogos (e.g. ?categoryId=...) open the list pre-filtered.
// Exact-match text filters opened from the detail view magnifier (?serialNumber=...).
const TEXT_FILTER_LABELS = { model: 'Modelo', folio: 'Folio', assetTag: 'N.º de activo', serialNumber: 'No. Serie', partNumber: 'N.º de parte' }
const URL_FILTERS = ['status', 'adminStatus', 'conditionId', 'categoryId', 'brandId', 'locationId', 'modelId', 'createdFrom', 'createdTo', 'labeled', 'areaId', ...Object.keys(TEXT_FILTER_LABELS)]
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
  const filterKey = JSON.stringify({ ...initialFilters, search: initialSearch })
  const { session } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()
  const queryClient = useQueryClient()

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [bulk, setBulk] = useState(null)
  const [moveIds, setMoveIds] = useState(null)
  const areaChoices = useAreaChoices()
  const can = useInventoryCan()
  // Label stats come only with inventory.label.read; printing needs inventory.label.print.
  const canReadLabels = can('inventory.label.read')
  const canPrintLabels = can('inventory.label.print')
  const summary = useInventorySummary()
  // Published to the global MirAI sidebar (shared contract: selection =
  // { mode: "filtered" | "selected", ids, filters }) — null when the list has
  // neither a selection nor active filters, so no selection is published.
  const [miraiSelection, setMiraiSelection] = useState(null)
  const updateMiraiSelection = useCallback(({ selectedIds, search, filters }) => {
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
        // -> labeled=false|true on /inventory/items (print log based).
        { key: 'labeled',    label: 'Etiqueta', type: 'select', icon: QrCode, options: LABELED_OPTIONS },
        ...Object.entries(TEXT_FILTER_LABELS)
          .filter(([key]) => initialFilters[key])
          .map(([key, label]) => ({ key, label, type: 'select', options: [{ value: initialFilters[key], label: initialFilters[key] }] })),
        ...(initialFilters.modelId ? [{ key: 'modelId', label: 'Modelo', type: 'select', options: modelOptions }] : []),
        // -> createdFrom/createdTo and purchaseFrom/purchaseTo on /inventory/items.
        { key: 'created',    label: 'Fecha de alta',   type: 'daterange', icon: CalendarPlus },
        { key: 'purchase',   label: 'Fecha de compra', type: 'daterange', icon: ShoppingCart },
      ],
      emptyState: { message: 'No hay activos registrados.' },
    },
  }), [categoryOptions, brandOptions, locationOptions, conditionOptions, modelOptions, initialFilters, canReadLabels, areaChoices.filterOptions])

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
          <Button variant="ghost" onClick={() => openMiraiSidebar()}><Sparkles className="mr-2 h-4 w-4" />Consultar con IA</Button>
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

      <RunlyTable
        key={`${activeCompanyId}:${filterKey}`}
        bulkActions={bulkActions}
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
        onEdit={row => navigate(`/app/m/runly.inventory/inventory/${row.id}/edit`)}
        onDelete={row => setConfirmDelete(row)}
        deleteLabel="Desactivar"
        refreshSignal={refreshSignal}
      />
      </>)}


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
