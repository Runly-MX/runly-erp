// apps/desktop/src/modules/runly.chat/components/ConversationMediaTab.jsx
import { useState, useMemo } from "react";
import { ChatFilesGallery } from "./ChatFilesGallery";
import { ChatAttachmentViewer } from "./ChatAttachmentViewer";
import { useConversationFiles } from "../hooks/useConversationFiles";
import { ErrorState } from "@runly/ui";
import { isAudioAttachment, isMediaMime } from "../lib/chatUtils";

const PREVIEW_LIMIT = 6;

// Receives messages as a prop rather than calling useChatMessages itself —
// the parent (ChatWindow/MiniChatWindow) already has this data from its own
// single useChatMessages call. Calling the hook a second time here would
// open a second Supabase Realtime subscription for the same conversationId,
// and subscribeToMessages() defensively tears down any existing channel
// with the same topic before subscribing — silently killing the main
// message list's live updates the moment this tab mounts.
export function ConversationMediaTab({ conversationId, messages: loadedMessages, isLoading: loadingMessages, preview = false, onShowAll }) {
  const history = useConversationFiles(conversationId);
  const messages = history.data ?? loadedMessages;
  const isLoading = history.isLoading || loadingMessages;
  const [viewer, setViewer] = useState({ open: false, attachments: [], activeIndex: 0 });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Same lookup ChatFilesGallery builds internally (including file-type
  // entity refs, per that component's own allAttachments), needed here too
  // so "Descargar" can resolve each selected id back to its url/fileName,
  // and so the "Mostrar mas" gate below can tell whether ChatFilesGallery's
  // previewLimit is actually truncating anything.
  const allAttachments = useMemo(() => {
    if (!messages?.length) return [];
    const result = [];
    for (const msg of messages) {
      for (const att of (msg.attachments ?? [])) result.push(att);
      for (const ref of (msg.metadata?.entityRefs ?? [])) {
        if (ref.entityType !== "file") continue;
        result.push({ id: ref.recordId, mimeType: ref.mimeType, fileName: ref.title, url: null });
      }
    }
    return result;
  }, [messages]);

  // ChatFilesGallery caps media (images+videos) and non-media files
  // INDEPENDENTLY at previewLimit each (up to 2x previewLimit total on
  // screen) — gating "Mostrar mas" on the combined count alone would show it
  // even when neither category was actually truncated (e.g. 4 media + 4
  // files: 8 total, nothing cut). Check each category against the same limit
  // ChatFilesGallery itself uses instead. Videos used to count as
  // "otherFiles" here (isImageMime doesn't match video/*), so the button
  // only ever appeared once non-media files like PDFs pushed that bucket
  // over the limit — a chat with 8 videos and no docs never showed it.
  const hasMoreToShow = useMemo(() => {
    let audios = 0;
    let media = 0;
    let otherFiles = 0;
    for (const att of allAttachments) {
      if (isAudioAttachment(att)) audios += 1;
      else if (isMediaMime(att.mimeType)) media += 1;
      else otherFiles += 1;
    }
    return audios > PREVIEW_LIMIT || media > PREVIEW_LIMIT || otherFiles > PREVIEW_LIMIT;
  }, [allAttachments]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancelSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  // Direct sequential downloads — no zip library, no new dependency. Staggered
  // by 150ms per file so browsers that would otherwise block a burst of
  // simultaneous downloads (Chrome's multi-download permission prompt) let
  // them through one at a time instead.
  function handleBulkDownload() {
    const targets = allAttachments.filter((a) => selectedIds.has(a.id));
    targets.forEach((att, i) => {
      setTimeout(() => {
        if (!att.url) return;
        const a = document.createElement("a");
        a.href = att.url;
        a.download = att.fileName ?? "archivo";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      }, i * 150);
    });
    cancelSelection();
  }

  return (
    <div className="flex flex-col">
      {history.isError && <ErrorState title="No se pudo completar el historial de archivos" onRetry={history.refetch} />}
      <ChatFilesGallery
        messages={messages ?? []}
        isLoading={isLoading}
        onAttachmentClick={(attachments, activeIndex) => setViewer({ open: true, attachments, activeIndex })}
        scrollable={false}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onEnterSelection={() => setSelectionMode(true)}
        onCancelSelection={cancelSelection}
        previewLimit={preview ? PREVIEW_LIMIT : undefined}
      />
      {preview && !selectionMode && hasMoreToShow && (
        <button
          type="button"
          onClick={onShowAll}
          className="mx-3 mb-3 text-xs font-medium text-[var(--brand-primary)] hover:underline text-center"
        >
          Mostrar mas
        </button>
      )}
      {selectionMode && selectedIds.size > 0 && (
        <div className="sticky bottom-0 px-4 py-2.5 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] flex items-center justify-between">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {selectedIds.size} {selectedIds.size === 1 ? "archivo" : "archivos"}
          </span>
          <button
            type="button"
            onClick={handleBulkDownload}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] hover:opacity-90 transition-opacity"
          >
            Descargar ({selectedIds.size})
          </button>
        </div>
      )}
      <ChatAttachmentViewer
        open={viewer.open}
        onOpenChange={(open) => setViewer((v) => ({ ...v, open }))}
        attachments={viewer.attachments}
        activeIndex={viewer.activeIndex}
        onIndexChange={(i) => setViewer((v) => ({ ...v, activeIndex: i }))}
      />
    </div>
  );
}
