import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "../components/Button.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog.jsx";
import { TextField, SelectField } from "../components/FormFields.jsx";
import { buildApiHeaders } from "../lib/apiHeaders.js";
import { fieldKeyFromLabel } from "./custom-field-key.js";

// "New custom field" modal for DynamicFieldsSection (spec
// 2026-10-03-inventory-custom-fields-modes). Creates the definition
// (POST createPath) without leaving the record form; opens from the
// "Agregar campo" search when the typed field does not exist. Scopes:
// - "item": on-demand field, added to this record only;
// - "type": always asked for records of the current type;
// - "all": always asked for every type.
// Plain inputs, not a <form>: Enter saves the field and never submits the record form.

export const CUSTOM_FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "boolean", label: "Sí/No" },
  { value: "select", label: "Lista de opciones" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
];

const SCOPE_OPTIONS = [
  { value: "item", label: "Solo este registro" },
  { value: "type", label: "Siempre en este tipo" },
  { value: "all", label: "Siempre en todos los tipos" },
];

function joinUrl(baseUrl, apiPath) {
  return `${String(baseUrl ?? "").trim().replace(/\/+$/, "")}${apiPath}`;
}

export function CustomFieldCreator({ open, onClose, initialLabel = "", createPath, categoryValue, existingKeys, apiBaseUrl, token, companyId, onCreated }) {
  const [label, setLabel] = useState(initialLabel);
  const [fieldType, setFieldType] = useState("text");
  const [optionsText, setOptionsText] = useState("");
  const [scope, setScope] = useState("item");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(initialLabel);
    setFieldType("text");
    setOptionsText("");
    setScope("item");
    setError("");
  }, [open, initialLabel]);

  const options = optionsText.split(/[,\n]/).map((o) => o.trim()).filter(Boolean);
  const canSave = label.trim() && (fieldType !== "select" || options.length > 0) && !busy;
  const scopeOptions = categoryValue ? SCOPE_OPTIONS : SCOPE_OPTIONS.filter((o) => o.value !== "type");

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(joinUrl(apiBaseUrl, createPath), {
        method: "POST",
        headers: { ...buildApiHeaders(token, companyId), "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          fieldKey: fieldKeyFromLabel(label, existingKeys),
          fieldType,
          onDemand: scope === "item",
          categoryId: scope === "type" && categoryValue ? String(categoryValue) : null,
          ...(fieldType === "select" ? { options } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error("No tienes permiso para crear campos personalizados.");
      if (!res.ok) throw new Error(json?.error ?? "No se pudo crear el campo.");
      onCreated?.(json?.data ?? json, scope);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el campo.");
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = (event) => {
    if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
      event.preventDefault();
      save();
    }
    if (event.key === "Escape") onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose?.(); }}>
      <DialogContent className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-0 p-0" onKeyDown={onKeyDown}>
        <DialogHeader icon={SlidersHorizontal} className="mb-0 shrink-0 border-b border-[hsl(var(--border))] px-5 py-4 pr-12">
          <DialogTitle>Nuevo campo personalizado</DialogTitle>
          <DialogDescription>Define el campo y dónde se va a usar.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <TextField label="Nombre del campo" required autoFocus value={label} placeholder="Memoria RAM" onChange={(e) => setLabel(e.target.value)} />
          <SelectField label="Tipo de dato" value={fieldType} onValueChange={setFieldType} options={CUSTOM_FIELD_TYPES} />
          {fieldType === "select" ? (
            <TextField label="Opciones" required value={optionsText} placeholder="8 GB, 16 GB, 32 GB" hint="Sepáralas con comas." onChange={(e) => setOptionsText(e.target.value)} />
          ) : null}
          <SelectField
            label="Dónde se usa"
            value={scope}
            onValueChange={setScope}
            options={scopeOptions}
            hint={scope === "item" ? "Queda en la biblioteca para agregarlo a otros registros cuando haga falta." : undefined}
          />
          {error ? <p className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
        </div>
        <DialogFooter className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onClose?.()} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={!canSave} loading={busy}>
            Crear campo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
