import { useEffect, useMemo, useRef, useState } from "react";
import { Download, File as FileIcon, FileText, Film, Image as ImageIcon, Images, Music } from "lucide-react";
import { cn } from "../lib/utils.js";
import { cachedUrl, useInView } from "../lib/lazy-media.js";
import { groupMedia } from "../lib/media-grouping.js";
import { AdvancedFileViewer } from "./AdvancedFileViewer.jsx";
import { Button } from "./Button.jsx";
import { Checkbox } from "./Checkbox.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { Skeleton } from "./Skeleton.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table.jsx";
import { ViewModeSwitch } from "./ViewModeSwitch.jsx";
import { ColumnResizeHandle } from "./ColumnResizeHandle.jsx";
import { useColumnResize } from "../hooks/useColumnResize.js";

// Reusable multimedia gallery: photos and documents from any record set, with
// Cuadrícula / Tarjetas / Tabla views, kind filter (todo / imágenes / archivos),
// grouping (by date, plus any `groupings` the screen defines), selection,
// download and a viewer that walks the visible sequence like Google Photos.
//
// items: [{ id, fileAssetId, name, mimeType, sizeBytes, date, groupId?, groupLabel? }]
// resolveSignedUrl(fileAssetId, variant?) -> Promise<url> (variant: "card" | "preview" | undefined = original)
// onDownload(items) -> Promise (receives the selection, or every visible item)
// groupings: extra groupings, [{ key: "group", label: "Por inventario" }] using groupId / groupLabel.
// Optional: views (subset of grid/cards/table), showKindFilter (false hides Todo/Imágenes/Archivos when the host already filters),
// selectionActions({ items, clear }) -> node rendered beside Descargar while something is selected,
// onOpenItem(item) -> true when the host opened the item itself (e.g. an Office editor).
// Touch: long-press a tile to start selecting; while a selection exists a tap toggles instead of opening.

const KINDS = [
  { key: "all", label: "Todo" },
  { key: "image", label: "Imágenes" },
  { key: "file", label: "Archivos" },
];

const isImage = (item) => String(item.mimeType ?? "").startsWith("image/");

function iconFor(mime) {
  const type = String(mime ?? "");
  if (type.startsWith("image/")) return ImageIcon;
  if (type.startsWith("video/")) return Film;
  if (type.startsWith("audio/")) return Music;
  if (type.includes("pdf") || type.startsWith("text/") || type.includes("document") || type.includes("sheet")) return FileText;
  return FileIcon;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const dayKey = (value) => String(value ?? "").slice(0, 10);

function MediaThumb({ item, resolveSignedUrl, sharp = true, className }) {
  const [ref, inView] = useInView();
  const [url, setUrl] = useState(null);
  const [low, setLow] = useState(false);
  const [ready, setReady] = useState(false);
  const image = isImage(item);
  const Icon = iconFor(item.mimeType);

  useEffect(() => {
    if (!image || !inView || !item.fileAssetId) return undefined;
    let cancelled = false;
    const load = (variant) => cachedUrl(`media|${item.fileAssetId}|${variant}`, () => resolveSignedUrl(item.fileAssetId, variant));
    load("card").then((small) => {
      if (cancelled || !small) return;
      setUrl(small);
      setLow(sharp);
    });
    if (sharp) {
      load("preview").then((big) => {
        if (cancelled || !big) return;
        setUrl(big);
        setLow(false);
      });
    }
    return () => { cancelled = true; };
  }, [image, inView, item.fileAssetId, resolveSignedUrl, sharp]);

  return (
    <div ref={ref} className={cn("relative flex items-center justify-center overflow-hidden bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]", className)}>
      {image && url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setReady(true)}
          className={cn("h-full w-full object-cover transition duration-300", ready ? "opacity-100" : "opacity-0", low && "scale-105 blur-md")}
        />
      ) : (
        <Icon className="h-1/3 w-1/3 min-h-4 min-w-4 opacity-60" aria-hidden="true" />
      )}
    </div>
  );
}

// Long-press (touch/pen) selection. `handlers` go on the tappable element;
// `consumed()` tells the click handler the press already became a selection.
function useLongPress(onLongPress, ms = 450) {
  const timer = useRef(null);
  const fired = useRef(false);
  const origin = useRef(null);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    handlers: {
      onPointerDown: (e) => {
        if (e.pointerType === "mouse") return;
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => { fired.current = true; onLongPress(); navigator.vibrate?.(10); }, ms);
      },
      onPointerMove: (e) => {
        const start = origin.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e) => { if (fired.current) e.preventDefault(); },
    },
    consumed: () => { const was = fired.current; fired.current = false; return was; },
  };
}

function SelectBox({ checked, onChange, label, className }) {
  return (
    <span className={cn("rounded-md bg-[hsl(var(--background))]/80 p-1 backdrop-blur", className)} onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={checked} onCheckedChange={onChange} aria-label={label} />
    </span>
  );
}

