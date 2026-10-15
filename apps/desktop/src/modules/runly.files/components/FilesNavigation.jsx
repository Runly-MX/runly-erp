import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@runly/ui";
import { ChevronDown, FolderTree } from "lucide-react";
import { FilesSidebar } from "./FilesSidebar";
import { ROOT_FOLDER, folderPath, moduleLabel } from "../lib/folders";

const WORKSPACE_LABELS = {
  mine: "Recientes",
  shared: "Compartidos conmigo",
  invitations: "Invitaciones",
  all: "Todos",
};

function locationLabel({ workspace, folder, moduleKey, folders }) {
  if (workspace === "folders") {
    if (folder === ROOT_FOLDER) return "Mis carpetas";
    const path = folderPath(folders, folder);
    return path.length ? path.map((f) => f.name).join(" / ") : "Mis carpetas";
  }
  if (workspace === "modules") return moduleKey ? `Módulos / ${moduleLabel(moduleKey)}` : "Módulos";
  return WORKSPACE_LABELS[workspace] ?? "Archivos";
}

// Folder tree: a fixed column on md+, and on phones a "where am I" bar that
// opens the same tree in a sheet (a draggable bottom sheet on phones).
export function FilesNavigation({ onSelect, ...tree }) {
  const [open, setOpen] = useState(false);
  const select = (target) => {
    setOpen(false);
    onSelect(target);
  };
  return (
    <>
      <aside className="hidden md:sticky md:top-4 md:block md:w-52 md:shrink-0">
        <FilesSidebar {...tree} onSelect={onSelect} />
      </aside>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-left text-sm md:hidden"
        aria-haspopup="dialog"
      >
        <FolderTree className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <span className="min-w-0 flex-1 truncate font-medium">{locationLabel(tree)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="md:hidden">
          <SheetHeader>
            <SheetTitle>Carpetas</SheetTitle>
            <SheetDescription>Elige dónde buscar tus archivos.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FilesSidebar {...tree} onSelect={select} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
