import { forwardRef } from "react";
import { ActionMenu, Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, cn } from "@runly/ui";
import { ChevronRight, Folder, FolderPlus, FolderSymlink, Link2, Pencil, Share2, Trash2, Users } from "lucide-react";
import { ROOT_FOLDER, childrenOf, folderPath } from "../lib/folders";
import { startItemDrag, useItemDropTarget } from "../lib/dnd";

// Folder card: drop target (files/folders dragged onto it move inside), draggable itself
// when the user manages it, and it springs open if an item hovers over it for a moment.
const FolderCard = forwardRef(function FolderCard({ item, draggable, onDropItems, onSpring, children, ...rest }, ref) {
  const drop = useItemDropTarget(onDropItems, onSpring);
  return (
    <div
      ref={ref}
      {...rest}
      {...drop.props}
      data-drop-id={onDropItems ? item.id : undefined}
      draggable={draggable}
      onDragStart={(e) => startItemDrag(e, { fileIds: [], folderIds: [item.id] }, item.name)}
      className={cn(
        "flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] pr-1 transition-colors hover:bg-[hsl(var(--muted))]/50 [&[data-drop-hover=true]]:bg-[var(--brand-primary)]/20",
        drop.isOver && "bg-[var(--brand-primary)]/20 ring-1 ring-[var(--brand-primary)]",
      )}
    >
      {children}
    </div>
  );
});

// Breadcrumb button that accepts dragged files/folders (move to that folder).
function Crumb({ className, onDropItems, onSpring, dropId, ...props }) {
  const drop = useItemDropTarget(onDropItems, onSpring);
  return <Button variant="ghost" size="sm" {...drop.props} data-drop-id={onDropItems ? dropId : undefined} className={cn(className, "[&[data-drop-hover=true]]:bg-[var(--brand-primary)]/20", drop.isOver && "bg-[var(--brand-primary)]/20 ring-1 ring-[var(--brand-primary)]")} {...props} />;
}

// Breadcrumb + subfolder cards shown above the files while browsing "Mis
// carpetas". `folder` is a folder id or ROOT_FOLDER.
export function FolderExplorerBar({ folders, folder, canCreate, canManage, onOpen, onCreate, onRename, onMove, onShare, onDelete, onDropItems, hideSubfolders }) {
  const path = folder === ROOT_FOLDER ? [] : folderPath(folders, folder);
  const subfolders = childrenOf(folders, folder === ROOT_FOLDER ? null : folder);
  const current = path[path.length - 1];
  const menuItems = (item) => [
    { label: "Compartir", icon: Link2, onClick: () => onShare(item) },
    { label: "Renombrar", icon: Pencil, onClick: () => onRename(item) },
    { label: "Mover a...", icon: FolderSymlink, onClick: () => onMove(item) },
    { label: "Eliminar", icon: Trash2, variant: "destructive", onClick: () => onDelete(item) },
    // Dialogs opened in the tick a Radix menu closes leave the page unclickable.
  ].map((entry) => ({ ...entry, onClick: () => setTimeout(entry.onClick, 80) }));
  return (
    <section aria-label="Carpetas" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Ruta" className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none] sm:flex-initial sm:flex-wrap sm:overflow-visible">
          <Crumb className={cn("h-7 px-2", path.length === 0 && "font-semibold")} onClick={() => onOpen(ROOT_FOLDER)} dropId={ROOT_FOLDER} onSpring={() => onOpen(ROOT_FOLDER)} onDropItems={onDropItems && ((p) => onDropItems(p, null))}>
            Mis carpetas
          </Crumb>
          {path.map((item, index) => (
            <span key={item.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
              <Crumb
                className={cn("h-7 max-w-48 truncate px-2", index === path.length - 1 && "font-semibold")}
                onClick={() => onOpen(item.id)}
                dropId={item.id}
                onSpring={() => onOpen(item.id)}
                onDropItems={onDropItems && ((p) => onDropItems(p, item.id))}
              >
                {item.name}
              </Crumb>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {current && canManage(current) && (
            <>
              <Button variant="outline" size="sm" aria-label={`Compartir ${current.name}`} onClick={() => onShare(current)}>
                <Share2 className="h-4 w-4" />
                <span className="max-sm:sr-only">Compartir</span>
              </Button>
              <ActionMenu label={`Acciones de ${current.name}`} items={menuItems(current).slice(1)} />
            </>
          )}
          {canCreate && (
            <Button variant="outline" size="sm" aria-label="Nueva carpeta" onClick={onCreate}>
              <FolderPlus className="h-4 w-4" />
              <span className="max-sm:sr-only">Nueva carpeta</span>
            </Button>
          )}
        </div>
      </div>
      {!hideSubfolders && subfolders.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {subfolders.map((item) => (
            <ContextMenu key={item.id}>
              <ContextMenuTrigger asChild>
                <FolderCard
                  item={item}
                  draggable={canManage(item)}
                  onDropItems={onDropItems && ((payload) => onDropItems(payload, item.id))}
                  onSpring={() => onOpen(item.id)}
                >
                  <button type="button" onClick={() => onOpen(item.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" title={item.name}>
                    <Folder className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {item.scope === "COMPANY" && <Users className="h-3 w-3" />}
                        {item.fileCount} {item.fileCount === 1 ? "archivo" : "archivos"}
                      </span>
                    </span>
                  </button>
                  {canManage(item) && (
                    <ActionMenu label={`Acciones de ${item.name}`} items={menuItems(item)} />
                  )}
                </FolderCard>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => onOpen(item.id)}>Abrir</ContextMenuItem>
                {canManage(item) && (
                  <>
                    <ContextMenuSeparator />
                    {menuItems(item).map((entry) => (
                      <ContextMenuItem
                        key={entry.label}
                        onSelect={entry.onClick}
                        className={entry.variant === "destructive" ? "text-destructive focus:bg-destructive/10 focus:text-destructive" : undefined}
                      >
                        {entry.icon && <entry.icon />}
                        {entry.label}
                      </ContextMenuItem>
                    ))}
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      )}
    </section>
  );
}
