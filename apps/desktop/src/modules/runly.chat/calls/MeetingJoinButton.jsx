import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, cn } from "@runly/ui";
import { Video, Users } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useCalls } from "./CallsProvider";
import { PreJoinDialog } from "./PreJoinDialog";

const EARLY_MS = 10 * 60_000;

// Calendar event of a Runly meeting: "Unirse" when it is already running,
// otherwise "Iniciar reunión" without ringing — highlighted from 10 minutes
// before its start until it ends.
export function MeetingJoinButton({ conversationId, calendarEventId, startAt, endAt, onDone }) {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const { enabled, isStarting, activeCall, startCall, joinCall } = useCalls();
  const [preJoinOpen, setPreJoinOpen] = useState(false);
  const { data: live } = useQuery({
    queryKey: ["chat-conversation-live-call", conversationId],
    queryFn: async () => {
      const res = await runly.calls.getConversationLive(conversationId, token);
      return res?.data ?? null;
    },
    enabled: Boolean(enabled && conversationId && token),
    refetchInterval: 20_000,
    retry: false,
  });
  if (!enabled) return null;

  const now = Date.now();
  const start = startAt ? new Date(startAt).getTime() : now;
  const end = endAt ? new Date(endAt).getTime() : start + 60 * 60_000;
  const timely = now >= start - EARLY_MS && now <= end;
  const running = live?.call?.status === "ACTIVE";
  const busy = isStarting || Boolean(activeCall);

  if (running) {
    return (
      <>
        <Button type="button" className="w-full" disabled={busy} onClick={() => setPreJoinOpen(true)}>
          <Users className="mr-2 h-4 w-4" />
          Unirse a la reunión · {live.call.joinedCount} {live.call.joinedCount === 1 ? "persona" : "personas"}
        </Button>
        <PreJoinDialog
          open={preJoinOpen}
          onOpenChange={setPreJoinOpen}
          name={userProfile?.displayName}
          busy={isStarting}
          onJoin={async (prefs) => {
            if (await joinCall(live.call.id, prefs)) { setPreJoinOpen(false); onDone?.(); }
          }}
        />
      </>
    );
  }

  return (
    <Button
      type="button"
      variant={timely ? "default" : "outline"}
      className={cn("w-full")}
      disabled={busy}
      onClick={async () => {
        const started = await startCall({ conversationId, calendarEventId, kind: "VIDEO", ring: false });
        if (started) onDone?.();
      }}
    >
      <Video className="mr-2 h-4 w-4" />
      {timely ? "Iniciar reunión" : "Iniciar reunión ahora"}
    </Button>
  );
}
