import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";

// Chat channels linked to a project. A project can own several channels;
// the API returns the ones the caller can see plus which one is primary.
export function useProjectChannels({ projectId, projectName, token }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["project-linked-channel", projectId],
    queryFn: async () => {
      const res = await runly.chat.getLinkedChannel("runly.projects", projectId, token);
      return { channels: res?.channels ?? (res?.data ? [res.data] : []), primaryId: res?.primaryId ?? res?.data?.id ?? null };
    },
    enabled: Boolean(projectId && token),
    staleTime: 30_000,
  });

  function openChannel(conversationId) {
    navigate(`/app/m/runly.chat/chat/inbox/${conversationId}`);
  }

  // First channel of a project: named after the project and seeded with its members.
  const createDefault = useMutation({
    mutationFn: async () => {
      // GET /projects/:id/members returns a raw array, not { data: [...] }.
      const membersRes = await runly.projects.listMembers(projectId, token);
      const memberUserIds = (membersRes?.data ?? membersRes ?? []).map((m) => m.userId).filter(Boolean);
      return runly.chat.createChannel(
        { title: projectName ?? "Proyecto", linkedModule: "runly.projects", linkedEntityId: projectId, memberUserIds },
        token,
      );
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["project-linked-channel", projectId] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      if (res?.data?.id) openChannel(res.data.id);
    },
    onError: () => toast.error("No se pudo crear el canal."),
  });

  const channels = query.data?.channels ?? [];
  const primaryId = query.data?.primaryId ?? null;
  return {
    channels,
    primaryId,
    isLoading: query.isLoading,
    openChannel,
    createDefault: () => createDefault.mutate(),
    creating: createDefault.isPending,
  };
}
