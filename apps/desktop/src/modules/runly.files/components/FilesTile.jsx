import {
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  FileTile,
  MediaThumb,
  cn,
  formatBytes,
} from "@runly/ui";
import { Folder, GripVertical, Users } from "lucide-react";
import { useItemDropTarget } from "../lib/dnd";
import { MenuEntries, afterMenuClose } from "./FilesListRow";

const HOVER =
  "[&[data-drop-hover=true]]:ring-2 [&[data-drop-hover=true]]:ring-[var(--brand-primary)] [&[data-drop-hover=true]]:bg-[var(--brand-primary)]/15";

// Grid / mosaic tile of the explorer: thumbnail (or kind tile / folder), caption,
// checkbox. Selected tiles are the drag source; an unselected press starts a marquee.
export function FilesTile({
  item,
  selected,
  selecting,
  coarse,
  mosaic,
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
  const disabled = !isFolder && data.enabled === false;
  const tile = (
    <div
      data-item-id={item.id}
      data-selected={selected}
      data-drop-id={isFolder && onDropItems ? item.id : undefined}
      role="gridcell"
      aria-selected={selected}
      draggable={!coarse && selected && canDrag}
      onDragStart={onDragStart}
      {...drop.props}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={cn(
        "group relative select-none rounded-xl border bg-[hsl(var(--card))] p-1.5 transition-colors [-webkit-touch-callout:none]",
        HOVER,
        mosaic && "mb-2 break-inside-avoid",
        selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 ring-2 ring-[var(--brand-primary)]/40" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50",
        drop.isOver && "ring-2 ring-[var(--brand-primary)] bg-[var(--brand-primary)]/15",
        disabled && "opacity-60",
      )}
    >
      <div className="relative overflow-hidden rounded-lg">
        {isFolder ? (
          <div className="flex aspect-[4/3] items-center justify-center bg-[hsl(var(--muted))]/50">
            <Folder className="h-1/2 w-1/2 min-h-8 min-w-8 text-primary" strokeWidth={1.4} />
          </div>
        ) : isImage ? (
          <MediaThumb
            item={{ fileAssetId: data.id, mimeType: data.mimeType }}
            resolveSignedUrl={thumbResolver}
            variant={mosaic ? "tilefit" : "tile"}
            fit={mosaic}
            className={cn("pointer-events-none w-full", !mosaic && "aspect-square")}
          />
        ) : (
          <FileTile item={{ name, mimeType: data.mimeType }} compact className="pointer-events-none aspect-square w-full" />
        )}
        {disabled && (
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-[hsl(var(--background))]/85 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))] backdrop-blur">
            Deshabilitado
          </span>
        )}
      </div>
      <div className="px-1 pb-0.5 pt-1.5">
        <p className="flex items-center gap-1 text-sm font-medium" title={name}>
          <span className="truncate">{name}</span>
          {isFolder && data.scope === "COMPANY" && <Users className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" />}
        </p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
          {isFolder ? `${data.fileCount} ${data.fileCount === 1 ? "archivo" : "archivos"}` : formatBytes(data.sizeBytes)}
        </p>
      </div>
      <span
        className={cn(
          "absolute left-2.5 top-2.5 rounded-md bg-[hsl(var(--background))]/80 p-1 backdrop-blur",
          selecting || selected ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Seleccionar ${name}`} />
      </span>
      {coarse && (
        <button
          type="button"
          aria-label={`Arrastrar ${name} a una carpeta`}
          disabled={!canDrag}
          onPointerDown={onHandleDown}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 touch-none items-center justify-center rounded-md bg-[hsl(var(--background))]/80 text-[hsl(var(--muted-foreground))] backdrop-blur disabled:opacity-25"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
    </div>
  );
  return (
    <ContextMenu onOpenChange={(open) => open && onContextMenu?.()}>
      <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <MenuEntries entries={menu} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
