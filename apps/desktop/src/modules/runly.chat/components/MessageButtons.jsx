// Buttons of an interactive message (links, or Aprobar / Rechazar of an approval). The
// platform stores what each button does; the app only shows them and asks the server to
// run one. Once resolved, the buttons give way to who decided what. Spec
// docs/superpowers/specs/2026-10-26-interactive-messages-design.md.
import { useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

const STYLES = {
  primary: "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] hover:opacity-90",
  danger: "border border-[hsl(var(--destructive))]/50 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10",
  default: "border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]",
};

export function MessageButtons({ message }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(null);
  const actions = message.metadata?.actions;
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const resolution = message.metadata?.resolution;
  if (resolution) {
    if (resolution.decision === "choice") {
      return <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"><Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />{resolution.byName}: {resolution.label}</p>;
    }
    const approved = resolution.decision === "approve";
    return (
      <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
        {approved ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <X className="h-3.5 w-3.5 text-[hsl(var(--destructive))]" aria-hidden />}
        {approved ? "Aprobado" : "Rechazado"} por {resolution.byName}
      </p>
    );
  }
  async function run(action) {
    setBusy(action.id);
    try {
      await runly.chat.performMessageAction(message.id, action.id, session?.access_token);
    } catch (error) {
      toast.error("No se pudo completar", { description: error?.message });
    } finally {
      setBusy(null);
    }
  }
  const base = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 [@media(pointer:coarse)]:min-h-11";
  return (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Acciones del mensaje">
      {actions.map((action) => action.kind === "link" ? (
        <a key={action.id} href={action.url} target={/^https?:/.test(action.url) ? "_blank" : undefined} rel="noopener noreferrer" className={`${base} ${STYLES.default}`}>
          {action.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : (
        <button key={action.id} type="button" disabled={busy !== null} onClick={() => run(action)} className={`${base} cursor-pointer ${STYLES[action.style] ?? STYLES.default}`}>
          {busy === action.id ? "..." : action.label}
        </button>
      ))}
    </div>
  );
}