function MediaTile({ item, isSelected, selecting, resolveSignedUrl, onOpen, onToggle }) {
  const press = useLongPress(onToggle);
  return (
    <div className="group relative">
      <button
        type="button"
        {...press.handlers}
        onClick={() => { if (!press.consumed()) onOpen(); }}
        className={cn("block w-full select-none overflow-hidden rounded-xl border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/40 [-webkit-touch-callout:none]", isSelected ? "border-(--brand-primary) ring-2 ring-(--brand-primary)/40" : "border-[hsl(var(--border))]")}
      >
        <MediaThumb item={item} resolveSignedUrl={resolveSignedUrl} className="aspect-square w-full" />
        {!isImage(item) ? <span className="block truncate px-2 py-1.5 text-xs">{item.name}</span> : null}
      </button>
      <SelectBox
        checked={isSelected}
        onChange={onToggle}
        label={`Seleccionar ${item.name}`}
        className={cn("absolute left-1.5 top-1.5", selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100")}
      />
    </div>
  );
}

function MediaCard({ item, isSelected, resolveSignedUrl, onOpen, onToggle, onOpenGroup, openGroupLabel }) {
  const press = useLongPress(onToggle);
  return (
    <div className={cn("group relative flex items-center gap-3 rounded-xl border bg-[hsl(var(--card))] p-2.5", isSelected ? "border-(--brand-primary)" : "border-[hsl(var(--border))]")}>
      <button type="button" {...press.handlers} onClick={() => { if (!press.consumed()) onOpen(); }} className="shrink-0 select-none overflow-hidden rounded-lg [-webkit-touch-callout:none]">
        <MediaThumb item={item} resolveSignedUrl={resolveSignedUrl} sharp={false} className="h-16 w-16" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{[item.groupLabel, formatBytes(item.sizeBytes)].filter(Boolean).join(" · ")}</p>
        {onOpenGroup && item.groupId ? (
          <button type="button" onClick={() => onOpenGroup(item)} className="text-xs text-(--brand-primary) hover:underline">{openGroupLabel}</button>
        ) : null}
      </div>
      <SelectBox checked={isSelected} onChange={onToggle} label={`Seleccionar ${item.name}`} />
    </div>
  );
}

export function MediaGallery({
  items = [],
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  resolveSignedUrl,
  onDownload,
  groupings = [],
  onOpenGroup,
  openGroupLabel = "Ver registro",
  storageKey,
  toolbarStart = null,
  emptyTitle = "Sin archivos",
  emptyDescription = "Aquí aparecen las fotos y documentos adjuntos.",
  onKindChange,
  showKindFilter = true,
  views = ["grid", "cards", "table"],
  selectionActions = null,
  onOpenItem = null,
}) {
  const resize = useColumnResize(`media-${storageKey ?? "table"}`);
  const storedKey = storageKey ? `runly-media-${storageKey}` : null;
  const read = (name, fallback) => {
    try { return (storedKey && localStorage.getItem(`${storedKey}-${name}`)) || fallback; } catch { return fallback; }
  };
  const write = (name, value) => { try { if (storedKey) localStorage.setItem(`${storedKey}-${name}`, value); } catch { /* storage blocked */ } };

  const groupingOptions = useMemo(
    () => [{ key: "date", label: "Por fecha" }, ...groupings, { key: "none", label: "Todas" }],
    [groupings],
  );
  const [view, setView] = useState(() => read("view", "grid"));
  const [kind, setKind] = useState("all");
  const [grouping, setGrouping] = useState(() => {
    const saved = read("grouping", "date");
    return groupingOptions.some((o) => o.key === saved) ? saved : "date";
  });
  const [selected, setSelected] = useState(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(-1);

  const visible = useMemo(
    () => items.filter((item) => kind === "all" || (kind === "image") === isImage(item)),
    [items, kind],
  );
  const groups = useMemo(() => groupMedia(visible, grouping), [visible, grouping]);
  // Viewer sequence = what the user sees, group after group.
  const sequence = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const indexById = useMemo(() => new Map(sequence.map((item, i) => [item.id, i])), [sequence]);

  const selectedItems = sequence.filter((item) => selected.has(item.id));
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setMany = (list, on) => setSelected((prev) => {
    const next = new Set(prev);
    list.forEach((item) => (on ? next.add(item.id) : next.delete(item.id)));
    return next;
  });

  async function download() {
    const list = selectedItems.length ? selectedItems : sequence;
    if (!list.length || !onDownload) return;
    setDownloading(true);
    try { await onDownload(list); } finally { setDownloading(false); }
  }

  const viewerFiles = useMemo(
    () => sequence.map((item) => ({ id: item.id, fileAssetId: item.fileAssetId, originalName: item.name, mimeType: item.mimeType, sizeBytes: item.sizeBytes })),
    [sequence],
  );

  const segmented = (options, value, onChange) => (
    <div className="inline-flex shrink-0 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-card">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn("px-3 py-1.5 text-xs font-medium transition-colors", value === option.key ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  // Tap = open (or toggle while a selection exists); long-press = select.
  const open = (item) => {
    if (selected.size) { toggle(item.id); return; }
    if (onOpenItem?.(item)) return;
    setViewerIndex(indexById.get(item.id) ?? 0);
  };

  const tileProps = (item) => ({
    item,
    isSelected: selected.has(item.id),
    selecting: selected.size > 0,
    resolveSignedUrl,
    onOpen: () => open(item),
    onToggle: () => toggle(item.id),
  });
  const renderTile = (item) => <MediaTile key={item.id} {...tileProps(item)} />;
  const renderCard = (item) => <MediaCard key={item.id} {...tileProps(item)} onOpenGroup={onOpenGroup} openGroupLabel={openGroupLabel} />;

  const renderTable = (list) => (
    <div className="overflow-clip rounded-2xl surface-card">
      <Table {...resize.tableProps(["select", "thumb", "name", "group", "size", "date"])}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="relative w-10" {...resize.headerProps("select")}><Checkbox checked={list.every((i) => selected.has(i.id)) ? true : list.some((i) => selected.has(i.id)) ? "indeterminate" : false} onCheckedChange={(on) => setMany(list, Boolean(on))} aria-label="Seleccionar grupo" /></TableHead>
            <TableHead className="relative w-16" {...resize.headerProps("thumb")} />
            {[
              ["name", "Nombre"],
              ["group", groupings[0]?.label?.replace(/^Por /, "").replace(/^./, (c) => c.toUpperCase()) ?? "Origen"],
              ["size", "Tamaño"],
              ["date", "Fecha"],
            ].map(([key, label]) => (
              <TableHead key={key} className="relative" {...resize.headerProps(key)}>
                {label}
                <ColumnResizeHandle {...resize.handleProps(key)} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((item) => (
            <TableRow key={item.id} className="cursor-pointer" onClick={() => open(item)}>
              <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} aria-label={`Seleccionar ${item.name}`} /></TableCell>
              <TableCell><MediaThumb item={item} resolveSignedUrl={resolveSignedUrl} sharp={false} className="h-10 w-10 rounded-lg" /></TableCell>
              <TableCell className="max-w-64 truncate font-medium">{item.name}</TableCell>
              <TableCell className="max-w-48 truncate text-[hsl(var(--muted-foreground))]">{item.groupLabel ?? ""}</TableCell>
              <TableCell className="tabular-nums text-[hsl(var(--muted-foreground))]">{formatBytes(item.sizeBytes)}</TableCell>
              <TableCell className="tabular-nums text-[hsl(var(--muted-foreground))]">{dayKey(item.date).split("-").reverse().join("/")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const body = () => {
    if (loading) {
      return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-square w-full rounded-xl" />)}</div>;
    }
    if (!visible.length) return <EmptyState icon={Images} title={emptyTitle} description={emptyDescription} />;
    return (
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.id} className="space-y-3">
            {group.label ? (
              <header className="flex items-center gap-3">
                <SelectBox
                  checked={group.items.every((i) => selected.has(i.id))}
                  onChange={(on) => setMany(group.items, Boolean(on))}
                  label={`Seleccionar ${group.label}`}
                  className="bg-transparent p-0"
                />
                <h3 className="text-sm font-semibold capitalize">{group.label}</h3>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{group.items.length}</span>
              </header>
            ) : null}
            {view === "table" ? renderTable(group.items) : null}
            {view === "cards" ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{group.items.map(renderCard)}</div> : null}
            {view === "grid" ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">{group.items.map(renderTile)}</div> : null}
          </section>
        ))}
        {hasMore ? (
          <div className="flex justify-center">
            <Button variant="outline" onClick={onLoadMore} loading={loadingMore}>Cargar más</Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {toolbarStart}
        <div className="-mx-4 flex max-w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:flex-wrap sm:overflow-visible sm:px-0 max-sm:basis-full">
          {showKindFilter ? segmented(KINDS, kind, (next) => { setKind(next); onKindChange?.(next); }) : null}
          {segmented(groupingOptions, grouping, (next) => { setGrouping(next); write("grouping", next); })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selected.size ? <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Quitar ({selected.size})</Button> : null}
          {selected.size && selectionActions ? selectionActions({ items: selectedItems, clear: () => setSelected(new Set()) }) : null}
          {onDownload ? (
            <Button variant="outline" size="sm" onClick={download} loading={downloading} disabled={!sequence.length} aria-label={selected.size ? "Descargar selección" : "Descargar todo"}>
              <Download className="h-4 w-4 sm:mr-1.5" />
              <span className="max-sm:sr-only">{selected.size ? `Descargar selección (${selected.size})` : "Descargar todo"}</span>
            </Button>
          ) : null}
          <ViewModeSwitch modes={views} value={views.includes(view) ? view : views[0]} onChange={(mode) => { setView(mode); write("view", mode); }} />
        </div>
      </div>
      {body()}
      <AdvancedFileViewer
        open={viewerIndex >= 0}
        onOpenChange={(open) => { if (!open) setViewerIndex(-1); }}
        files={viewerFiles}
        activeIndex={Math.max(0, viewerIndex)}
        onIndexChange={setViewerIndex}
        onResolveSignedUrl={(file) => resolveSignedUrl(file?.fileAssetId)}
      />
    </div>
  );
}
