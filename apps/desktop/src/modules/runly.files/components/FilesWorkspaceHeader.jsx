import {
  Button,
  PageHeader,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@runly/ui";
import { Plus, Upload, FolderPlus, PanelLeft, PanelLeftClose } from "lucide-react";
import { useRef } from "react";
import { FilesCreateBar, FilesCreateHero, NEW_DOCUMENT_TYPES, useScrolledAbove } from "./FilesQuickCreate";
import "./FilesWorkspace.css";

// Header of the explorer: title + subtitle, Subir / Nuevo and the create cards; once
// the cards scroll away, a slim create bar slides in and stays at the top.
export function FilesWorkspaceHeader({
  dock,
  destination,
  onCreate,
  onUpload,
  onNewFolder,
  canCreate,
  canUpload,
  canCreateFolder,
  officeAvailable,
}) {
  const heroRef = useRef(null);
  const stuck = useScrolledAbove(heroRef);
  return (
    <>
      <div className="files-workspace-heading space-y-3">
        <PageHeader
          compact
          title="Archivos"
          description="Tus documentos y los de tu equipo, en un mismo lugar."
          actions={
            <div className="flex flex-wrap gap-2">
              {dock?.isDesktop && (
                <Button
                  variant={dock.dockOpen ? "secondary" : "outline"}
                  size="icon"
                  aria-label={dock.dockOpen ? "Ocultar carpetas" : "Mostrar carpetas"}
                  title={dock.dockOpen ? "Ocultar carpetas" : "Mostrar carpetas"}
                  aria-pressed={dock.dockOpen}
                  onClick={dock.toggle}
                >
                  {dock.dockOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                </Button>
              )}
              <Button variant="outline" aria-label="Subir archivos" onClick={onUpload} disabled={!canUpload}>
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Subir archivos</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={!canUpload && !canCreate}>
                    <Plus className="h-4 w-4" />
                    Nuevo
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-60">
                  <DropdownMenuLabel className="truncate text-xs font-normal text-[hsl(var(--muted-foreground))]">
                    En {destination}
                  </DropdownMenuLabel>
                  {NEW_DOCUMENT_TYPES.map(({ format, label, Icon }) => (
                    <DropdownMenuItem key={format} disabled={!canCreate || !officeAvailable} onClick={() => onCreate(format)}>
                      <Icon className="mr-2 h-4 w-4" />
                      {label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  {canCreateFolder && (
                    <DropdownMenuItem onClick={onNewFolder}>
                      <FolderPlus className="mr-2 h-4 w-4" />
                      Carpeta
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled={!canUpload} onClick={onUpload}>
                    <Upload className="mr-2 h-4 w-4" />
                    Subir archivos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
        <FilesCreateHero
          heroRef={heroRef}
          destination={destination}
          onCreate={onCreate}
          canCreate={canCreate}
          officeAvailable={officeAvailable}
        />
      </div>
      <FilesCreateBar stuck={stuck} destination={destination} onCreate={onCreate} canCreate={canCreate} officeAvailable={officeAvailable} />
    </>
  );
}
