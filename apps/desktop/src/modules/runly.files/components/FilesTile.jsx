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
  "[&[data-drop-hover=true]]:bg-[var(--brand-primary)]/25 [&[data-drop-hover=true]]:ring-2 [&[data-drop-hover=true]]:ring-inset [&[data-drop-hover=true]]:ring-[var(--brand-primary)]";

// Grid / mosaic cell of the explorer: a square of the grid, edge to edge (photos
// app style). The caption sits on the image under a dark gradient (`captions`);
// a selected cell shrinks inward (scale .85) instead of drawing a frame. Selected
// cells are the drag source; an unselected press starts a marquee.
export function FilesTile({
  item,
  selected,
  selecting,
  coarse,
  captions,
  canDrag,
  summary,
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
        "group relative aspect-square select-none overflow-hidden bg-[hsl(var(--muted))]/60 [-webkit-touch-callout:none]",
        HOVER,
        drop.isOver && "bg-[var(--brand-primary)]/25 ring-2 ring-inset ring-[var(--brand-primary)]",
        disabled && "opacity-60",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden transition-[transform,border-radius] duration-150",
          selected && "scale-[.85] rounded-lg",
        )}
      >
        {isFolder ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[hsl(var(--muted))]/70 p-2 text-center">
            <Folder className="h-1/3 w-1/3 min-h-6 min-w-6 text-primary" strokeWidth={1.4} />
            <p className="flex w-full items-center justify-center gap-1 text-xs font-medium" title={name}>
              <span className="truncate">{name}</span>
              {data.scope === "COMPANY" && <Users className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" />}
            </p>
            <p className="w-full truncate text-[11px] text-[hsl(var(--muted-foreground))]">{summary}</p>
          </div>
        ) : (
          <>
            {isImage ? (
              <MediaThumb
                item={{ fileAssetId: data.id, mimeType: data.mimeType }}
                resolveSignedUrl={thumbResolver}
                variant="tile"
                className="pointer-events-none h-full w-full"
              />
            ) : (
              <FileTile item={{ name, mimeType: data.mimeType }} compact className="pointer-events-none h-full w-full" />
            )}
            {captions && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-1.5 pt-8 text-white">
                <p className="truncate text-xs font-medium leading-tight drop-shadow" title={name}>{name}</p>
                <p className="truncate text-[10px] leading-tight text-white/75">{formatBytes(data.sizeBytes)}</p>
              </div>
            )}
          </>
        )}
        {disabled && (
          <span className="pointer-events-none absolute left-1 top-1 rounded bg-[hsl(var(--background))]/85 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))] backdrop-blur">
            Deshabilitado
          </span>
        )}
      </div>
      <span
        className={cn(
          "absolute left-1.5 top-1.5 rounded-md bg-[hsl(var(--background))]/80 p-1 backdrop-blur",
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
          className="absolute right-1.5 top-1.5 flex h-8 w-8 touch-none items-center justify-center rounded-md bg-[hsl(var(--background))]/80 text-[hsl(var(--muted-foreground))] backdrop-blur disabled:opacity-25"
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
