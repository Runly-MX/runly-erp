import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

// Group/channel avatar editing (photo, emoji or none), shared by the profile
// hero menu. Setting one kind clears the other server-side.
export function useConversationAvatarEditor(conversationId) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: (updates) => runly.chat.updateConversation(conversationId, updates, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: () => toast.error("No se pudo actualizar la imagen."),
  });

  const upload = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("moduleKey", "runly.chat");
      formData.append("entityType", "ChatConversation");
      const uploaded = await runly.files.upload(formData, token);
      const fileId = uploaded?.data?.id ?? null;
      if (!fileId) throw new Error("upload");
      await update.mutateAsync({ avatarFileId: fileId });
    },
    onError: () => toast.error("No se pudo subir la imagen."),
  });

  return {
    uploadImage: (file) => upload.mutate(file),
    setEmoji: (emoji) => update.mutate({ avatarEmoji: emoji }),
    clear: () => update.mutate({ avatarFileId: null, avatarEmoji: null }),
    busy: upload.isPending || update.isPending,
  };
}
