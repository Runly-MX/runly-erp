import { Wrench, Package, DollarSign } from "lucide-react";

function formatMXN(value) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function CostsSummaryPanel({ laborCost = 0, partsCost = 0, totalCost = 0 }) {
  const labor = Math.max(0, Number(laborCost ?? 0));
  const parts = Math.max(0, Number(partsCost ?? 0));
  const total = labor + parts;

  const laborPct = total > 0 ? Math.round((labor / total) * 100) : 0;
  const partsPct = total > 0 ? 100 - laborPct : 0;

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <h5 className="text-sm font-semibold text-[hsl(var(--foreground))]">Resumen de Costos</h5>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
            <Wrench className="h-3.5 w-3.5" />
            Mano de Obra
          </span>
          <span className="font-medium">{formatMXN(labor)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
            <Package className="h-3.5 w-3.5" />
            Refacciones
          </span>
          <span className="font-medium">{formatMXN(parts)}</span>
        </div>

        {total > 0 && (
          <div className="rounded-full overflow-hidden h-2 bg-[hsl(var(--muted))] flex">
            <div
              className="bg-blue-500 transition-all duration-300"
              style={{ width: `${laborPct}%` }}
              title={`Mano de obra ${laborPct}%`}
            />
            <div
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${partsPct}%` }}
              title={`Refacciones ${partsPct}%`}
            />
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            M. Obra
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Refacciones
          </span>
        </div>
      </div>

      <div className="border-t border-[hsl(var(--border))] pt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">TOTAL</span>
        <span className="text-base font-bold text-[var(--brand-primary)]">{formatMXN(totalCost)}</span>
      </div>
    </div>
  );
}
