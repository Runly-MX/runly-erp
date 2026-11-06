import {
  Button,
  PageHeader,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@runly/ui";
import {
  Plus,
  Upload,
  FileText,
  FileSpreadsheet,
  Presentation,
  ArrowUpRight,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import "./FilesWorkspace.css";

const TYPES = [
  {
    format: "docx",
    label: "Documento",
    hint: "Ideas, informes y propuestas",
    Icon: FileText,
  },
  {
    format: "xlsx",
    label: "Hoja de cálculo",
    hint: "Datos, cuentas y presupuestos",
    Icon: FileSpreadsheet,
  },
  {
    format: "pptx",
    label: "Presentación",
    hint: "Presenta tu próxima idea",
    Icon: Presentation,
  },
];
export function FilesWorkspaceHeader({
  dock,
  onCreate,
  onUpload,
  canCreate,
  canUpload,
  officeAvailable,
}) {
  return (
    <div className="files-workspace-heading">
      <PageHeader
        compact
        title="Archivos"
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
            <Button
              variant="outline"
              aria-label="Subir archivos"
              onClick={onUpload}
              disabled={!canUpload}
            >
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
              <DropdownMenuContent align="end">
                {TYPES.map(({ format, label, Icon }) => (
                  <DropdownMenuItem
                    key={format}
                    disabled={!canCreate || !officeAvailable}
                    onClick={() => onCreate(format)}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canUpload} onClick={onUpload}>
                  <Upload className="h-4 w-4 mr-2" />
                  Subir archivos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      <p className="files-workspace-intro">
        Tus documentos y los de tu equipo, en un mismo lugar.
      </p>
      <div className="files-create-strip" aria-label="Crear un documento">
        {TYPES.map(({ format, label, hint, Icon }) => (
          <Button
            key={format}
            variant="ghost"
            className="files-create-tile"
            data-format={format}
            disabled={!canCreate || !officeAvailable}
            onClick={() => onCreate(format)}
          >
            <span className="files-create-icon">
              <Icon />
            </span>
            <span className="files-create-copy">
              <strong>{label}</strong>
              <span>{hint}</span>
            </span>
            <ArrowUpRight className="files-create-arrow" />
          </Button>
        ))}
      </div>
      {!officeAvailable && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          La creación se habilitará cuando Office esté disponible. Puedes seguir
          consultando y subiendo archivos.
        </p>
      )}
    </div>
  );
}
