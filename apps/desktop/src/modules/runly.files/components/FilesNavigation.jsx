import { useState } from "react";
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@runly/ui";
import { ChevronDown, FolderTree, PanelLeftClose } from "lucide-react";
import { FilesSidebar } from "./FilesSidebar";
import { AreaTreeDock } from "../../runly.inventory/components/areas/AreaTreeDock.jsx";
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

// Folder tree: on lg+ the same docked, collapsible and resizable panel as the
// inventory areas (state from useAreaTreeDock); below lg a "where am I" bar
// that opens the same tree in a sheet.
export function FilesNavigation({ dock, onSelect, ...tree }) {
  const [open, setOpen] = useState(false);
  const select = (target) => {
    setOpen(false);
    onSelect(target);
  };
  if (dock.isDesktop) {
    return (
      <AreaTreeDock dock={dock}>
        <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] pb-2 pl-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FolderTree className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            Carpetas
          </h2>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md" aria-label="Ocultar carpetas" title="Ocultar carpetas" onClick={dock.toggle}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <FilesSidebar {...tree} onSelect={onSelect} />
      </AreaTreeDock>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-left text-sm"
        aria-haspopup="dialog"
      >
        <FolderTree className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <span className="min-w-0 flex-1 truncate font-medium">{locationLabel(tree)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
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
