import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@runly/ui'
import { ChevronRight, Folder, FolderInput, FolderOpen, Library } from 'lucide-react'
import { useAreaChoices } from '../../hooks/useAreaChoices.js'
import { AREA_NONE } from '../../lib/area-tree.js'
import { AreaMoveDialog } from './AreaMoveDialog.jsx'

// Folder path of an item as a list of area objects, root first.
function areaTrail(areas, areaId) {
  const byId = new Map(areas.map((a) => [a.id, a]))
  const trail = []
  const seen = new Set()
  for (let cur = byId.get(areaId); cur && !seen.has(cur.id); cur = byId.get(cur.parentId)) {
    seen.add(cur.id)
    trail.unshift(cur)
  }
  return trail
}

const LIST_PATH = '/app/m/runly.inventory/inventory'

// Titled card for the item detail page: which area (folder) the item lives in.
// Renders nothing until the company uses areas. `canEdit` shows the "Cambiar de area" action.
export function ItemAreaCard({ itemId, areaId, canEdit = false }) {
  const navigate = useNavigate()
  const { areas, writeOptions } = useAreaChoices()
  const [moveOpen, setMoveOpen] = useState(false)

  if (!areas.length) return null
  const trail = areaId ? areaTrail(areas, areaId) : []
  const inGeneral = !areaId
  const unknown = Boolean(areaId) && trail.length === 0
  const filterValue = inGeneral ? AREA_NONE : areaId

  return (
    <section className="glass-shell-flat space-y-3 rounded-2xl p-4">
      <h3 className="text-sm font-semibold">Área</h3>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {inGeneral ? (
          <span className="flex items-center gap-1.5"><Library className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />General</span>
        ) : unknown ? (
          <span className="text-[hsl(var(--muted-foreground))]">Área sin acceso</span>
        ) : trail.map((area, index) => {
          const last = index === trail.length - 1
          const Icon = last ? FolderOpen : Folder
          return (
            <span key={area.id} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" /> : null}
              <Icon className={last ? 'h-4 w-4' : 'h-4 w-4 text-[hsl(var(--muted-foreground))]'} />
              <span className={last ? 'font-medium' : 'text-[hsl(var(--muted-foreground))]'}>{area.name}</span>
            </span>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {!unknown ? (
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(`${LIST_PATH}?areaId=${filterValue}`)}>
            Ver items del área
          </Button>
        ) : null}
        {canEdit && writeOptions.length ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
            <FolderInput className="mr-1.5 h-3.5 w-3.5" />Cambiar de área
          </Button>
        ) : null}
      </div>
      <AreaMoveDialog open={moveOpen} onOpenChange={setMoveOpen} itemIds={[itemId]} options={writeOptions} />
    </section>
  )
}
