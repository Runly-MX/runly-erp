import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterToolbar,
  SearchInput,
  ViewModeSwitch,
} from "@runly/ui";
import { ArrowUpDown, Boxes, Check, CheckSquare, File, ToggleRight } from "lucide-react";

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

const SORTS = [
  { by: "updatedAt", dir: "desc", label: "Más recientes" },
  { by: "updatedAt", dir: "asc", label: "Más antiguos" },
  { by: "originalName", dir: "asc", label: "Nombre (A-Z)" },
  { by: "originalName", dir: "desc", label: "Nombre (Z-A)" },
  { by: "sizeBytes", dir: "desc", label: "Más pesados" },
  { by: "sizeBytes", dir: "asc", label: "Más ligeros" },
];

// Search + filters + sort + view switch on the shared FilterToolbar (one row
// on desktop; search/filters/view on top and actions below on phones).
// Selection actions live in FilesSelectionBar, not here.
export function FilesToolbar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  onSelectVisible,
  sort,
  onSortChange,
  moduleOptions = [],
}) {
  const specs = [...FILTERS, { key: "moduleKey", label: "Módulo", icon: Boxes, options: moduleOptions }].filter(
    (filter) => filter.options?.length,
  );
  const current = SORTS.find((item) => item.by === sort.by && item.dir === sort.dir) ?? SORTS[0];

  return (
    <FilterToolbar
      search={
        <SearchInput
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onClear={() => onSearchChange("")}
          placeholder="Buscar archivo..."
        />
      }
      filterSpecs={specs}
      filterValue={filters}
      onFilterChange={onFiltersChange}
      actions={
        <>
          {viewMode === "table" && (
            <Button type="button" variant="outline" aria-label="Seleccionar visibles" title="Seleccionar visibles" onClick={onSelectVisible}>
              <CheckSquare className="h-4 w-4" />
              <span className="max-sm:sr-only">Seleccionar visibles</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" aria-label="Ordenar">
                <ArrowUpDown className="h-4 w-4" />
                {current.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORTS.map((item) => (
                <DropdownMenuItem key={item.label} onClick={() => onSortChange({ by: item.by, dir: item.dir })}>
                  <Check className={item === current ? "mr-2 h-4 w-4" : "mr-2 h-4 w-4 opacity-0"} />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      viewSwitch={<ViewModeSwitch modes={["table", "gallery"]} value={viewMode} onChange={onViewModeChange} storageKey="files" />}
    />
  );
}
