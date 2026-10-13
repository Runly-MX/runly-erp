import { useCallback, useMemo, useRef, useState } from "react";
import { AdvancedFileViewer, Button, EmptyState, ErrorState, Skeleton } from "@runly/ui";
import { Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../auth/AuthProvider";
import { fetchRecordingPlayback, useAllRecordings, useDeleteRecording, useRenameRecording } from "../../hooks/useConversationRecordings";
import { GRID_CLASS, RecordingRow, formatRecordingDateTime } from "../ChatRecordingsGallery";
import { groupByMonth, useLoadMoreSentinel } from "./mediaUtils";

// "Grabaciones" tab of the Multimedia page: every call recording from every
// conversation the user belongs to. Pages load as the list scrolls; nothing
// video-related is fetched until a recording is played (the manifest is
// signed per recording on demand and cached as a blob: URL while the viewer
// is open).
export function RecordingsTab({ search, nameOf, onOpenConversation }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useAllRecordings();
  const deleteRecording = useDeleteRecording();
  const renameRecording = useRenameRecording();

  const recordings = useMemo(() => (data?.pages ?? []).flatMap((p) => p?.data ?? []), [data]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter((r) =>
      [r.title, nameOf(r.conversationId), r.startedBy?.displayName, formatRecordingDateTime(r.startedAt)]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [recordings, search, nameOf]);

  const loadMore = useCallback(() => fetchNextPage(), [fetchNextPage]);
  const sentinelRef = useLoadMoreSentinel({ hasMore: hasNextPage, loading: isFetchingNextPage, onReach: loadMore });

  const playable = useMemo(() => visible.filter((r) => r.status === "READY"), [visible]);
  const viewerFiles = useMemo(() => playable.map((r) => ({
    id: r.id,
    mimeType: "application/vnd.apple.mpegurl",
    originalName: r.title || `Grabación ${formatRecordingDateTime(r.startedAt)}`,
    sizeBytes: r.sizeBytes,
  })), [playable]);
  const [viewerId, setViewerId] = useState(null);
  const blobUrlCacheRef = useRef(new Map());

  const resolveRecordingUrl = useCallback(async (file) => {
    const cached = blobUrlCacheRef.current.get(file.id);
    if (cached) return cached;
    try {
      const playback = await fetchRecordingPlayback(file.id, token);
      if (!playback?.playlistManifest) {
        toast.error(playback?.playlistUrlError || "No se pudo preparar la reproducción.");
        return null;
      }
      const url = URL.createObjectURL(new Blob([playback.playlistManifest], { type: "application/vnd.apple.mpegurl" }));
      blobUrlCacheRef.current.set(file.id, url);
      return url;
    } catch (err) {
      toast.error(err?.message || "No se pudo preparar la reproducción.");
      return null;
    }
  }, [token]);

  const closeViewer = useCallback((nextOpen) => {
    if (nextOpen) return;
    for (const url of blobUrlCacheRef.current.values()) URL.revokeObjectURL(url);
    blobUrlCacheRef.current.clear();
    setViewerId(null);
  }, []);
  const viewerIndex = viewerId ? viewerFiles.findIndex((f) => f.id === viewerId) : -1;

  if (isLoading) {
    return (
      <div className={GRID_CLASS}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-2 p-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
          </div>
        ))}
      </div>
    );
  }
  if (isError) return <ErrorState title="No se pudieron cargar las grabaciones" onRetry={refetch} />;
  if (!recordings.length) {
    return <EmptyState className="py-16" icon={Video} title="Aún no hay grabaciones" description="Las grabaciones de las llamadas de todos tus chats aparecerán aquí." />;
  }

  return (
    <>
      {visible.length ? (
        <div className="space-y-5">
          {groupByMonth(visible, (r) => r.startedAt).map((group) => (
            <section key={group.key}>
              <h3 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group.label}</h3>
              <div className={GRID_CLASS}>
                {group.items.map((r) => (
                  <RecordingRow
                    key={r.id}
                    recording={r}
                    deleteRecording={deleteRecording}
                    renameRecording={renameRecording}
                    onPlay={(rec) => setViewerId(rec.id)}
                    conversation={{
                      name: nameOf(r.conversationId),
                      onOpen: onOpenConversation ? () => onOpenConversation(r.conversationId) : null,
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState className="py-12" title="Sin resultados" description="Ninguna grabación cargada coincide con la búsqueda." />
      )}
      <div ref={sentinelRef} className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...</> : "Cargar más"}
          </Button>
        </div>
      )}
      <AdvancedFileViewer
        open={viewerIndex >= 0}
        onOpenChange={closeViewer}
        files={viewerFiles}
        activeIndex={Math.max(0, viewerIndex)}
        onIndexChange={(i) => setViewerId(viewerFiles[i]?.id ?? null)}
        onResolveSignedUrl={resolveRecordingUrl}
        zIndex={10000}
      />
    </>
  );
}
