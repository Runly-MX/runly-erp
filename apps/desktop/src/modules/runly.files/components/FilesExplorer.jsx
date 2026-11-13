import { useMemo, useRef } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  createAutoScroller,
  createUrlBatcher,
  useMarqueeSelect,
  cn,
} from "@runly/ui";
import { SPRING_MS, startItemDrag } from "../lib/dnd";
import { columnLayout, useElementWidth, useFilesColumns } from "../hooks/useFilesColumns";
import { FilesListHeader } from "./FilesListHeader";
import { FilesListRow } from "./FilesListRow";
import { FilesTile } from "./FilesTile";

const MAX_FILES = 50; // bulk download limit; the selection of files is capped to it
const isCoarse = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

// ONE explorer for every view of Files: details list, grid and mosaic share the
// same items (folders first, then files), selection (click / Ctrl / Shift /
// marquee / keyboard), context menu, drag-to-move and spring-open folders.
// `view`: "list" | "grid" | "mosaic". Phones (coarse pointer): tap opens, long-press
// opens the menu, the checkbox / grip handle select and drag.
export function FilesExplorer({
  view,
  tileSize = 160,
  folders,
  files,
  selectedFileIds,
  onSelectFiles,
  selectedFolderIds,
  onSelectFolders,
  resolveThumbs,
  sort,
  onSortChange,
  canMoveFile,
  canManageFolder,
  buildMenu,
  backgroundMenu,
  onOpen,
  onRename,
  onDelete,
  onDropItems,
  onSpringOpen,
}) {
  const items = useMemo(
    () => [...folders.map((data) => ({ id: data.id, type: "folder", data })), ...files.map((data) => ({ id: data.id, type: "file", data }))],
    [folders, files],
  );
  const thumbResolver = useMemo(() => createUrlBatcher((ids, variant) => resolveThumbs(ids, variant)), [resolveThumbs]);
  const wrapRef = useRef(null);
  const width = useElementWidth(wrapRef);
  const coarse = isCoarse();
  const layout = columnLayout(width, coarse);
  const columns = useFilesColumns();
  const anchor = useRef(null);
  const cursor = useRef(null);

  const folderSel = useMemo(() => new Set(selectedFolderIds), [selectedFolderIds]);
  const fileSel = useMemo(() => new Set(selectedFileIds), [selectedFileIds]);
  const isSelected = (item) => (item.type === "folder" ? folderSel.has(item.id) : fileSel.has(item.id));
  const selected = items.filter(isSelected);

  function setSelection(list) {
    onSelectFolders(list.filter((i) => i.type === "folder").map((i) => i.id));
    onSelectFiles(list.filter((i) => i.type === "file").map((i) => i.id).slice(0, MAX_FILES));
  }
  function toggle(item) {
    anchor.current = cursor.current = item.id;
    setSelection(isSelected(item) ? selected.filter((i) => i.id !== item.id) : [...selected, item]);
  }
  function onItemClick(item, e) {
    // Phones: tap opens, unless a selection is under way (then taps add/remove).
    if (coarse && !e.ctrlKey && !e.metaKey && !e.shiftKey) return selected.length ? toggle(item) : onOpen(item);
    if (e.shiftKey && anchor.current) {
      const from = items.findIndex((i) => i.id === anchor.current);
      const to = items.findIndex((i) => i.id === item.id);
      if (from >= 0 && to >= 0) return setSelection(items.slice(Math.min(from, to), Math.max(from, to) + 1));
    }
    if (e.ctrlKey || e.metaKey) return toggle(item);
    anchor.current = cursor.current = item.id;
    setSelection([item]);
  }

  const canDragItem = (i) => (i.type === "folder" ? canManageFolder(i.data) : canMoveFile(i.data));
  const marquee = useMarqueeSelect({
    ignoreSelector: "button,[role=checkbox],input,a,[role=menu],[role=columnheader],[data-drag-zone],[data-item-id][data-selected=true]",
    getSelectedIds: () => selected.map((i) => i.id),
    onSelect: (ids) => {
      const wanted = new Set(ids);
      setSelection(items.filter((i) => wanted.has(i.id)));
    },
  });
  const scroller = useMemo(() => {
    const s = createAutoScroller(() => marquee.containerRef.current, () => s.onScroll?.());
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The movable part of what a drag starting on `item` carries.
  function dragPayload(item) {
    const group = isSelected(item) ? selected : [item];
    if (!isSelected(item)) setSelection([item]);
    const ok = group.filter(canDragItem);
    if (!ok.length) return null;
    return {
      payload: { fileIds: ok.filter((i) => i.type === "file").map((i) => i.id), folderIds: ok.filter((i) => i.type === "folder").map((i) => i.id) },
      label: ok.length === 1 ? (ok[0].type === "folder" ? ok[0].data.name : ok[0].data.originalName) : `${ok.length} elementos`,
    };
  }
  // Mouse: native HTML5 drag (startItemDrag also handles the edge auto-scroll).
  function onDragStart(item, e) {
    const drag = dragPayload(item);
    if (!drag) return e.preventDefault();
    startItemDrag(e, drag.payload, drag.label);
  }
  // Touch has no HTML5 DnD: the grip handle runs a pointer drag with a floating
  // label; the folder under the finger (rows, tiles, breadcrumb) is [data-drop-id].
  function onHandleDown(item, e) {
    const drag = dragPayload(item);
    if (!drag) return;
    const ghost = document.createElement("div");
    ghost.textContent = drag.label;
    ghost.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;padding:6px 12px;border-radius:8px;font:600 13px system-ui;background:#1f2937;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    document.body.appendChild(ghost);
    let hover = null;
    let spring = null;
    let at = { x: e.clientX, y: e.clientY };
    const place = () => {
      ghost.style.left = `${at.x + 12}px`;
      ghost.style.top = `${at.y - 44}px`;
    };
    const mark = () => {
      const target = document.elementFromPoint(at.x, at.y)?.closest("[data-drop-id]") ?? null;
      if (target === hover) return;
      hover?.removeAttribute("data-drop-hover");
      target?.setAttribute("data-drop-hover", "true");
      hover = target;
      // Keep hovering a folder and it opens, so you can drill down while dragging.
      clearTimeout(spring);
      if (target && onSpringOpen) {
        const id = target.dataset.dropId;
        spring = setTimeout(() => onSpringOpen(id), SPRING_MS);
      }
    };
    place();
    scroller.onScroll = mark;
    scroller.start();
    const move = (ev) => {
      at = { x: ev.clientX, y: ev.clientY };
      place();
      scroller.update(ev.clientY);
      mark();
    };
    const end = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      scroller.stop();
      clearTimeout(spring);
      ghost.remove();
      const dropId = ev.type === "pointerup" ? hover?.dataset.dropId : null;
      hover?.removeAttribute("data-drop-hover");
      if (dropId) onDropItems?.(drag.payload, dropId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // Tiles per row, measured from the rendered tiles (for ↑/↓ in grid and mosaic).
  function perRow() {
    if (view === "list") return 1;
    const els = [...marquee.containerRef.current.querySelectorAll("[data-item-id]")];
    if (!els.length) return 1;
    const top = els[0].getBoundingClientRect().top;
    return Math.max(1, els.filter((el) => Math.abs(el.getBoundingClientRect().top - top) < 4).length);
  }
  function onKeyDown(e) {
    if (e.target.closest("input,textarea,[role=menu]")) return;
    const one = selected.length === 1 ? selected[0] : null;
    const step = { ArrowDown: perRow(), ArrowUp: -perRow(), ArrowRight: view === "list" ? 0 : 1, ArrowLeft: view === "list" ? 0 : -1 }[e.key];
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection(items);
    } else if (step && items.length) {
      e.preventDefault();
      const from = items.findIndex((i) => i.id === (cursor.current ?? anchor.current));
      const next = Math.max(0, Math.min(items.length - 1, from < 0 ? 0 : from + step));
      cursor.current = items[next].id;
      if (e.shiftKey && anchor.current) {
        const a = items.findIndex((i) => i.id === anchor.current);
        setSelection(items.slice(Math.min(a, next), Math.max(a, next) + 1));
      } else {
        anchor.current = items[next].id;
        setSelection([items[next]]);
      }
      marquee.containerRef.current.querySelector(`[data-item-id="${items[next].id}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Escape") setSelection([]);
    else if (e.key === "Enter" && one) onOpen(one);
    else if (e.key === "F2" && one) onRename(one);
    else if (e.key === "Delete" && one) onDelete(one);
  }

  const common = (item) => ({
    item,
    selected: isSelected(item),
    canDrag: canDragItem(item),
    thumbResolver,
    menu: buildMenu(item, isSelected(item) ? selected : [item]),
    onClick: (e) => onItemClick(item, e),
    onDoubleClick: () => !coarse && onOpen(item),
    onToggle: () => toggle(item),
    onContextMenu: () => !isSelected(item) && setSelection([item]),
    onDragStart: (e) => onDragStart(item, e),
    onHandleDown: (e) => onHandleDown(item, e),
    onDropItems: onDropItems && ((payload) => onDropItems(payload, item.id)),
    onSpring: item.type === "folder" && onSpringOpen ? () => onSpringOpen(item.id) : undefined,
  });

  const body =
    view === "list" ? (
      items.map((item) => <FilesListRow key={item.id} {...common(item)} layout={layout} widths={columns.widths} />)
    ) : (
      <div
        className={view === "grid" ? "grid gap-2" : undefined}
        style={view === "grid" ? { gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` } : { columnWidth: `${tileSize}px`, columnGap: "0.5rem" }}
      >
        {items.map((item) => (
          <FilesTile key={item.id} {...common(item)} coarse={coarse} selecting={selected.length > 0} mosaic={view === "mosaic"} />
        ))}
      </div>
    );

  return (
    <div
      ref={wrapRef}
      role={view === "list" ? "grid" : "listbox"}
      aria-multiselectable="true"
      className={cn(view === "list" && "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]")}
    >
      {view === "list" && (
        <FilesListHeader
          layout={layout}
          columns={columns}
          allSelected={items.length > 0 && selected.length === items.length}
          onToggleAll={(v) => setSelection(v ? items : [])}
          sort={sort}
          onSortChange={onSortChange}
        />
      )}
      <div ref={marquee.containerRef} tabIndex={0} onKeyDown={onKeyDown} onPointerDown={marquee.onPointerDown} className="relative p-1 outline-none">
        {body}
        {/* Empty space under the items: right-click offers upload / new folder here. */}
        <ContextMenu>
          <ContextMenuTrigger asChild disabled={!backgroundMenu?.length}>
            <div className="min-h-[30vh]" aria-hidden="true" />
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            {(backgroundMenu ?? []).map((entry, index) => {
              const Icon = entry.icon;
              return (
                <ContextMenuItem key={index} onSelect={() => setTimeout(entry.onClick, 80)}>
                  {Icon && <Icon />}
                  {entry.label}
                </ContextMenuItem>
              );
            })}
          </ContextMenuContent>
        </ContextMenu>
        {marquee.marqueeNode}
      </div>
    </div>
  );
}
