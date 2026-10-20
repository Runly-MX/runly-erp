import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@runly/ui'
import { FolderPlus, FolderTree, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react'
import { flattenAreaTree } from '../../lib/area-tree.js'

// Indented list of areas with item/member counts and a row menu.
export function AreaTree({ tree, canManage, onAddChild, onEdit, onMembers, onDisable }) {
  return (
    <ul className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-md border border-[hsl(var(--border))]">
      {flattenAreaTree(tree).map((area) => (
        <li
          key={area.id}
          className="flex items-center gap-3 py-2.5 pr-3 hover:bg-[hsl(var(--muted))]/50"
          style={{ paddingLeft: `${0.75 + area.depth * 1.5}rem` }}
        >
          <FolderTree className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium" onClick={() => onMembers(area)}>
            {area.name}
          </button>
          <Badge variant="secondary">{area.itemCount ?? 0} items</Badge>
          <Badge variant="outline" className="hidden sm:inline-flex">{area.memberCount ?? 0} miembros</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Acciones de ${area.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onMembers(area)}><Users className="mr-2 h-4 w-4" />Miembros</DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem onSelect={() => onAddChild(area)}><FolderPlus className="mr-2 h-4 w-4" />Nueva subcarpeta</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onEdit(area)}><Pencil className="mr-2 h-4 w-4" />Renombrar o mover</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => onDisable(area)}><Trash2 className="mr-2 h-4 w-4" />Desactivar</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  )
}
