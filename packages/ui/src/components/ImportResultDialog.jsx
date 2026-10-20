import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { Badge } from "./Badge.jsx";
import { Button } from "./Button.jsx";
import { DataTable } from "./DataTable.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog.jsx";

const STATUS = {
  created: { label: "Creado", variant: "success" },
  updated: { label: "Actualizado", variant: "secondary" },
  skipped: { label: "Omitido", variant: "outline" },
  warning: { label: "Advertencia", variant: "warning" },
  error: { label: "Error", variant: "destructive" },
};

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "problems", label: "Con problemas" },
  { key: "created", label: "Creados" },
  { key: "updated", label: "Actualizados" },
  { key: "skipped", label: "Omitidos" },
];

const COLUMNS = [
  { accessorKey: "line", header: "Fila" },
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

// Shared "what happened" review shown after any bulk import instead of a
// lone toast. `items` is the per-row outcome ({ line, name, status, message },
// status = created | updated | skipped | warning | error); counts are derived
// from it. The dialog opens on the problem rows when there are any.
export function ImportResultDialog({ open, onOpenChange, title = "Resultado de la importación", items = [], extraSummary = [], filename = "resultado-importacion.csv" }) {
  const counts = useMemo(() => {
    const out = { created: 0, updated: 0, skipped: 0, warning: 0, error: 0 };
    for (const item of items) if (item.status in out) out[item.status] += 1;
    return out;
  }, [items]);
  const problems = counts.error + counts.warning;
  const [filter, setFilter] = useState(null);
  const active = filter ?? (problems > 0 ? "problems" : "all");
  const rows = useMemo(() => {
    if (active === "all") return items;
    if (active === "problems") return items.filter((i) => i.status === "error" || i.status === "warning");
    return items.filter((i) => i.status === active);
  }, [items, active]);

  function handleOpenChange(next) {
    if (!next) setFilter(null);
    onOpenChange(next);
  }

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
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant="success">{counts.created} creados</Badge>
          {counts.updated ? <Badge variant="secondary">{counts.updated} actualizados</Badge> : null}
          {counts.skipped ? <Badge variant="outline">{counts.skipped} omitidos</Badge> : null}
          {counts.warning ? <Badge variant="warning">{counts.warning} advertencias</Badge> : null}
          {counts.error ? <Badge variant="destructive">{counts.error} con error</Badge> : null}
          {extraSummary.map((text) => <Badge key={text} variant="outline">{text}</Badge>)}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button key={f.key} type="button" size="sm" variant={active === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <DataTable columns={COLUMNS} data={rows} pageSize={20} getRowId={(row, index) => `${row.line}-${row.status}-${index}`} emptyTitle="No hay filas en esta vista" />
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
