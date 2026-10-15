import {
  Badge,
  Button,
  FilterMenu,
  ActiveFilterChips,
  SearchInput,
  ViewModeSwitch,
} from "@runly/ui";
import { Download, Archive, CheckSquare, Boxes, File, ToggleRight, FolderSymlink } from "lucide-react";

const FILTERS = [
  {
    key: "enabled",
    label: "Estado",
    icon: ToggleRight,
    options: [
      { value: "true", label: "Activo" },
      { value: "false", label: "Deshabilitado" },
    ],
  },
  {
    key: "kind",
    label: "Tipo",
    icon: File,
    options: [
      { value: "image", label: "Imagen" },
      { value: "video", label: "Video" },
      { value: "audio", label: "Audio" },
      { value: "pdf", label: "PDF" },
      { value: "sheet", label: "Hoja de cálculo" },
      { value: "csv", label: "CSV" },
      { value: "doc", label: "Documento" },
      { value: "presentation", label: "Presentación" },
      { value: "archive", label: "Comprimido" },
      { value: "text", label: "Texto" },
      { value: "generic", label: "Otro" },
    ],
  },
];

export function FilesToolbar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  selectedCount,
  onSelectVisible,
  onClearSelection,
  onBulkDirect,
  onBulkZip,
  onMoveSelected,
  bulkLoading,
  sort,
  onSortChange,
  moduleOptions = [],
}) {
  const resolvedFilters = [
    ...FILTERS,
    {
      key: "moduleKey",
      label: "Módulo",
      icon: Boxes,
      options: moduleOptions,
    },
  ].filter((filter) => filter.options?.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar archivo..."
          className="flex-1 min-w-0 sm:max-w-sm"
        />
        <FilterMenu
          filters={resolvedFilters}
          value={filters}
          onChange={onFiltersChange}
        />
        <ViewModeSwitch
          value={viewMode}
          onChange={onViewModeChange}
          storageKey="files"
        />
      </div>

      <ActiveFilterChips
        filters={resolvedFilters}
        value={filters}
        onChange={onFiltersChange}
      />

      <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 0 && (
          <Badge variant="outline">Seleccionados: {selectedCount}</Badge>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Seleccionar visibles"
          onClick={onSelectVisible}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Seleccionar visibles</span>
        </Button>
        {selectedCount > 0 && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Descargar seleccionados"
              onClick={onBulkDirect}
              disabled={selectedCount === 0 || bulkLoading}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Descargar seleccionados</span>
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label="Descargar ZIP"
              onClick={onBulkZip}
              disabled={selectedCount === 0 || bulkLoading}
            >
              <Archive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Descargar ZIP</span>
            </Button>
            {onMoveSelected && (
              <Button type="button" variant="outline" size="sm" aria-label="Mover a carpeta" onClick={onMoveSelected} disabled={bulkLoading}>
                <FolderSymlink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mover a carpeta</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={selectedCount === 0 || bulkLoading}
            >
              <span className="hidden sm:inline">Limpiar selección</span>
              <span className="sm:hidden">Limpiar</span>
            </Button>
          </>
        )}
        <div className="sm:ml-auto inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] px-1.5 py-1">
          <Button
            type="button"
            variant={sort.by === "updatedAt" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              onSortChange({
                by: "updatedAt",
                dir:
                  sort.by === "updatedAt" && sort.dir === "desc"
                    ? "asc"
                    : "desc",
              })
            }
          >
            Reciente
          </Button>
          <Button
            type="button"
            variant={sort.by === "originalName" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              onSortChange({
                by: "originalName",
                dir:
                  sort.by === "originalName" && sort.dir === "asc"
                    ? "desc"
                    : "asc",
              })
            }
          >
            Nombre
          </Button>
          <Button
            type="button"
            variant={sort.by === "sizeBytes" ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              onSortChange({
                by: "sizeBytes",
                dir:
                  sort.by === "sizeBytes" && sort.dir === "asc"
                    ? "desc"
                    : "asc",
              })
            }
          >
            Tamaño
          </Button>
        </div>
      </div>
    </div>
  );
}
