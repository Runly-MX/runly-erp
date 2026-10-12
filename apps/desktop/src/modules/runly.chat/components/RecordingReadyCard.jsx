import { Video } from "lucide-react";
import { Button } from "@runly/ui";
import { useCalls } from "../calls/CallsProvider";
import { getRecordingMeta } from "./callLogMeta";

export function RecordingReadyCard({ message }) {
  const meta = getRecordingMeta(message);
  const { requestOpenRecordings } = useCalls();
  if (!meta) return null;

  const conversationId = message.conversation_id ?? null;

  return (
    <div className="flex justify-center my-2 px-4">
      <div className="flex items-center gap-2.5 rounded-2xl bg-[hsl(var(--muted))] px-3.5 py-2 text-xs">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]">
          <Video className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium text-[hsl(var(--foreground))]">{message.body}</span>
        {conversationId && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => requestOpenRecordings(conversationId)}
          >
            Ver grabación
          </Button>
        )}
      </div>
    </div>
  );
}
