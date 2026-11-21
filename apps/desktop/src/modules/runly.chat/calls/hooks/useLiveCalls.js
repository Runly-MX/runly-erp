import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { useRealtimeContext } from "../../../../providers/RealtimeProvider";
import { useCalls } from "../CallsProvider";

export const LIVE_CALLS_KEY = ["chat-live-calls"];

// Every live call in my conversations ({ conversationId, call, myStatus }),
// so the chat list can mark them and the chat home can offer "Unirse" or
// "Regresar". `byConversation` maps conversationId -> entry.
export function useLiveCalls() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const { on } = useRealtimeContext();
  const { enabled, activeCall } = useCalls();

  const { data } = useQuery({
    queryKey: LIVE_CALLS_KEY,
    queryFn: async () => {
      const res = await runly.calls.listLive(token);
      return res?.data ?? [];
    },
    enabled: Boolean(enabled && token),
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: LIVE_CALLS_KEY });
    const offs = ["chat.call.meeting_started", "chat.call.incoming", "chat.call.ended"].map((event) => on(event, refresh));
    return () => offs.forEach((off) => off?.());
  }, [on, queryClient]);

  // My own call starting/ending changes what is joinable right away.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: LIVE_CALLS_KEY });
  }, [activeCall?.id, queryClient]);

  const calls = useMemo(() => (data ?? []).filter((entry) => entry.call?.status === "ACTIVE"), [data]);
  const byConversation = useMemo(() => new Map(calls.map((entry) => [entry.conversationId, entry])), [calls]);
  return { calls, byConversation, activeCallId: activeCall?.id ?? null };
}
