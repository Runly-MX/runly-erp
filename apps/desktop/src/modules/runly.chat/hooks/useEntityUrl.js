import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

// Resolves the record's in-app URL on click (reusing the preview cache).
export function useEntityUrl(entityType, recordId) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const token = session?.access_token;
  return async () => {
    const data = await queryClient
      .fetchQuery({
        queryKey: ["chat-entity-preview", entityType, recordId],
        queryFn: async () => (await runly.chat.previewEntity(entityType, recordId, token))?.data ?? null,
        staleTime: 60_000,
      })
      .catch(() => null);
    return data?.url ?? null;
  };
}
