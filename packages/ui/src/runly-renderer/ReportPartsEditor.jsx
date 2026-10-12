import { Button } from "../components/Button.jsx";
import { TextField, TextareaField } from "../components/FormFields.jsx";

function toPositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function toMoney(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}

// Used only on blur — trims and validates strictly
function normalizePart(item) {
  const name = String(item?.name ?? "").trim();
  const quantity = toPositiveInteger(item?.quantity, 1);
  const unitCost = toMoney(item?.unit_cost, 0);
  const notes = String(item?.notes ?? "").trim();
  const subtotal = Number((quantity * unitCost).toFixed(2));
  return { name, quantity, unit_cost: unitCost, notes, subtotal };
}

// Used during live editing — does NOT trim, allows empty quantity string
function patchPart(existing, patch) {
  const merged = { ...existing, ...patch };
  const q = Number.parseFloat(String(merged.quantity ?? ""));
  const u = toMoney(merged.unit_cost, 0);
  const subtotal = Number.isFinite(q) && q > 0 ? Number((q * u).toFixed(2)) : 0;
  return { ...merged, subtotal };
}

function formatMoney(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

export function ReportPartsEditor({
  parts = [],
  onChange,
  readonly = false,
  label = null,
}) {
  const safeParts = Array.isArray(parts)
    ? parts.map((item) => ({
        name: String(item?.name ?? ""),
        quantity: item?.quantity ?? 1,
        unit_cost: item?.unit_cost ?? 0,
        notes: String(item?.notes ?? ""),
        subtotal: item?.subtotal ?? 0,
      }))
    : [];

  const updatePart = (index, patch) => {
    const next = safeParts.map((item, i) => (i === index ? patchPart(item, patch) : item));
    onChange?.(next);
  };

  const finalizePart = (index) => {
    const next = safeParts.map((item, i) => (i === index ? normalizePart(item) : item));
    onChange?.(next);
  };

  const removePart = (index) => {
    const next = safeParts.filter((_, i) => i !== index);
    onChange?.(next);
  };

  const addPart = () => {
    onChange?.([
      ...safeParts,
      { name: "", quantity: 1, unit_cost: 0, notes: "", subtotal: 0 },
    ]);
  };

  const partsTotal = Number(
    safeParts.reduce((acc, item) => acc + Number(item.subtotal ?? 0), 0).toFixed(2),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <h5 className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</h5>
        ) : <div />}
        {!readonly ? (
          <Button type="button" variant="outline" size="sm" onClick={addPart}>
            Agregar
          </Button>
        ) : null}
      </div>

      {safeParts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/25 px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          <p>No hay refacciones agregadas.</p>
          {!readonly ? (
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={addPart}>
                Agregar primera refaccion
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {safeParts.map((item, index) => (
            <div
              key={`part-${index}`}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 space-y-3"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_10rem_auto]">
                <TextField
                  label="Descripción"
                  value={item.name}
                  disabled={readonly}
                  onChange={(event) => updatePart(index, { name: event.target.value })}
                  onBlur={() => finalizePart(index)}
                />
                <TextField
                  label="Cant."
                  type="number"
                  min={1}
                  step={1}
                  value={String(item.quantity)}
                  disabled={readonly}
                  onChange={(event) => updatePart(index, { quantity: event.target.value })}
                  onBlur={() => finalizePart(index)}
                />
                <TextField
                  label="P. unit."
                  type="number"
                  step="0.01"
                  min={0}
                  value={String(item.unit_cost)}
                  disabled={readonly}
                  onChange={(event) => updatePart(index, { unit_cost: event.target.value })}
                  onBlur={() => finalizePart(index)}
                />
                <div className="flex flex-col justify-end gap-1">
                  <p className="text-xs text-[hsl(var(--muted-foreground))] font-medium">Subtotal</p>
                  <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-2 text-sm font-semibold text-right">
                    {formatMoney(item.subtotal)}
                  </div>
                  {!readonly ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removePart(index)}>
                      Eliminar
                    </Button>
                  ) : null}
                </div>
              </div>
              <TextareaField
                label="Notas"
                value={item.notes ?? ""}
                rows={2}
                disabled={readonly}
                onChange={(event) => updatePart(index, { notes: event.target.value })}
                onBlur={() => finalizePart(index)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end border-t border-[hsl(var(--border))] pt-3">
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
          Total refacciones:{" "}
          <span className="text-[var(--brand-primary)]">{formatMoney(partsTotal)}</span>
        </p>
      </div>
    </div>
  );
}
