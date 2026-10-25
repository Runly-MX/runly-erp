import { useState } from "react";
import { Grid3x3, X } from "lucide-react";
import { resolveLucideIcon } from "./resolve-icon.js";
import { IconLibraryPanel } from "./IconLibraryPanel.jsx";
import { Popover, PopoverTrigger, PopoverContent } from "./Popover.jsx";
import { Input } from "./Input.jsx";
import { Label } from "./Label.jsx";
import { fieldCls } from "./form-field-base.jsx";
import { cn } from "../lib/utils.js";

// Icon field. Without `icons` it is the app-wide icon library (the same picker notes
// use: categories, search, every lucide icon) and stores the lucide kebab-case name.
// With `icons` it keeps the compact constrained list (the Module Builder, whose
// compiler only accepts a fixed set of names).
export function IconPickerField({
  value,
  onChange,
  label,
  placeholder = "Seleccionar icono",
  disabled = false,
  icons = null,
}) {
  if (!icons) return <LibraryIconField value={value} onChange={onChange} label={label} placeholder={placeholder} disabled={disabled} />;
  return <ConstrainedIconField value={value} onChange={onChange} label={label} placeholder={placeholder} disabled={disabled} icons={icons} />;
}

function LibraryIconField({ value, onChange, label, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const Selected = resolveLucideIcon(value);
  // The panel marks the active icon by its kebab name; older values are normalised.
  const active = value && !Selected ? "" : String(value ?? "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])(\d)/g, "$1-$2").toLowerCase();
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={fieldCls(false, "flex items-center gap-2 text-left hover:bg-[hsl(var(--accent))] transition-colors")}
          >
            {Selected ? <Selected size={16} className="shrink-0 text-[hsl(var(--foreground))]" /> : <Grid3x3 size={16} className="shrink-0 text-[hsl(var(--muted-foreground))]" />}
            <span className={cn("flex-1 truncate", Selected ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))]")}>
              {Selected ? active.replace(/-/g, " ") : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-3">
          <IconLibraryPanel value={active} onChoose={(name) => { onChange(name); setOpen(false); }} gridClassName="max-h-72" />
          {value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="mt-2.5 flex w-full items-center gap-1.5 rounded px-1 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]">
              <X className="h-3 w-3" /> Sin icono
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ConstrainedIconField({ value, onChange, label, placeholder, disabled, icons }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = icons.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );

  const SelectedIcon = icons.find((i) => i.name === value)?.component ?? null;

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={fieldCls(
              false,
              "flex items-center gap-2 text-left hover:bg-[hsl(var(--accent))] transition-colors",
            )}
          >
            {SelectedIcon ? (
              <SelectedIcon
                size={16}
                className="shrink-0 text-[hsl(var(--foreground))]"
              />
            ) : (
              <Grid3x3
                size={16}
                className="shrink-0 text-[hsl(var(--muted-foreground))]"
              />
            )}
            <span
              className={cn(
                "flex-1 truncate",
                value
                  ? "text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))]",
              )}
            >
              {value || placeholder}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-3 border border-[hsl(var(--border))] backdrop-blur-none"
          style={{ background: "hsl(var(--card))" }}
          align="start"
        >
          <Input
            placeholder="Buscar icono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 h-8 text-sm"
          />
          <div className="grid grid-cols-6 gap-1 max-h-48 overflow-y-auto overscroll-contain">
            {filtered.map(({ name, component: Icon }) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex items-center justify-center h-9 w-9 rounded-md transition-colors",
                  "hover:bg-[hsl(var(--accent))]",
                  value === name &&
                    "bg-[hsl(var(--accent))] ring-1 ring-[hsl(var(--ring))]",
                )}
              >
                <Icon size={16} />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-6 text-xs text-center text-[hsl(var(--muted-foreground))] py-4">
                Sin resultados
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
