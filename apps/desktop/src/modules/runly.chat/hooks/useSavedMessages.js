import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

const KEY = ["chat-saved"];

// Saved messages and reminders of the person. Spec
// docs/superpowers/specs/2026-10-26-saved-and-reminders-design.md.
export function useSavedMessages(enabled = true) {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: KEY,
    queryFn: () => runly.chat.listSaved(token).then((res) => res?.data ?? []),
    enabled: Boolean(token && enabled),
    staleTime: 60_000,
  });
}

export function useSavedActions() {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const onError = (error) => toast.error("No se pudo completar la acción", { description: error?.message });
  return {
    save: useMutation({ mutationFn: ({ messageId, remindAt }) => runly.chat.saveMessage(messageId, { remindAt: remindAt ?? undefined }, token), onSuccess: refresh, onError }),
    update: useMutation({ mutationFn: ({ messageId, ...data }) => runly.chat.updateSavedMessage(messageId, data, token), onSuccess: refresh, onError }),
    remove: useMutation({ mutationFn: (messageId) => runly.chat.unsaveMessage(messageId, token), onSuccess: refresh, onError }),
  };
}
