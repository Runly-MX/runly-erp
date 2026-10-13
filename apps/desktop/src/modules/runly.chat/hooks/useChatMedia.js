import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

// Cross-chat "Multimedia" listing, page by page (type: media | documents |
// audio | links). Rows carry metadata only; see useMediaSignedUrl.
export function useChatMedia(type, q = "", enabled = true) {
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: ["chat-media", type, q],
    enabled: Boolean(enabled && session?.access_token),
    staleTime: 30_000,
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    queryFn: ({ pageParam }) => runly.chat.listMedia({ type, cursor: pageParam, q }, session.access_token),
  });
}

// Signed URL for one attachment, fetched only once its tile is visible
// (`enabled`). "card" is the small preview; "full" the original.
export function useMediaSignedUrl(attachmentId, variant = "card", enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["chat-attachment-url", attachmentId, variant],
    enabled: Boolean(enabled && attachmentId && session?.access_token),
    staleTime: 40 * 60 * 1000,
    queryFn: async () => {
      const res = await runly.chat.getAttachmentSignedUrl(attachmentId, session.access_token, { variant });
      return res?.data?.url ?? null;
    },
  });
}
