import {
  ActionMenu,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  FileVisual,
  MediaThumb,
  cn,
  formatBytes,
  formatDate,
  getFileKind,
  getKindLabel,
} from "@runly/ui";
import { Folder, GripVertical, Users } from "lucide-react";
import { useItemDropTarget } from "../lib/dnd";
import { gridTemplate } from "../hooks/useFilesColumns";

const HOVER =
  "[&[data-drop-hover=true]]:bg-[var(--brand-primary)]/20 [&[data-drop-hover=true]]:ring-1 [&[data-drop-hover=true]]:ring-[var(--brand-primary)]";
const shortDate = (v) => (v ? new Date(v).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "");

// Opening a dialog in the same tick a Radix menu closes leaves the page with
// pointer-events: none; run menu actions once the menu has unmounted.
export const afterMenuClose = (entries) => entries.map((e) => ({ ...e, onClick: () => setTimeout(e.onClick, 80) }));

export function MenuEntries({ entries }) {
  return entries.map((entry, index) => {
    const Icon = entry.icon;
    return (
      <div key={index}>
        {entry.variant === "destructive" && <ContextMenuSeparator />}
        <ContextMenuItem
          onSelect={entry.onClick}
          className={entry.variant === "destructive" ? "text-destructive focus:bg-destructive/10 focus:text-destructive" : undefined}
        >
          {Icon && <Icon />}
          {entry.label}
        </ContextMenuItem>
      </div>
    );
  });
}

// One row of the details view. Only the name block is draggable; the rest of the row
// starts a rubber-band selection.
export function FilesListRow({
  item,
  selected,
  layout,
  widths,
  canDrag,
  thumbResolver,
  menu: rawMenu,
  onClick,
  onDoubleClick,
  onToggle,
  onContextMenu,
  onDragStart,
  onHandleDown,
  onDropItems,
  onSpring,
}) {
  const drop = useItemDropTarget(item.type === "folder" ? onDropItems : null, onSpring);
  const menu = afterMenuClose(rawMenu);
  const { data } = item;
  const isFolder = item.type === "folder";
  const name = isFolder ? data.name : data.originalName;
  const isImage = !isFolder && String(data.mimeType ?? "").startsWith("image/");
  const when = data.updatedAt ?? data.createdAt;
  const row = (
    <div
      data-item-id={item.id}
      data-drop-id={isFolder && onDropItems ? item.id : undefined}
      role="row"
      aria-selected={selected}
      {...drop.props}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{ gridTemplateColumns: gridTemplate(layout, widths) }}
      className={cn(
        "grid min-h-14 select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm [-webkit-touch-callout:none]",
        HOVER,
        selected ? "bg-[var(--brand-primary)]/12" : "hover:bg-[hsl(var(--muted))]/60",
        drop.isOver && "bg-[var(--brand-primary)]/20 ring-1 ring-[var(--brand-primary)]",
        !isFolder && data.enabled === false && "opacity-60",
      )}
    >
      <div className="-m-2 flex h-11 w-11 items-center justify-center" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Checkbox aria-label={`Seleccionar ${name}`} checked={selected} onCheckedChange={onToggle} />
      </div>
      <div data-drag-zone draggable={!layout.coarse} onDragStart={onDragStart} className="flex w-fit min-w-0 max-w-full items-center gap-3">
        {isFolder ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <Folder className="h-7 w-7 text-primary" />
          </span>
        ) : isImage ? (
          <MediaThumb
            item={{ fileAssetId: data.id, mimeType: data.mimeType }}
            resolveSignedUrl={thumbResolver}
            variant="card"
            className="pointer-events-none h-10 w-10 shrink-0 rounded-lg"
          />
        ) : (
          <FileVisual file={data} className="pointer-events-none h-10 w-10 shrink-0 rounded-lg bg-[hsl(var(--muted))] object-cover" />
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium" title={name}>
            <span className="truncate">{name}</span>
            {isFolder && data.scope === "COMPANY" && <Users className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" />}
          </p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
            {isFolder ? `${data.fileCount} ${data.fileCount === 1 ? "archivo" : "archivos"}` : formatBytes(data.sizeBytes)}
            {layout.compact && <span> · {shortDate(when)}</span>}
            {!isFolder && data.enabled === false && (
              <span className="ml-1.5 rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-medium" title="Archivo deshabilitado: no se puede abrir ni compartir hasta que lo habilites">
                Deshabilitado
              </span>
            )}
          </p>
        </div>
      </div>
      {layout.showModified && <span className="truncate whitespace-nowrap text-xs text-[hsl(var(--muted-foreground))]">{formatDate(when)}</span>}
      {layout.showKind && <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">{isFolder ? "Carpeta" : getKindLabel(getFileKind(data))}</span>}
      {layout.showSize && <span className="text-right text-xs text-[hsl(var(--muted-foreground))]">{isFolder ? "" : formatBytes(data.sizeBytes)}</span>}
      {layout.coarse && (
        <button
          type="button"
          aria-label={`Arrastrar ${name} a una carpeta`}
          disabled={!canDrag}
          onPointerDown={onHandleDown}
          onClick={(e) => e.stopPropagation()}
          className="flex h-11 w-9 touch-none items-center justify-center text-[hsl(var(--muted-foreground))] disabled:opacity-25"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}
      <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <ActionMenu label={`Acciones de ${name}`} items={menu} triggerClassName="h-11 w-11 md:h-8 md:w-8" />
      </div>
    </div>
  );
  return (
    // Touch long-press opens the menu without a native contextmenu event, so select on open.
    <ContextMenu onOpenChange={(open) => open && onContextMenu?.()}>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <MenuEntries entries={menu} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
