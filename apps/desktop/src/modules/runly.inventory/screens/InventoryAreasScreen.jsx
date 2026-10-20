import { useMemo, useState } from 'react'
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { FolderPlus, FolderTree } from 'lucide-react'
import { toast } from 'sonner'
import { AreaDialog } from '../components/areas/AreaDialog.jsx'
import { AreaMembersSheet } from '../components/areas/AreaMembersSheet.jsx'
import { AreaTree } from '../components/areas/AreaTree.jsx'
import { AreasSettingsCard } from '../components/areas/AreasSettingsCard.jsx'
import { useDeleteInventoryArea, useInventoryAreas } from '../hooks/useInventoryAreas.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { buildAreaTree } from '../lib/area-tree.js'

// Areas administration: scoping switch, folder tree, members. Reached from the inventory
// navigation with inventory.area.manage.
export default function InventoryAreasScreen() {
  const can = useInventoryCan()
  const canManage = can('inventory.area.manage')
  const areas = useInventoryAreas()
  const remove = useDeleteInventoryArea()
  const [dialog, setDialog] = useState(null) // { area?, parentId? }
  const [membersOf, setMembersOf] = useState(null)
  const [disableTarget, setDisableTarget] = useState(null)
  const list = areas.data ?? []
  const tree = useMemo(() => buildAreaTree(list), [list])

  async function handleDisable() {
    try {
      await remove.mutateAsync(disableTarget.id)
      toast.success('Área desactivada', { description: 'Sus items pasaron a General.' })
    } catch (err) { toast.error(err?.message ?? 'No se pudo desactivar el área') }
    setDisableTarget(null)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-dvh">
      <PageHeader
        eyebrow="Runly Inventario"
        title="Áreas"
        description="Organiza el inventario en carpetas y decide quién puede ver cada una."
        actions={canManage ? (
          <Button onClick={() => setDialog({})}><FolderPlus className="mr-2 h-4 w-4" />Nueva área</Button>
        ) : null}
      />

      {canManage ? <AreasSettingsCard /> : null}

      {areas.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : areas.isError ? (
        <ErrorState title="No se pudieron cargar las áreas" description={areas.error?.message} onRetry={() => areas.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title={canManage ? 'Aún no hay áreas' : 'No tienes áreas de inventario asignadas'}
          description={canManage
            ? 'Crea la primera área para empezar a organizar los items por carpetas.'
            : 'Pide acceso a un administrador.'}
          action={canManage ? { label: 'Nueva área', onClick: () => setDialog({}) } : undefined}
        />
      ) : (
        <AreaTree
          tree={tree}
          canManage={canManage}
          onAddChild={(area) => setDialog({ parentId: area.id })}
          onEdit={(area) => setDialog({ area })}
          onMembers={setMembersOf}
          onDisable={setDisableTarget}
        />
      )}

      <AreaDialog
        open={Boolean(dialog)}
        onOpenChange={(open) => { if (!open) setDialog(null) }}
        area={dialog?.area ?? null}
        parentId={dialog?.parentId ?? null}
        areas={list}
      />
      <AreaMembersSheet area={membersOf} open={Boolean(membersOf)} onOpenChange={(open) => { if (!open) setMembersOf(null) }} />
      <ConfirmDialog
        open={Boolean(disableTarget)}
        onOpenChange={(open) => { if (!open) setDisableTarget(null) }}
        title="Desactivar área"
        description="Los items pasarán a General y sus subcarpetas quedarán en el nivel superior."
        detail={disableTarget?.name}
        confirmLabel="Desactivar"
        loading={remove.isPending}
        onConfirm={handleDisable}
      />
    </div>
  )
}
