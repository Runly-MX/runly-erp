import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

export function useChannelIntegrations(conversationId, enabled = true) {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ["chat-channel-integrations", conversationId],
    queryFn: () => runly.chat.listChannelIntegrations(conversationId, token),
    enabled: Boolean(token && conversationId && enabled),
    staleTime: 15_000,
  });
}

export function useChannelIntegrationActions(conversationId) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["chat-channel-integrations", conversationId] });
  const onError = (error) => toast.error("No se pudo completar la acción", { description: error?.message });
  return {
    create: useMutation({ mutationFn: (data) => runly.chat.createChannelIntegration(conversationId, data, token), onSuccess: refresh, onError }),
    update: useMutation({ mutationFn: ({ id, ...data }) => runly.chat.updateChannelIntegration(conversationId, id, data, token), onSuccess: refresh, onError }),
    rotate: useMutation({ mutationFn: (id) => runly.chat.rotateChannelIntegration(conversationId, id, token), onSuccess: refresh, onError }),
    remove: useMutation({ mutationFn: (id) => runly.chat.deleteChannelIntegration(conversationId, id, token), onSuccess: refresh, onError }),
  };
}
