import { useNavigate } from 'react-router-dom'
import { Boxes, CornerDownRight, Cpu, Network, Plus } from 'lucide-react'
import { Button } from '@runly/ui'
import { useInventoryItemComponents } from '../hooks/useInventoryItems.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { InventoryStatusBadge } from './InventoryStatusBadge.jsx'

const ITEM_PATH = '/app/m/runly.inventory/inventory'
const LIST_PATH = '/app/m/runly.inventory/inventory'

function ItemRow({ item, icon: Icon, onOpen }) {
  const meta = [item.folio, item.serialNumber && `S/N ${item.serialNumber}`, item.categoryName].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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

// Detail card: a main item lists its components; a component shows its main
// item and its sibling components. Hidden when the item has no links, except
// for the "Agregar componente" action (new item pre-linked to this one).
export function ComponentsCard({ itemId }) {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const { data } = useInventoryItemComponents(itemId)
  const { parent, children = [], siblings = [] } = data?.data ?? data ?? {}
  const open = (id) => navigate(`${ITEM_PATH}/${id}`)
  const canAdd = can('inventory.item.create') && !parent
  if (!parent && !children.length && !canAdd) return null

  return (
    <section className="glass-shell-flat space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />Componentes y vínculos</h3>
        {canAdd ? (
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(`${LIST_PATH}/new?parentItemId=${itemId}`)}>
            <Plus className="h-3.5 w-3.5" />Agregar componente
          </Button>
        ) : null}
      </div>
      {parent ? (
        <Group title="Activo principal" count={1}>
          <ItemRow item={parent} icon={Boxes} onOpen={open} />
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
          {children.map((item) => <ItemRow key={item.id} item={item} icon={Cpu} onOpen={open} />)}
          <button type="button" onClick={() => navigate(`${LIST_PATH}?link=child`)} className="px-2.5 pt-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">
            Ver todos los componentes en el inventario
          </button>
        </Group>
      ) : null}
      {!parent && !children.length ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Este activo no tiene componentes. Agrega las piezas con registro propio que forman parte de él.</p> : null}
    </section>
  )
}
