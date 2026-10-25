import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { DEFAULT_SIDEBAR } from "../lib/sidebarSections";

const KEY = ["chat-sidebar"];

// The person's sidebar organization. `save(updater)` applies the change right away and
// persists it.
export function useChatSidebar() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => runly.chat.getSidebar(token).then((res) => ({ ...DEFAULT_SIDEBAR, ...(res?.data ?? {}) })),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
  const mutation = useMutation({
    mutationFn: (state) => runly.chat.saveSidebar(state, token),
    onError: (error) => { toast.error("No se pudo guardar la organización del chat", { description: error?.message }); queryClient.invalidateQueries({ queryKey: KEY }); },
  });
  const save = useCallback((updater) => {
    // The cache always holds the latest local state, so quick successive changes build on each other.
    const next = typeof updater === "function" ? updater(queryClient.getQueryData(KEY) ?? DEFAULT_SIDEBAR) : updater;
    // A slow initial load must not land on top of this change.
    queryClient.cancelQueries({ queryKey: KEY });
    queryClient.setQueryData(KEY, next);
    mutation.mutate(next);
  }, [mutation, queryClient]);
  return { state: query.data ?? DEFAULT_SIDEBAR, isLoading: query.isLoading, save };
}
