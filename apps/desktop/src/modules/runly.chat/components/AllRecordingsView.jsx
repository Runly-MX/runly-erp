import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdvancedFileViewer, Button, EmptyState, ErrorState, SearchInput, Skeleton, cn } from "@runly/ui";
import { ArrowLeft, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { useChatConversations, useArchivedConversations } from "../hooks/useChatConversations";
import { fetchRecordingPlayback, useAllRecordings, useDeleteRecording, useRenameRecording } from "../hooks/useConversationRecordings";
import { getConversationDisplayName } from "../lib/chatUtils";
import { GRID_CLASS, RecordingRow, formatRecordingDateTime } from "./ChatRecordingsGallery";

// "Todas las grabaciones": every recording from every conversation the user
// belongs to, newest first. Pages load as the list scrolls; nothing video
// related is fetched until a recording is played (the manifest is signed per
// recording on demand and cached as a blob: URL while the viewer is open).
export function AllRecordingsView({ onBack, onOpenConversation }) {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useAllRecordings();
  const deleteRecording = useDeleteRecording();
  const renameRecording = useRenameRecording();
  const { data: convData } = useChatConversations();
  const { data: archivedData } = useArchivedConversations();
  const [search, setSearch] = useState("");

  const conversationsById = useMemo(() => {
    const map = new Map();
    for (const c of [...(archivedData?.data ?? []), ...(convData?.data ?? [])]) map.set(c.id, c);
    return map;
  }, [convData, archivedData]);

  const recordings = useMemo(() => (data?.pages ?? []).flatMap((p) => p?.data ?? []), [data]);
  const nameOf = useCallback((conversationId) => {
    const conv = conversationsById.get(conversationId);
    if (!conv) return "Conversación";
    const name = getConversationDisplayName(conv, userProfile?.id);
    return conv.type === "channel" ? `#${name}` : name;
  }, [conversationsById, userProfile?.id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter((r) =>
      [r.title, nameOf(r.conversationId), r.startedBy?.displayName, formatRecordingDateTime(r.startedAt)]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [recordings, search, nameOf]);

  // Auto-load the next page when the sentinel at the bottom comes into view.
  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visible.length]);

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

  let body;
  if (isLoading) {
    body = (
      <div className={cn(GRID_CLASS, "p-3")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (isError) {
    body = <div className="p-3"><ErrorState title="No se pudieron cargar las grabaciones" onRetry={refetch} /></div>;
  } else if (!recordings.length) {
    body = (
      <EmptyState
        className="flex-1"
        icon={Video}
        title="Aún no hay grabaciones"
        description="Las grabaciones de las llamadas de todos tus chats aparecerán aquí."
      />
    );
  } else {
    body = (
      <div className="p-3">
        {visible.length ? (
          <div className={GRID_CLASS}>
            {visible.map((r) => (
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
        ) : (
          <EmptyState className="py-10" title="Sin resultados" description="Ninguna grabación cargada coincide con la búsqueda." />
        )}
        <div ref={sentinelRef} className="h-px" />
        {hasNextPage && (
          <div className="flex justify-center py-4">
            <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...</> : "Cargar más"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chat-glass flex h-full min-h-0 w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] px-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            title="Volver"
            aria-label="Volver"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-sm font-semibold">Todas las grabaciones</h2>
        <div className="ml-auto w-full max-w-64">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            placeholder="Buscar grabaciones..."
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      <AdvancedFileViewer
        open={viewerIndex >= 0}
        onOpenChange={closeViewer}
        files={viewerFiles}
        activeIndex={Math.max(0, viewerIndex)}
        onIndexChange={(i) => setViewerId(viewerFiles[i]?.id ?? null)}
        onResolveSignedUrl={resolveRecordingUrl}
        zIndex={10000}
      />
    </div>
  );
}
