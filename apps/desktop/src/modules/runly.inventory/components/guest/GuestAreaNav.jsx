import { FolderTree, Layers } from 'lucide-react'
import { Badge } from '@runly/ui'
import { buildAreaTree, flattenAreaTree } from '../../lib/area-tree.js'

const rowBase = 'flex w-full items-center gap-2 rounded-md py-2 pr-2 text-left text-sm transition-colors'
const rowState = (active) => (active
  ? 'bg-[hsl(var(--muted))] font-medium'
  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]')

// Folder navigation limited to the areas the guest can open. `null` = every folder.
export function GuestAreaNav({ areas = [], value, onChange }) {
  const tree = flattenAreaTree(buildAreaTree(areas))
  return (
    <nav aria-label="Carpetas" className="space-y-0.5">
      <button type="button" className={`${rowBase} pl-2 ${rowState(value == null)}`} onClick={() => onChange(null)}>
        <Layers className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">Todas mis carpetas</span>
      </button>
      {tree.map((area) => (
        <button
          key={area.id} type="button"
          className={`${rowBase} ${rowState(value === area.id)}`}
          style={{ paddingLeft: `${0.5 + area.depth * 1}rem` }}
          onClick={() => onChange(area.id)}
        >
          <FolderTree className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{area.name}</span>
          {area.role === 'viewer' ? <Badge variant="outline">Lectura</Badge> : null}
        </button>
      ))}
    </nav>
  )
}
