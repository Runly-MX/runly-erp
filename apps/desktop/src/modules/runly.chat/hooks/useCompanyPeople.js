import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { useGlobalPresence } from "../../../providers/RealtimeProvider";
import { runly } from "../../../lib/runly";

// Everyone in the active company you can chat with (same query as
// CreateChatModal's picker, so both share one request), online people first.
export function useCompanyPeople() {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const { isUserOnline } = useGlobalPresence();
  const { data, isLoading } = useQuery({
    queryKey: ["users-for-chat-picker"],
    queryFn: () => runly.identity.listCandidates(token, { pageSize: 100, action: "chat" }),
    enabled: Boolean(token),
    staleTime: 120_000,
  });

  const people = useMemo(() => (data?.data ?? [])
    .filter((user) => user.id !== userProfile?.id)
    .map((user) => ({ ...user, online: isUserOnline(user.id) }))
    .sort((a, b) => Number(b.online) - Number(a.online)
      || (a.displayName ?? "").localeCompare(b.displayName ?? "", "es")),
  [data, userProfile?.id, isUserOnline]);

  return { people, onlineCount: people.filter((p) => p.online).length, isLoading };
}

// Opens the 1:1 chat with someone: the API returns the existing direct
// conversation when there is one, so this never creates a duplicate.
export function useStartDirectChat(onOpened) {
  const { session } = useAuth();
  const [startingId, setStartingId] = useState(null);
  const start = useCallback(async (user) => {
    if (!user?.id || startingId) return;
    setStartingId(user.id);
    try {
      const result = await runly.chat.createConversation({ type: "direct", memberUserIds: [user.id] }, session?.access_token);
      onOpened?.(result?.data ?? result);
    } catch (error) {
      toast.error(error?.message ?? "No se pudo abrir el chat.");
    } finally {
      setStartingId(null);
    }
  }, [onOpened, session?.access_token, startingId]);
  return { start, startingId };
}
