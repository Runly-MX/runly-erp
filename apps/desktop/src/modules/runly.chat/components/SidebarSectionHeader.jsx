// Header of a sidebar section: chevron, name and, when collapsed, what is unread inside.
// Custom sections add a menu (rename, move, delete). The header is also a drop target:
// dropping a row on it moves that conversation here (mouse; touch uses "Mover a sección").
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, resolveLucideIcon } from "@runly/ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export const DRAG_TYPE = "application/x-runly-conversation";

export function SidebarSectionHeader({ label, icon, collapsed, unread = 0, mentions = 0, count, onToggle, onDropConversation, menu = null }) {
  const [over, setOver] = useState(false);
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const Icon = icon ? resolveLucideIcon(icon) : null;
  return (
    <div
      className={["group flex items-center rounded-md transition-colors", over ? "bg-[var(--brand-primary)]/15" : ""].join(" ")}
      onDragOver={onDropConversation ? (event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); setOver(true); } } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropConversation ? (event) => { event.preventDefault(); setOver(false); const id = event.dataTransfer.getData(DRAG_TYPE); if (id) onDropConversation(id); } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:min-h-10"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {Icon && <Icon size={12} className="shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {collapsed && (mentions > 0 || unread > 0) ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-semibold text-[var(--brand-primary-foreground)]">{(mentions || unread) > 99 ? "99+" : mentions || unread}</span>
        ) : count != null ? <span className="text-[10px] tabular-nums">{count}</span> : null}
      </button>
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Opciones de ${label}`} className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] opacity-0 transition-opacity hover:bg-[hsl(var(--muted))] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10">
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={menu.onRename}><Pencil className="mr-2 h-3.5 w-3.5" /> Editar sección</DropdownMenuItem>
            {menu.canMoveUp && <DropdownMenuItem onSelect={menu.onMoveUp}><ArrowUp className="mr-2 h-3.5 w-3.5" /> Subir</DropdownMenuItem>}
            {menu.canMoveDown && <DropdownMenuItem onSelect={menu.onMoveDown}><ArrowDown className="mr-2 h-3.5 w-3.5" /> Bajar</DropdownMenuItem>}
            <DropdownMenuItem onSelect={menu.onDelete}><Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar sección</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
