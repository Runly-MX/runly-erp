// Module Builder — "Solo si" of an automation: up to MAX_CONDITIONS rows that
// must all hold (spec 2026-10-24-automation-studio-v2-design.md §Design).
import { Button, SelectField, TextField } from "@runly/ui";
import { Plus, Trash2 } from "lucide-react";
import { MAX_CONDITIONS, conditionsOf } from "@runly/module-compiler/browser";

const OP_OPTIONS = [
  { value: "equals", label: "Es igual a" },
  { value: "not_equals", label: "Es distinto de" },
  { value: "contains", label: "Contiene" },
  { value: "not_contains", label: "No contiene" },
  { value: "gt", label: "Es mayor que" },
  { value: "gte", label: "Es mayor o igual a" },
  { value: "lt", label: "Es menor que" },
  { value: "lte", label: "Es menor o igual a" },
  { value: "changed", label: "Cambió" },
  { value: "filled", label: "Tiene valor" },
  { value: "empty", label: "Está vacío" },
];
const VALUE_OPS = ["equals", "not_equals", "contains", "not_contains", "gt", "gte", "lt", "lte"];
const NUMBER_OPS = ["gt", "gte", "lt", "lte"];

// Stored as a single object when there is one condition (v1 shape), as a list otherwise.
export function packConditions(list) {
  if (!list.length) return undefined;
  return list.length === 1 ? list[0] : list;
}

function valueFor(op, previous) {
  if (!VALUE_OPS.includes(op)) return {};
  if (NUMBER_OPS.includes(op)) return { value: Number.isFinite(previous) ? previous : 0 };
  return { value: typeof previous === "string" ? previous : "" };
}

export function AutomationConditions({ trigger, fieldOptions, readOnly, onChange, heading = null }) {
  const list = conditionsOf(trigger.when);
  const ops = OP_OPTIONS.filter((op) => op.value !== "changed" || (trigger.type === "record" && trigger.on !== "create"));
  const update = (index, patch) => onChange(packConditions(list.map((condition, i) => (i === index ? patch : condition))));
  const remove = (index) => onChange(packConditions(list.filter((_, i) => i !== index)));
  const chosen = (condition) => fieldOptions.find((option) => option.value === condition.field);
  const add = () => onChange(packConditions([...list, { field: fieldOptions[0]?.value ?? "", op: "filled" }]));

  return (
    <div className="@container space-y-2">
      <p className="text-sm font-medium">{heading ?? `Solo si${list.length ? "" : " (siempre)"}`}</p>
      {list.map((condition, index) => (
        <div key={index} className="grid gap-2 @md:grid-cols-[1fr_1fr_1fr_auto] @md:items-end">
          <SelectField label={index === 0 ? "Campo" : "Y además"} options={fieldOptions} value={condition.field ?? ""} disabled={readOnly}
            onValueChange={(field) => update(index, { ...condition, field })} />
          <SelectField label="Condición" options={ops} value={condition.op} disabled={readOnly}
            onValueChange={(op) => update(index, { field: condition.field, op, ...valueFor(op, condition.value) })} />
          {VALUE_OPS.includes(condition.op) ? (
            <TextField label="Valor" value={String(condition.value ?? "")} disabled={readOnly}
              type={NUMBER_OPS.includes(condition.op) ? "number" : "text"}
              placeholder={chosen(condition)?.example ? `Ej. ${chosen(condition).example}` : undefined}
              onChange={(e) => update(index, { ...condition, value: NUMBER_OPS.includes(condition.op) ? Number(e.target.value) : e.target.value })} />
          ) : <span />}
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={() => remove(index)} aria-label="Quitar condición"><Trash2 className="h-4 w-4" /></Button>
          )}
          {chosen(condition)?.description && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] @md:col-span-4">{chosen(condition).description}</p>
          )}
        </div>
      ))}
      {list.length === 0 && fieldOptions.length > 0 && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Puedes comparar cualquiera de los {fieldOptions.length} datos que trae este disparador, por ejemplo «{fieldOptions[0].label}».</p>
      )}
      {!readOnly && list.length < MAX_CONDITIONS && fieldOptions.length > 0 && (
        <Button variant="outline" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" /> Agregar condición</Button>
      )}
    </div>
  );
}
