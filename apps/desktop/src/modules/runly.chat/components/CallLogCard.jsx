import { Phone, PhoneMissed, Video } from "lucide-react";
import { Button } from "@runly/ui";
import { useCalls } from "../calls/CallsProvider";
import { getCallMeta } from "./callLogMeta";

// Renders an atlas.calls lifecycle system message (see the in-call chat spec)
// as a compact, centered call-log row, WhatsApp style. Returns null for any
// message that is not a call card, so the caller can use it as a plain
// early-return branch.
export function CallLogCard({ message }) {
  const meta = getCallMeta(message);
  const { enabled, isStarting, activeCall, startCall } = useCalls();

  if (!meta) return null;

  const isVideo = meta.kind === "VIDEO";
  const isMissed = meta.endReason === "missed" || meta.endReason === "rejected";
  const Icon = isMissed ? PhoneMissed : isVideo ? Video : Phone;
  const conversationId = message.conversation_id ?? null;

  const canRecall =
    meta.event === "ended"
    && enabled
    && Boolean(conversationId)
    && !activeCall
    && !isStarting;

  return (
    <div className="flex justify-center my-2 px-4">
      <div className="flex items-center gap-2.5 rounded-2xl bg-[hsl(var(--muted))] px-3.5 py-2 text-xs">
        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            isMissed
              ? "bg-red-500/15 text-red-500"
              : "bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]",
          ].join(" ")}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium text-[hsl(var(--foreground))]">{message.body}</span>
        {canRecall && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => startCall({ conversationId, kind: isVideo ? "VIDEO" : "AUDIO" })}
          >
            Volver a llamar
          </Button>
        )}
      </div>
    </div>
  );
}
