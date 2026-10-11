import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Video, Phone, Users } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useRealtimeContext } from "../../../providers/RealtimeProvider";
import { useCalls } from "./CallsProvider";

function unwrap(r) {
  return r?.data ?? r;
}

function useElapsedLabel(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  return minutes < 1 ? "recién iniciada" : `hace ${minutes} min`;
}

// "Reunión en curso · Unirse": shown above a conversation when it has a live
// call/meeting the viewer is not in (e.g. a meeting started without ringing).
export function LiveMeetingBanner({ conversationId }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const { on } = useRealtimeContext();
  const { activeCall, joinCall, isStarting } = useCalls();
  const queryKey = ["chat-conversation-live-call", conversationId];

  const { data } = useQuery({
    queryKey,
    queryFn: async () => unwrap(await runly.calls.getConversationLive(conversationId, token)) ?? null,
    enabled: Boolean(conversationId && token),
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });

  useEffect(() => {
    const refresh = (payload) => {
      if (!payload?.conversationId || payload.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey });
      }
    };
    const offs = [
      on("chat.call.meeting_started", refresh),
      on("chat.call.incoming", refresh),
      on("chat.call.ended", () => queryClient.invalidateQueries({ queryKey })),
    ];
    return () => offs.forEach((off) => off?.());
  }, [on, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh when my own call ends/starts so the banner hides/shows at once.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [activeCall?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = data?.call ?? null;
  const elapsed = useElapsedLabel(call?.startedAt);
  if (!call || call.status !== "ACTIVE") return null;
  if (activeCall?.id === call.id || data?.myStatus === "JOINED") return null;

  const Icon = call.kind === "AUDIO" ? Phone : Video;
  return (
    <div
      role="status"
      className="mx-3 mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300 ring-2 ring-[hsl(var(--background))]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">Reunión en curso</p>
        <p className="flex items-center gap-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          {call.joinedCount} {call.joinedCount === 1 ? "persona" : "personas"}{elapsed ? ` · ${elapsed}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => joinCall(call.id)}
        disabled={isStarting || Boolean(activeCall)}
        className="min-h-[36px] shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
      >
        Unirse
      </button>
    </div>
  );
}
