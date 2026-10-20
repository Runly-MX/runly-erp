import { useMemo, useState } from 'react'
import { itemLabel } from '../lib/item-label.js'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState, ConfirmDialog, RecordHeader, DetailSkeleton } from '@runly/ui'
import { InventoryItemPresentation } from '@runly/ui/integrations'
import { ArrowLeft, Plus, PowerOff, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { useInventoryItem, useDeleteInventoryItem } from '../hooks/useInventoryItems.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { ItemAreaCard } from '../components/areas/ItemAreaCard.jsx'
import { componentRegistry } from '../../../lib/moduleComponentRegistry.js'
import { CanvasReferences } from '../../runly.canvas/components/CanvasReferences.jsx'
import { ConnectionSections } from '../../../shell/connections/ConnectionSections.jsx'
import { CustodyRelatedCard } from '../components/custody/CustodyRelatedList.jsx'
import { useMiraiRecordContext, openMiraiSidebar } from '../../runly.chat/lib/miraiPageContext.js'

const API_BASE = getApiUrl()

export default function InventoryItemDetail() {
  const { '*': wildcard } = useParams()
  const id = useMemo(() => (wildcard ?? '').split('/')[1] ?? null, [wildcard])
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { session } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()

  const { data, isLoading } = useInventoryItem(id)
  const deleteItem = useDeleteInventoryItem()
  const item = data?.data ?? data
  // The "Etiqueta / QR" section is shown only with inventory.label.read.
  const canReadLabels = useInventoryCan()('inventory.label.read')
  const detailData = useMemo(() => (item ? { ...item, canReadLabels } : item), [item, canReadLabels])
  useMiraiRecordContext({ recordType: 'item', recordId: id, label: item?.name })

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <DetailSkeleton />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState title="Item no encontrado" />
      </div>
    )
  }

  // A deregistered item is read-only (the API refuses edits too).
  const readOnly = item.adminStatus === 'deregistered'

  const handleDelete = async () => {
    await deleteItem.mutateAsync(id)
    toast.success('Activo desactivado', { description: 'Puedes reactivarlo o eliminarlo definitivamente en Desactivados.' })
    navigate('/app/m/runly.inventory/inventory')
  }

  return (
    <div className="px-4 pb-6 md:px-6 space-y-6 min-h-dvh">
      <RecordHeader
        bleed
        crumbs={[
          { label: 'Inventario', onClick: () => navigate('/app/m/runly.inventory/inventory') },
          { label: itemLabel(item) },
        ]}
        title={itemLabel(item)}
        actions={[
          { key: 'back', label: 'Volver', icon: <ArrowLeft className="h-4 w-4" />, placement: 'collapse', onClick: () => navigate('/app/m/runly.inventory/inventory') },
          { key: 'ai', label: 'Consultar con IA', icon: <Sparkles className="h-4 w-4" />, placement: 'menu', onClick: () => openMiraiSidebar() },
          { key: 'new', label: 'Nuevo inventario', icon: <Plus className="h-4 w-4" />, placement: 'menu', onClick: () => navigate('/app/m/runly.inventory/inventory/new') },
          { key: 'deactivate', label: 'Desactivar', icon: <PowerOff className="h-4 w-4" />, placement: 'menu', destructive: true, onClick: () => setDeleteOpen(true) },
          { key: 'edit', label: 'Editar', variant: 'default', hidden: readOnly, onClick: () => navigate(`/app/m/runly.inventory/inventory/${id}/edit`) },
        ]}
      />
      <InventoryItemPresentation
        data={detailData}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE}
        componentRegistry={componentRegistry}
        onBack={() => navigate('/app/m/runly.inventory/inventory')}
        onFilterByValue={({ param, value }) => navigate(`/app/m/runly.inventory/inventory?${new URLSearchParams({ [param]: value })}`)}
        onEdit={readOnly ? undefined : () => navigate(`/app/m/runly.inventory/inventory/${id}/edit`)}
        mainExtra={<><ItemAreaCard itemId={id} areaId={item.areaId ?? null} canEdit={!readOnly} /><CustodyRelatedCard itemId={id} /><ConnectionSections targetType="inventory_item" targetId={id} /></>}
        asideExtra={<CanvasReferences moduleKey="runly.inventory" entityType="inventory_item" entityId={id} />}
        heroActions={false}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Desactivar activo"
        description={`"${itemLabel(item)}": Dejará de mostrarse en el inventario; sus datos se conservan. Podrás reactivarlo o eliminarlo definitivamente en Inventario > Desactivados.`}
        confirmLabel="Desactivar"
        onConfirm={handleDelete}
      />
    </div>
  )
}
