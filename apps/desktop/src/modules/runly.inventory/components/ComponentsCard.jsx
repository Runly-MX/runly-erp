import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, CornerDownRight, Cpu, Network, Plus, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@runly/ui'
import { useInventoryItemComponents, useLinkInventoryComponents } from '../hooks/useInventoryItems.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { InventoryStatusBadge } from './InventoryStatusBadge.jsx'
import { ComponentPickerDialog } from './ComponentPickerDialog.jsx'

const ITEM_PATH = '/app/m/runly.inventory/inventory'
const LIST_PATH = '/app/m/runly.inventory/inventory'

function ItemRow({ item, icon: Icon, onOpen, onRemove }) {
  const meta = [item.folio, item.serialNumber && `S/N ${item.serialNumber}`, item.categoryName].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-1 rounded-md transition-colors hover:bg-[hsl(var(--muted))]">
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          {meta ? <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{meta}</span> : null}
        </span>
        <InventoryStatusBadge status={item.status} />
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Quitar ${item.name} de los componentes`}
          title="Quitar de los componentes"
          onClick={() => onRemove(item)}
          className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <Unlink className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function Group({ title, count, children }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 px-2.5 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {title}<span className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-px text-[10px] normal-case tracking-normal">{count}</span>
      </p>
      {children}
    </div>
  )
}

// Detail card: a main item lists its components (add existing ones from a
// search modal, or detach them); a component shows its main item and its
// sibling components.
export function ComponentsCard({ itemId, itemName, readOnly = false }) {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const [pickerOpen, setPickerOpen] = useState(false)
  const unlink = useLinkInventoryComponents()
  const { data } = useInventoryItemComponents(itemId)
  const { parent, children = [], siblings = [] } = data?.data ?? data ?? {}
  const open = (id) => navigate(`${ITEM_PATH}/${id}`)
  const canEdit = can('inventory.item.update') && !readOnly
  const canAdd = canEdit && !parent
  const remove = (item) => unlink.mutate({ itemIds: [item.id], parentItemId: null }, {
    onSuccess: () => toast.success(`«${item.name}» ya no es componente`),
    onError: (err) => toast.error(err?.message ?? 'No se pudo quitar el componente'),
  })
  if (!parent && !children.length && !canAdd) return null

  return (
    <section className="glass-shell-flat space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />Componentes y vínculos</h3>
        {canAdd ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Agregar componentes
          </Button>
        ) : null}
      </div>
      {parent ? (
        <Group title="Activo principal" count={1}>
          <ItemRow item={parent} icon={Boxes} onOpen={open} onRemove={canEdit ? remove : undefined} />
        </Group>
      ) : null}
      {parent ? (
        <Group title="Otros componentes del principal" count={siblings.length}>
          {siblings.length ? siblings.map((item) => <ItemRow key={item.id} item={item} icon={Cpu} onOpen={open} />)
            : <p className="flex items-center gap-1.5 px-2.5 text-xs text-[hsl(var(--muted-foreground))]"><CornerDownRight className="h-3 w-3" />Es el único componente.</p>}
        </Group>
      ) : null}
      {children.length ? (
        <Group title="Componentes" count={children.length}>
          {children.map((item) => <ItemRow key={item.id} item={item} icon={Cpu} onOpen={open} onRemove={canAdd ? remove : undefined} />)}
          <button type="button" onClick={() => navigate(`${LIST_PATH}?link=child`)} className="px-2.5 pt-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">
            Ver todos los componentes en el inventario
          </button>
        </Group>
      ) : null}
      {!parent && !children.length ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Este activo no tiene componentes. Agrega los activos ya registrados que forman parte de él.</p> : null}
      {canAdd ? (
        <ComponentPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          parent={{ id: itemId, name: itemName }}
          onCreateNew={() => navigate(`${LIST_PATH}/new?parentItemId=${itemId}`)}
        />
      ) : null}
    </section>
  )
}
