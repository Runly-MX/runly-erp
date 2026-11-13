import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterToolbar,
  SearchInput,
  cn,
} from "@runly/ui";
import { ArrowUpDown, Boxes, Check, CheckSquare, Columns3, File, LayoutGrid, List, PanelRight, ToggleRight, ZoomIn, ZoomOut } from "lucide-react";

export const TILE_SIZES = [110, 150, 200, 260];

const VIEWS = [
  { key: "list", label: "Lista", Icon: List },
  { key: "grid", label: "Cuadrícula", Icon: LayoutGrid },
  { key: "mosaic", label: "Mosaico (proporción original)", Icon: Columns3 },
];

function SegButton({ label, active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center transition-colors disabled:opacity-40",
        active ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]",
      )}
    >
      {children}
    </button>
  );
}

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
  tileSize,
  onTileSizeChange,
  previewOpen,
  onPreviewToggle,
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
          {(
            <Button type="button" variant="outline" aria-label="Seleccionar visibles" title="Seleccionar visibles" onClick={onSelectVisible}>
              <CheckSquare className="h-4 w-4" />
              <span className="max-2xl:sr-only">Seleccionar visibles</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" aria-label="Ordenar">
                <ArrowUpDown className="h-4 w-4" />
                <span className="max-2xl:sr-only">{current.label}</span>
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
      viewSwitch={
        <div className="flex items-center gap-2">
          {viewMode !== "list" && (
            <div className="inline-flex shrink-0 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-card [@media(hover:none)]:hidden">
              <SegButton label="Tiles más pequeños" disabled={tileSize <= TILE_SIZES[0]} onClick={() => onTileSizeChange(TILE_SIZES[Math.max(0, TILE_SIZES.indexOf(tileSize) - 1)])}>
                <ZoomOut className="h-4 w-4" />
              </SegButton>
              <SegButton label="Tiles más grandes" disabled={tileSize >= TILE_SIZES[TILE_SIZES.length - 1]} onClick={() => onTileSizeChange(TILE_SIZES[Math.min(TILE_SIZES.length - 1, TILE_SIZES.indexOf(tileSize) + 1)])}>
                <ZoomIn className="h-4 w-4" />
              </SegButton>
            </div>
          )}
          <div className="inline-flex shrink-0 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-card">
            {VIEWS.map(({ key, label, Icon }) => (
              <SegButton key={key} label={label} active={viewMode === key} onClick={() => onViewModeChange(key)}>
                <Icon className="h-4 w-4" />
              </SegButton>
            ))}
          </div>
          <div className="hidden shrink-0 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-card xl:inline-flex">
            <SegButton label={previewOpen ? "Ocultar vista previa" : "Mostrar vista previa"} active={previewOpen} onClick={onPreviewToggle}>
              <PanelRight className="h-4 w-4" />
            </SegButton>
          </div>
        </div>
      }
    />
  );
}
