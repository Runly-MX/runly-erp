import { useEffect, useRef, useState } from "react";
import { Input, Textarea, cn } from "@runly/ui";
import { Check, Loader2, Pencil, X } from "lucide-react";

const BOX = "w-full rounded-md border px-3 py-2 text-sm leading-relaxed";

function IconAction({ label, onClick, disabled, children, tone = "muted" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 md:h-7 md:w-7",
        tone === "brand"
          ? "bg-(--brand-primary) text-(--brand-primary-foreground) hover:bg-(--brand-primary)/90"
          : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
      )}
    >
      {children}
    </button>
  );
}

// A value shown in an input-shaped box. "Editar" turns that same box into an
// input (identical padding/border, so nothing jumps) and swaps the pencil for
// save/cancel in the label row. Enter saves (Ctrl/Cmd+Enter when multiline),
// Escape cancels.
export function InlineEditableField({
  label, value, placeholder = "", emptyText = "Sin definir", multiline = false,
  canEdit = false, required = false, maxLength, onSave, saving = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    if (el?.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const trimmed = draft.trim();
  const invalid = required && !trimmed;

  async function save() {
    if (invalid) return;
    if (trimmed === (value ?? "").trim()) { setEditing(false); return; }
    try {
      await onSave(trimmed || null);
      setEditing(false);
    } catch { /* the caller toasts; stay in edit mode */ }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); return; }
    if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  }

  const fieldId = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-9 items-center justify-between gap-2 md:min-h-7">
        <label htmlFor={fieldId} className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</label>
        {canEdit && (editing ? (
          <div className="flex items-center gap-1">
            <IconAction label="Cancelar" onClick={() => setEditing(false)} disabled={saving}><X className="h-4 w-4" /></IconAction>
            <IconAction label="Guardar" tone="brand" onClick={save} disabled={saving || invalid}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </IconAction>
          </div>
        ) : (
          <IconAction label={`Editar ${label.toLowerCase()}`} onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></IconAction>
        ))}
      </div>
      {editing ? (
        multiline ? (
          <Textarea
            id={fieldId}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            rows={3}
            title="Ctrl + Enter para guardar · Esc para cancelar"
            className={cn(BOX, "min-h-20 resize-none border-(--brand-primary)/60 bg-[hsl(var(--background))]")}
          />
        ) : (
          <Input
            id={fieldId}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            className={cn(BOX, "h-auto border-(--brand-primary)/60 bg-[hsl(var(--background))]")}
          />
        )
      ) : (
        <p
          id={fieldId}
          onDoubleClick={canEdit ? () => setEditing(true) : undefined}
          className={cn(
            BOX,
            "whitespace-pre-wrap wrap-break-word border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30",
            multiline && "min-h-20",
            !value && "text-[hsl(var(--muted-foreground))]",
          )}
        >
          {value || emptyText}
        </p>
      )}
    </div>
  );
}
