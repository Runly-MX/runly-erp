import { ActionMenu, Button, cn } from "@runly/ui";
import { ChevronRight, Folder, FolderPlus, FolderSymlink, Link2, Pencil, Trash2, Users } from "lucide-react";
import { ROOT_FOLDER, childrenOf, folderPath } from "../lib/folders";

// Breadcrumb + subfolder cards shown above the files while browsing "Mis
// carpetas". `folder` is a folder id or ROOT_FOLDER.
export function FolderExplorerBar({ folders, folder, canCreate, canManage, onOpen, onCreate, onRename, onMove, onShare, onDelete }) {
  const path = folder === ROOT_FOLDER ? [] : folderPath(folders, folder);
  const subfolders = childrenOf(folders, folder === ROOT_FOLDER ? null : folder);
  return (
    <section aria-label="Carpetas" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Ruta" className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none] sm:flex-initial sm:flex-wrap sm:overflow-visible">
          <Button variant="ghost" size="sm" className={cn("h-7 px-2", path.length === 0 && "font-semibold")} onClick={() => onOpen(ROOT_FOLDER)}>
            Mis carpetas
          </Button>
          {path.map((item, index) => (
            <span key={item.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 max-w-48 truncate px-2", index === path.length - 1 && "font-semibold")}
                onClick={() => onOpen(item.id)}
              >
                {item.name}
              </Button>
            </span>
          ))}
        </nav>
        {canCreate && (
          <Button variant="outline" size="sm" aria-label="Nueva carpeta" onClick={onCreate}>
            <FolderPlus className="h-4 w-4" />
            <span className="max-sm:sr-only">Nueva carpeta</span>
          </Button>
        )}
      </div>
      {subfolders.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {subfolders.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] pr-1 transition-colors hover:bg-[hsl(var(--muted))]/50"
            >
              <button type="button" onClick={() => onOpen(item.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" title={item.name}>
                <Folder className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                    {item.scope === "COMPANY" && <Users className="h-3 w-3" />}
                    {item.fileCount} {item.fileCount === 1 ? "archivo" : "archivos"}
                  </span>
                </span>
              </button>
              {canManage(item) && (
                <ActionMenu
                  label={`Acciones de ${item.name}`}
                  items={[
                    { label: "Compartir", icon: Link2, onClick: () => onShare(item) },
                    { label: "Renombrar", icon: Pencil, onClick: () => onRename(item) },
                    { label: "Mover a...", icon: FolderSymlink, onClick: () => onMove(item) },
                    { label: "Eliminar", icon: Trash2, variant: "destructive", onClick: () => onDelete(item) },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
