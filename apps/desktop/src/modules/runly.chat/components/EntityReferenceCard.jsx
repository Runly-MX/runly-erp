import { useNavigate } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import { ENTITY_TYPE_BY_VALUE } from "../lib/entityReferenceTypes";
import { EntityTypeTile } from "./EntityTypeTile";
import { EntityStatusChip } from "./EntityPreviewContent";
import { EntityPreviewPopover } from "./EntityPreviewPopover";

function formatBalance(balance, currency) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency ?? "MXN" }).format(balance);
  } catch {
    // Unknown/invalid currency code - Intl throws rather than falling back.
    return `${balance} ${currency ?? ""}`.trim();
  }
}

// `attached` is true when this card immediately follows a text bubble in the
// same message - it then drops its own border/background/top-radius in favor
// of matching whichever bubble color sits above it, so the two read as one
// continuous message. Without text above it (an entity-ref-only message) it
// keeps its own independent card look.
// Hover (desktop) or tap (touch) opens a live preview of the record.
export function EntityReferenceCard({ reference, attached = false, isOwn = false }) {
  const navigate = useNavigate();
  const typeLabel = ENTITY_TYPE_BY_VALUE[reference.entityType]?.label ?? "Registro";
  const isContact = reference.entityType === "contact";
  const hasBalance = reference.entityType === "ledger_account" && reference.balance != null;

  const attachedClasses = isOwn
    ? "bg-(--brand-primary) text-(--brand-primary-foreground) border-transparent rounded-t-none"
    : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border-transparent rounded-t-none";
  const standaloneClasses = "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]";
  const mutedTextClass = attached && isOwn ? "opacity-80" : "text-[hsl(var(--muted-foreground))]";

  return (
    <EntityPreviewPopover entityType={reference.entityType} recordId={reference.recordId} snapshot={reference}>
      <button
        type="button"
        onClick={() => navigate(reference.url)}
        className={[
          "flex w-72 max-w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
          attached ? attachedClasses : standaloneClasses,
        ].join(" ")}
      >
        <EntityTypeTile reference={reference} size={40} />
        <div className="min-w-0 flex-1">
          <p className={["text-[10px] font-semibold uppercase tracking-wide", mutedTextClass].join(" ")}>{typeLabel}</p>
          <p className="chat-font-display text-sm font-semibold leading-tight truncate">{reference.title}</p>
          {isContact ? (
            <div className={["mt-0.5 space-y-0.5 text-[11px]", mutedTextClass].join(" ")}>
              {reference.phone ? <p className="flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0" />{reference.phone}</p> : null}
              {reference.email ? <p className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{reference.email}</p> : null}
            </div>
          ) : reference.subtitle ? (
            <p className={["chat-font-mono text-[11px] truncate", mutedTextClass].join(" ")}>{reference.subtitle}</p>
          ) : null}
        </div>
        {hasBalance ? (
          <span className="chat-font-mono text-xs font-bold shrink-0 tabular-nums">{formatBalance(reference.balance, reference.currency)}</span>
        ) : null}
        <span className="shrink-0"><EntityStatusChip reference={reference} /></span>
      </button>
    </EntityPreviewPopover>
  );
}
