import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

function unwrap(r) { return r?.data ?? r; }

// Independent history query, mirroring useConversationFiles.js: opening the
// "Grabaciones" view must not change chat scroll or realtime subscriptions.
// Polls while any recording is still in flight (STARTING/ACTIVE/PROCESSING)
// so a recording that finishes processing while the view is open flips to
// READY without the user needing to re-open the panel.
export function useConversationRecordings(conversationId, enabled = true) {
  const { session } = useAuth();
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
