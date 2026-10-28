import { Copy, Download, X } from "lucide-react";
import { toLocalIso } from "@runly/core/browser";
import { Button } from "../components/Button.jsx";
import { useCopyValue } from "../hooks/useCopyValue.js";

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(entries, name) {
  const csv = ["Campo,Valor", ...entries.map((e) => `${csvCell(e.label)},${csvCell(e.text)}`)].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "detalle"}-${toLocalIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Floating bar of the detail field selection (same look as BulkActionBar).
// `entries` is [{ label, text }] in display order.
export function DetailSelectionBar({ entries, exportName, onClear }) {
  const copy = useCopyValue();
  if (entries.length === 0) return null;
  const count = entries.length;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 max-w-[calc(100vw-1rem)]">
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 shadow-lg">
        <span className="mr-2 text-sm font-medium text-foreground">
          {count} {count === 1 ? "campo" : "campos"}
        </span>
        <div className="mr-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => void copy(entries.map((e) => `${e.label}: ${e.text}`).join("\n"))}
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar clave: valor
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => void copy(entries.map((e) => e.text).join("\n"))}
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar valores
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => exportCsv(entries, exportName)}
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
        <div className="ml-1 h-4 w-px bg-border" />
        <button
          type="button"
          className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={onClear}
          aria-label="Limpiar selección"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
