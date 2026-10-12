import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, X } from "lucide-react";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// WhatsApp-style preview of the first link while composing, above the input.
// The X drops the preview for that link (the message is then sent with
// metadata.linkPreview = false). Shares the query cache with LinkPreviewCard,
// so the sent bubble shows the same card instantly.
export function ComposerLinkPreview({ url, onDismiss }) {
  const { session } = useAuth();
  const settledUrl = useDebounced(url, 400);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [settledUrl]);
  const { data: preview, isFetching } = useQuery({
    queryKey: ["chat-link-preview", settledUrl],
    queryFn: async () => (await runly.chat.linkPreview(settledUrl, session?.access_token))?.data ?? null,
    enabled: Boolean(settledUrl && settledUrl === url && session?.access_token),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: false,
  });

  const loading = !preview && (isFetching || settledUrl !== url);
  if (!url || (!preview && !loading)) return null;

  return (
    <div className="mb-2 flex items-stretch overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
      <span className="w-1 shrink-0 bg-(--brand-primary)" aria-hidden />
      {loading ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">
          <Link2 className="h-4 w-4 shrink-0 animate-pulse" aria-hidden />
          <span className="truncate">Cargando vista previa…</span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
          {preview.image && !imageFailed && (
            <img
              src={preview.image}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            {preview.title && <p className="truncate text-[13px] font-semibold leading-snug">{preview.title}</p>}
            {preview.description && (
              <p className="line-clamp-2 text-xs leading-snug text-[hsl(var(--muted-foreground))]">{preview.description}</p>
            )}
            <p className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">{preview.siteName || url}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Quitar vista previa del enlace"
        title="Quitar vista previa"
        className="flex w-10 shrink-0 items-center justify-center text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/5 hover:text-[hsl(var(--foreground))] dark:hover:bg-white/10 touch-manipulation"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
