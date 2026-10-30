import { useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useRealtimeContext } from "../../../providers/RealtimeProvider";
import { useCalls } from "../calls/CallsProvider";

function unwrap(r) { return r?.data ?? r; }

// The list only polls while a recording is already in flight, so one started
// in a call (from this view or anywhere else) never showed up until a reload:
// refresh recordings and transcripts when a call of this conversation ends,
// and when my own call starts or ends.
function useRefreshOnCallChange(conversationId, enabled) {
  const qc = useQueryClient();
  const { on } = useRealtimeContext();
  const { activeCall } = useCalls();
  const activeCallId = activeCall?.id ?? null;

  useEffect(() => {
    if (!enabled || !conversationId) return undefined;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["chat-recordings", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-transcripts", conversationId] });
    };
    // Egress keeps finalizing for a few seconds after hang-up; a second pass
    // picks up a row that was not there yet on the first one.
    let timer = null;
    const refreshTwice = (payload) => {
      if (payload?.conversationId && payload.conversationId !== conversationId) return;
      refresh();
      clearTimeout(timer);
      timer = setTimeout(refresh, 6000);
    };
    const off = on?.("chat.call.ended", refreshTwice);
    return () => { off?.(); clearTimeout(timer); };
  }, [on, qc, conversationId, enabled]);

  const previousCallIdRef = useRef(activeCallId);
  useEffect(() => {
    if (previousCallIdRef.current === activeCallId) return undefined;
    previousCallIdRef.current = activeCallId;
    if (!enabled || !conversationId) return undefined;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["chat-recordings", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-transcripts", conversationId] });
    };
    refresh();
    const timer = setTimeout(refresh, 6000);
    return () => clearTimeout(timer);
  }, [activeCallId, qc, conversationId, enabled]);
}

// Independent history query, mirroring useConversationFiles.js: opening the
// "Grabaciones" view must not change chat scroll or realtime subscriptions.
// Polls while any recording is still in flight (STARTING/ACTIVE/PROCESSING)
// so a recording that finishes processing while the view is open flips to
// READY without the user needing to re-open the panel.
export function useConversationRecordings(conversationId, enabled = true) {
  const { session } = useAuth();
  useRefreshOnCallChange(conversationId, enabled);
  return useQuery({
    queryKey: ["chat-recordings", conversationId],
    enabled: Boolean(enabled && conversationId && session?.access_token),
    staleTime: 15_000,
    refetchInterval: (query) => {
      const rows = unwrap(query.state.data) ?? [];
      return rows.some((r) => ["STARTING", "ACTIVE", "PROCESSING"].includes(r.status)) ? 8000 : false;
    },
    queryFn: () => runly.calls.listRecordings(conversationId, session.access_token),
  });
}

// All recordings across the user's conversations ("Todas las grabaciones"),
// page by page. Rows carry no playback data — see useRecordingPlayback.
export function useAllRecordings() {
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ["chat-recordings", "all"],
    enabled: Boolean(session?.access_token),
    staleTime: 15_000,
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => runly.calls.listAllRecordings({ cursor: pageParam }, session.access_token),
  });
}

// Signs one recording's HLS manifest only when the user presses play.
export function fetchRecordingPlayback(recordingId, token) {
  return runly.calls.getRecordingPlayback(recordingId, token).then(unwrap);
}

// Both views (one conversation and "all") share the "chat-recordings" prefix,
// so a rename/delete in either refreshes the other.
export function useDeleteRecording() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordingId) => runly.calls.deleteRecording(recordingId, session.access_token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-recordings"] }),
  });
}

export function useRenameRecording() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordingId, title }) => runly.calls.renameRecording(recordingId, title, session.access_token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-recordings"] }),
  });
}
