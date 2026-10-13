import { useCallback, useEffect, useMemo, useState } from "react";
import { AdvancedFileViewer, BackButton, Button, EmptyState, ErrorState, SearchInput, Skeleton, cn } from "@runly/ui";
import { AudioLines, FileText, Images, Link2, Loader2, Video } from "lucide-react";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { useChatConversations, useArchivedConversations } from "../../hooks/useChatConversations";
import { useChatMedia } from "../../hooks/useChatMedia";
import { getConversationDisplayName } from "../../lib/chatUtils";
import { MediaGrid } from "./MediaGrid";
import { AudioList, DocumentList, LinkList } from "./MediaLists";
import { RecordingsTab } from "./RecordingsTab";
import { extractLinks, useLoadMoreSentinel } from "./mediaUtils";

export const MEDIA_TABS = [
  { key: "media", label: "Fotos y videos", icon: Images, empty: "Las fotos y videos que se compartan en tus chats aparecerán aquí." },
  { key: "documents", label: "Documentos", icon: FileText, empty: "Los documentos que se compartan en tus chats aparecerán aquí." },
  { key: "audio", label: "Audios", icon: AudioLines, empty: "Las notas de voz y audios de tus chats aparecerán aquí." },
  { key: "links", label: "Enlaces", icon: Link2, empty: "Los enlaces que se compartan en tus chats aparecerán aquí." },
  { key: "recordings", label: "Grabaciones", icon: Video, empty: null },
];

function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function LoadingState({ tab }) {
  if (tab === "media") {
    return (
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-xl" />)}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}

// Attachments/links tabs share one shape: paged server query + optional viewer.
function AttachmentsTab({ tab, search, nameOf, onOpenConversation }) {
  const { session } = useAuth();
  const q = useDebounced(search.trim());
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChatMedia(tab.key, q);
  const rows = useMemo(() => (data?.pages ?? []).flatMap((p) => p?.data ?? []), [data]);
  const links = useMemo(() => (tab.key === "links" ? rows.flatMap(extractLinks) : []), [tab.key, rows]);
  const loadMore = useCallback(() => fetchNextPage(), [fetchNextPage]);
  const sentinelRef = useLoadMoreSentinel({ hasMore: hasNextPage, loading: isFetchingNextPage, onReach: loadMore });

  const viewable = tab.key === "media" || tab.key === "documents";
  const viewerFiles = useMemo(() => (viewable ? rows : []).map((r) => ({
    id: r.id, mimeType: r.mimeType, originalName: r.fileName, sizeBytes: r.sizeBytes,
  })), [rows, viewable]);
  const [viewerId, setViewerId] = useState(null);
  const viewerIndex = viewerId ? viewerFiles.findIndex((f) => f.id === viewerId) : -1;
  const resolveUrl = useCallback(async (file) => {
    const res = await runly.chat.getAttachmentSignedUrl(file.id, session?.access_token);
    return res?.data?.url ?? null;
  }, [session?.access_token]);

  if (isLoading) return <LoadingState tab={tab.key} />;
  if (isError) return <ErrorState title="No se pudo cargar la multimedia" onRetry={refetch} />;
  const count = tab.key === "links" ? links.length : rows.length;
  if (!count) {
    return q
      ? <EmptyState className="py-16" icon={tab.icon} title="Sin resultados" description={`Nada en ${tab.label.toLowerCase()} coincide con «${q}».`} />
      : <EmptyState className="py-16" icon={tab.icon} title={`Aún no hay ${tab.label.toLowerCase()}`} description={tab.empty} />;
  }

  const open = (item) => setViewerId(item.id);
  return (
    <>
      {tab.key === "media" && <MediaGrid items={rows} nameOf={nameOf} onOpen={open} />}
      {tab.key === "documents" && <DocumentList items={rows} nameOf={nameOf} onOpen={open} onOpenConversation={onOpenConversation} />}
      {tab.key === "audio" && <AudioList items={rows} nameOf={nameOf} onOpenConversation={onOpenConversation} />}
      {tab.key === "links" && <LinkList items={links} nameOf={nameOf} onOpenConversation={onOpenConversation} />}
      <div ref={sentinelRef} className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...</> : "Cargar más"}
          </Button>
        </div>
      )}
      {viewable && (
        <AdvancedFileViewer
          open={viewerIndex >= 0}
          onOpenChange={(next) => { if (!next) setViewerId(null); }}
          files={viewerFiles}
          activeIndex={Math.max(0, viewerIndex)}
          onIndexChange={(i) => setViewerId(viewerFiles[i]?.id ?? null)}
          onResolveSignedUrl={resolveUrl}
          zIndex={10000}
        />
      )}
    </>
  );
}

// "Multimedia": everything shared across all of the user's chats, by type.
export function ChatMediaView({ initialTab = "media", onTabChange, onBack, onOpenConversation }) {
  const { userProfile } = useAuth();
  const [tabKey, setTabKey] = useState(MEDIA_TABS.some((t) => t.key === initialTab) ? initialTab : "media");
  const [search, setSearch] = useState("");
  const tab = MEDIA_TABS.find((t) => t.key === tabKey);

  const { data: convData } = useChatConversations();
  const { data: archivedData } = useArchivedConversations();
  const conversationsById = useMemo(() => {
    const map = new Map();
    for (const c of [...(archivedData?.data ?? []), ...(convData?.data ?? [])]) map.set(c.id, c);
    return map;
  }, [convData, archivedData]);
  const nameOf = useCallback((conversationId) => {
    const conv = conversationsById.get(conversationId);
    if (!conv) return "Conversación";
    const name = getConversationDisplayName(conv, userProfile?.id);
    return conv.type === "channel" ? `#${name}` : name;
  }, [conversationsById, userProfile?.id]);

  function selectTab(key) {
    setTabKey(key);
    setSearch("");
    onTabChange?.(key);
  }

  return (
    <div className="chat-glass flex h-full min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] px-3 md:px-5">
        {onBack && <BackButton onClick={onBack} className="md:hidden" />}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--brand-primary)/12 text-(--brand-primary)">
          <Images className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-tight">Multimedia</h2>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Lo compartido en todos tus chats</p>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2 border-b border-[hsl(var(--border))] px-3 py-2.5 md:flex-row md:items-center md:px-5">
        <div className="-mx-3 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] md:mx-0 md:px-0" role="tablist" aria-label="Tipo de multimedia">
          {MEDIA_TABS.map(({ key, label, icon: Icon }) => {
            const active = key === tabKey;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(key)}
                className={cn(
                  "flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-(--brand-primary) text-(--brand-primary-foreground) shadow-sm"
                    : "bg-[hsl(var(--muted))]/60 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          placeholder={tabKey === "links" ? "Buscar enlaces..." : tabKey === "recordings" ? "Buscar grabaciones..." : "Buscar por nombre..."}
          className="w-full md:w-64 md:shrink-0"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-3 py-4 md:px-5">
          {tabKey === "recordings" ? (
            <RecordingsTab search={search} nameOf={nameOf} onOpenConversation={onOpenConversation} />
          ) : (
            <AttachmentsTab key={tabKey} tab={tab} search={search} nameOf={nameOf} onOpenConversation={onOpenConversation} />
          )}
        </div>
      </div>
    </div>
  );
}
