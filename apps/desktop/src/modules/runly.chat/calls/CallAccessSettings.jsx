import { useState } from "react";
import { Check, Copy, RefreshCw, KeyRound, DoorOpen, Hourglass } from "lucide-react";
import { cn } from "@runly/ui";

export const ACCESS_MODES = [
  {
    value: "LOBBY",
    label: "Sala de espera",
    Icon: Hourglass,
    hint: "Tú admites a cada invitado antes de que entre.",
  },
  {
    value: "PIN",
    label: "Con PIN",
    Icon: KeyRound,
    hint: "Quien escriba el PIN entra directo; sin PIN espera a que lo admitas.",
  },
  {
    value: "OPEN",
    label: "Libre",
    Icon: DoorOpen,
    hint: "Cualquiera con el enlace o el ID de reunión entra directo.",
  },
];

export function accessModeOf(link) {
  if (!link) return "LOBBY";
  return link.accessMode ?? (link.requireLobby ? "LOBBY" : "OPEN");
}

export function formatPin(pin) {
  return pin ? `${pin.slice(0, 3)} ${pin.slice(3)}` : "";
}

// Guest access mode picker + PIN readout. `tone="dark"` is for surfaces on
// the call stage (always dark); the default follows the app theme.
export function CallAccessSettings({ link, onPatch, disabled = false, tone = "theme" }) {
  const [copied, setCopied] = useState(false);
  const mode = accessModeOf(link);
  const dark = tone === "dark";
  const active = ACCESS_MODES.find((m) => m.value === mode) ?? ACCESS_MODES[0];

  function copyPin() {
    if (!link?.pin) return;
    navigator.clipboard?.writeText(link.pin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Acceso de invitados"
        className={cn(
          "grid grid-cols-3 gap-1 rounded-xl p-1",
          dark ? "bg-white/5 ring-1 ring-white/10" : "bg-[hsl(var(--muted))]/60 ring-1 ring-[hsl(var(--border))]",
        )}
      >
        {ACCESS_MODES.map(({ value, label, Icon }) => {
          const selected = value === mode;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => !selected && onPatch?.({ accessMode: value })}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] font-semibold leading-tight transition-colors sm:flex-row sm:gap-1.5 sm:text-xs",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) disabled:opacity-50",
                selected
                  ? "bg-(--brand-primary) text-(--brand-primary-foreground) shadow-sm"
                  : dark
                    ? "text-slate-300 hover:bg-white/10 hover:text-white"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="text-center">{label}</span>
            </button>
          );
        })}
      </div>
      <p className={cn("text-xs", dark ? "text-slate-400" : "text-[hsl(var(--muted-foreground))]")}>{active.hint}</p>

      {mode === "PIN" && link?.pin && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2",
            dark ? "bg-white/5 ring-1 ring-white/10" : "bg-[hsl(var(--muted))]/60 ring-1 ring-[hsl(var(--border))]",
          )}
        >
          <span className={cn("text-xs font-medium", dark ? "text-slate-400" : "text-[hsl(var(--muted-foreground))]")}>PIN</span>
          <code className={cn("flex-1 font-mono text-lg font-semibold tracking-[0.2em] tabular-nums", dark ? "text-white" : "")}>
            {formatPin(link.pin)}
          </code>
          <button
            type="button"
            onClick={copyPin}
            className={cn("rounded-lg p-2 transition-colors", dark ? "text-slate-300 hover:bg-white/10" : "hover:bg-[hsl(var(--muted))]")}
            aria-label="Copiar PIN"
            title="Copiar PIN"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onPatch?.({ regeneratePin: true })}
            disabled={disabled}
            className={cn("rounded-lg p-2 transition-colors disabled:opacity-50", dark ? "text-slate-300 hover:bg-white/10" : "hover:bg-[hsl(var(--muted))]")}
            aria-label="Generar otro PIN"
            title="Generar otro PIN"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
