import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Lock, MinusCircle, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "./Badge.jsx";
import { Button } from "./Button.jsx";
import { DataTable } from "./DataTable.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { cn } from "../lib/utils.js";

// tone = classes of the icon chip and of the active tile; the label always accompanies the color.
const STATUS = {
  created: { label: "Creado", plural: "Creados", variant: "success", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400", ring: "border-emerald-500/50 bg-emerald-500/5" },
  updated: { label: "Actualizado", plural: "Actualizados", variant: "secondary", icon: RefreshCw, tone: "text-sky-600 bg-sky-500/10 dark:text-sky-400", ring: "border-sky-500/50 bg-sky-500/5" },
  skipped: { label: "Omitido", plural: "Omitidos", variant: "outline", icon: MinusCircle, tone: "text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]", ring: "border-[hsl(var(--foreground))]/30 bg-[hsl(var(--muted))]/40" },
  restricted: { label: "Sin acceso", plural: "Sin acceso", variant: "warning", icon: Lock, tone: "text-amber-600 bg-amber-500/10 dark:text-amber-400", ring: "border-amber-500/50 bg-amber-500/5" },
  warning: { label: "Advertencia", plural: "Advertencias", variant: "warning", icon: AlertTriangle, tone: "text-amber-600 bg-amber-500/10 dark:text-amber-400", ring: "border-amber-500/50 bg-amber-500/5" },
  error: { label: "Error", plural: "Con error", variant: "destructive", icon: XCircle, tone: "text-destructive bg-destructive/10", ring: "border-destructive/50 bg-destructive/5" },
};
const ORDER = ["created", "updated", "skipped", "restricted", "warning", "error"];
const PROBLEMS = new Set(["error", "warning", "restricted"]);
const MOBILE_PAGE = 20;

const COLUMNS = [
  { accessorKey: "line", header: "Fila", size: 60 },
  {
    id: "status",
    header: "Resultado",
    accessorFn: (r) => STATUS[r.status]?.label ?? r.status,
    cell: ({ row }) => {
      const s = STATUS[row.original.status];
      return <Badge variant={s?.variant ?? "outline"}>{s?.label ?? row.original.status}</Badge>;
    },
  },
  { accessorKey: "name", header: "Registro" },
  { accessorKey: "message", header: "Detalle" },
];

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(items, filename) {
  const lines = [["Fila", "Resultado", "Registro", "Detalle"].map(csvCell).join(",")];
  for (const item of items) {
    lines.push([item.line, STATUS[item.status]?.label ?? item.status, item.name, item.message].map(csvCell).join(","));
  }
  const url = URL.createObjectURL(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// One outcome as a tile that also filters the list below. Number first, label second, icon as a chip.
function StatTile({ status, count, active, onClick }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:transition-none",
        active ? s.ring : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/40",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", s.tone)}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold leading-none tabular-nums">{count}</span>
        <span className="mt-1 block truncate text-xs text-[hsl(var(--muted-foreground))]">{s.plural}</span>
      </span>
    </button>
  );
}

// Phones get a list of cards: a five-column table does not fit and scrolls sideways.
function RowList({ rows }) {
  const [shown, setShown] = useState(MOBILE_PAGE);
  if (!rows.length) return <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No hay filas en esta vista</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rows.slice(0, shown).map((row, index) => {
          const s = STATUS[row.status];
          return (
            <li key={`${row.line}-${row.status}-${index}`} className="space-y-1.5 rounded-xl border border-[hsl(var(--border))] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 wrap-break-word text-sm font-medium">{row.name || "Sin nombre"}</p>
                <Badge variant={s?.variant ?? "outline"} className="shrink-0">{s?.label ?? row.status}</Badge>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Fila {row.line}</p>
              {row.message ? <p className="wrap-break-word text-xs text-[hsl(var(--foreground))]/80">{row.message}</p> : null}
            </li>
          );
        })}
      </ul>
      {rows.length > shown ? (
        <Button type="button" variant="outline" className="w-full pointer-coarse:min-h-11" onClick={() => setShown((n) => n + MOBILE_PAGE)}>
          Mostrar más ({rows.length - shown})
        </Button>
      ) : null}
    </div>
  );
}

// Shared "what happened" review shown after any bulk import instead of a lone toast. `items` is the per-row
// outcome ({ line, name, status, message }, status = created | updated | skipped | restricted | warning | error);
// the tiles count it and double as filters. The dialog opens on the rows that need attention when there are any.
// `extraSections` (optional node) renders between the tiles and the rows, e.g. actions for restricted rows.
export function ImportResultDialog({ open, onOpenChange, title = "Resultado de la importación", items = [], extraSummary = [], extraSections = null, filename = "resultado-importacion.csv" }) {
  const isMobile = useIsMobile(768);
  const counts = useMemo(() => {
    const out = Object.fromEntries(ORDER.map((key) => [key, 0]));
    for (const item of items) if (item.status in out) out[item.status] += 1;
    return out;
  }, [items]);
  const problems = counts.error + counts.warning + counts.restricted;
  const [filter, setFilter] = useState(null);
  const active = filter ?? (problems > 0 ? "problems" : "all");
  const rows = useMemo(() => {
    if (active === "all") return items;
    if (active === "problems") return items.filter((i) => PROBLEMS.has(i.status));
    return items.filter((i) => i.status === active);
  }, [items, active]);
  const tiles = ORDER.filter((key) => counts[key] > 0 || key === "created");

  function handleOpenChange(next) {
    if (!next) setFilter(null);
    onOpenChange(next);
  }
  const toggle = (key) => setFilter(active === key ? "all" : key);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent scrollable size="2xl">
        <DialogHeader icon={problems ? AlertTriangle : CheckCircle2} tone={problems ? "warning" : "primary"}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {problems
              ? `${problems} ${problems === 1 ? "fila requiere" : "filas requieren"} tu atención. El resto se procesó correctamente.`
              : "Todo se procesó correctamente."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-0.5 pb-1">
          <section aria-label="Resumen" className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {tiles.map((key) => <StatTile key={key} status={key} count={counts[key]} active={active === key} onClick={() => toggle(key)} />)}
            </div>
            {extraSummary.length ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{extraSummary.join(" · ")}</p>
            ) : null}
          </section>

          {extraSections}

          <section aria-label="Detalle por fila" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {active === "all" ? "Todas las filas" : active === "problems" ? "Filas que requieren atención" : STATUS[active]?.plural}
                <span className="ml-1.5 font-normal text-[hsl(var(--muted-foreground))]">({rows.length})</span>
              </p>
              {active !== "all" ? <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={() => setFilter("all")}>Ver todas</Button> : null}
            </div>
            {isMobile
              ? <RowList key={active} rows={rows} />
              : <DataTable columns={COLUMNS} data={rows} pageSize={20} getRowId={(row, index) => `${row.line}-${row.status}-${index}`} emptyTitle="No hay filas en esta vista" />}
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={!items.length} onClick={() => downloadCsv(items, filename)}>
            <Download className="mr-1.5 h-3.5 w-3.5" />Descargar detalle
          </Button>
          <Button type="button" onClick={() => handleOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
