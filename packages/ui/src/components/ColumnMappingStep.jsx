import { ArrowLeft, Check, TriangleAlert } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Badge } from "./Badge.jsx";
import { SelectField } from "./FormFields.jsx";

const NONE = "__none__";

// Generic "relate each file column to a target field" step for import wizards.
// Fields are grouped by `group`; a header already used by one field is hidden
// from the other dropdowns. Mapping shape: { [fieldKey]: headerName }.
export function ColumnMappingStep({ headers = [], rows = [], fields = [], mapping = {}, onMappingChange, title }) {
  const headerOptions = [{ value: NONE, label: "No importar" }, ...headers.map((h) => ({ value: h, label: h }))];
  const used = new Set(Object.values(mapping).filter(Boolean));
  const mappedCount = fields.filter((f) => mapping[f.key]).length;
  const sample = (header) => {
    const row = rows.find((r) => r[header] !== undefined && r[header] !== null && String(r[header]).trim() !== "");
    return row ? String(row[header]) : "";
  };
  const groups = [...new Set(fields.map((f) => f.group ?? ""))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title ? <p className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</p> : <span />}
        <Badge variant="outline">{mappedCount} de {fields.length} campos relacionados</Badge>
      </div>
      {groups.map((group) => (
        <section key={group} className="space-y-1.5">
          {group ? (
            <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group}</h4>
          ) : null}
          <div className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]">
            {fields.filter((f) => (f.group ?? "") === group).map((field) => {
              const current = mapping[field.key] ?? NONE;
              const isMapped = current !== NONE;
              const options = headerOptions.filter((o) => o.value === NONE || o.value === current || !used.has(o.value));
              const example = isMapped ? sample(current) : "";
              const missing = field.required && !isMapped;
              return (
                <div key={field.key} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_1.2fr] sm:gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[hsl(var(--foreground))]">
                      {isMapped ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Relacionado" />
                      ) : missing ? (
                        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Falta relacionar" />
                      ) : null}
                      {field.label}
                      {field.required ? <Badge variant={missing ? "warning" : "secondary"}>Obligatorio</Badge> : null}
                    </p>
                    <p className={cn("truncate text-xs", missing ? "text-amber-700 dark:text-amber-400" : "text-[hsl(var(--muted-foreground))]")}>
                      {example ? `Ej. ${example}` : missing ? "Relaciona una columna para continuar" : field.hint ?? "Sin columna"}
                    </p>
                  </div>
                  <ArrowLeft className={cn("hidden h-4 w-4 sm:block", isMapped ? "text-(--brand-primary)" : "text-[hsl(var(--muted-foreground))]/40")} />
                  <SelectField
                    value={current}
                    options={options}
                    onValueChange={(v) => {
                      const next = { ...mapping };
                      if (v === NONE) delete next[field.key];
                      else next[field.key] = v;
                      onMappingChange?.(next);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
