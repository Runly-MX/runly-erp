// apps/desktop/src/modules/runly.chat/components/ThreadPanel.jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, useIsMobile } from "@runly/ui";
import { MessageSquare } from "lucide-react";
import { useThreadReplies, useSendThreadReply } from "../hooks/useThreadReplies";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { MessageComposer } from "./MessageComposer";
import { ChatAttachmentViewer } from "./ChatAttachmentViewer";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { buildAllAttachments } from "../lib/chatUtils";
import { useChatConversations } from "../hooks/useChatConversations";
import { useChatPreferences, chatPreferencesStyle, wallpaperLayerProps } from "../hooks/useChatPreferences";
import { useAuth } from "../../../auth/AuthProvider";
import "../chat-theme.css";

export function ThreadPanel({ open, onOpenChange, rootMessageId, conversationId, conversationType, members, onToggleReaction }) {
  const { userProfile } = useAuth();
  const currentUserId = userProfile?.id;
  // The Sheet portals to <body>, outside the ChatScreen's .chat-glass-theme
  // subtree, so it never inherited the per-user accent/zoom overrides
  // (chatPreferencesStyle) — re-apply them here so the thread respects the
  // same colours, font scale and wallpaper as the main conversation.
  const { prefs } = useChatPreferences();
  // Same masked, tinted wallpaper the main message list uses (see
  // chat-theme.css) — a `z-index:-1` layer behind the whole panel, painted
  // only when the pref is on. `SheetContent` is `position: fixed`, so it
  // already establishes the stacking context the negative z-index needs.
  const wallpaperLayer = prefs.wallpaper ? (
    <div {...wallpaperLayerProps(prefs)} />
  ) : null;
  // Sheet.jsx forces side="right" to a bottom sheet below the mobile
  // breakpoint. That variant is auto-height-up-to-85dvh with the SHEET ITSELF
  // owning the scroll, not a fixed-height flex column — so the inner
  // `flex-1 min-h-0 overflow-y-auto` message region below (sized correctly
  // on desktop's h-full side="right" sheet) had nothing to flex against,
  // collapsing to its min-content size and shrinking the whole thread area.
  // Giving the panel an explicit height (only on mobile, where it matters)
  // restores the fixed-height-flex-column model the inner layout assumes.
  const isMobile = useIsMobile();

  const { data, isLoading } = useThreadReplies(open ? rootMessageId : null);
  const { mutateAsync: sendReply } = useSendThreadReply(rootMessageId, conversationId);
  const { data: convsData } = useChatConversations();
  const conversations = convsData?.data ?? [];

  const [replyingTo, setReplyingTo] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [viewer, setViewer] = useState({ open: false, activeIndex: 0 });

  // Clear any pending quote when the panel closes or retargets to another root.
  useEffect(() => { setReplyingTo(null); }, [rootMessageId, open]);

  const root = data?.data?.root;
  // Deleted replies disappear entirely (no "Mensaje eliminado" tombstone).
  const replies = (data?.data?.replies ?? []).filter((r) => !r.deleted_at);

  // Every file shared in this thread (root + replies) so the in-panel viewer
  // can page through all of them, same as the main chat window.
  const allAttachments = useMemo(
    () => buildAllAttachments(root ? [root, ...replies] : replies),
    [root, replies],
  );

  const handleAttachmentClick = useCallback((attachments, activeIndex) => {
    const clickedId = attachments?.[activeIndex]?.id;
    const globalIdx = allAttachments.findIndex((f) => f.id === clickedId);
    setViewer({ open: true, activeIndex: globalIdx >= 0 ? globalIdx : 0 });
  }, [allAttachments]);

  const handleSend = async (payload) => {
    await sendReply(payload);
    setReplyingTo(null);
  };

  // Same interaction surface as ChatMessageList gives a bubble in the main
  // window — reply / copy / forward / react / open attachments / long-press —
  // so the thread isn't a stripped-down second-class view.
  const bubbleActionProps = (m) => {
    const actionable = Boolean(m?.body) && !m?.deleted_at;
    return {
      currentUserId,
      members,
      conversationType,
      onAttachmentClick: handleAttachmentClick,
      onToggleReaction,
      onReply: (msg) => setReplyingTo(msg),
      onForward: actionable ? () => setForwardMessage(m) : undefined,
      onCopy: actionable
        ? () => navigator.clipboard.writeText(m.body).catch(() => {})
        : undefined,
      isThreadReplyView: true,
    };
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={[
            // Solid, forced (see MessageComposer.jsx for the same `!`
            // pattern) fill in the exact token the message area's own
            // .chat-wallpaper paints (bg-[hsl(var(--background))]).
            // An earlier version used the translucent .chat-glass here, which
            // overrides the generic dialog `glass-strong` wash but reads
            // two-toned: the base Sheet's own `gap-4` leaves the translucent
            // glass visible in the seams BETWEEN the header / message-list /
            // composer rows, each of which paints its own opaque background —
            // so header and gaps read as one shade, the message list and
            // composer as another. Matching all of it to one flat, opaque
            // colour removes the seam instead of trying to blend two
            // different surface treatments.
            // px-0 (not p-0): let the shared bottom-sheet `pt-9` through so
            // the drag handle has its reserved space on the mobile variant.
            "chat-glass-theme chat-wallpaper isolate bg-[hsl(var(--background))]! w-full sm:max-w-lg lg:max-w-xl flex flex-col px-0 pb-0",
            isMobile ? "h-[85dvh]" : "",
          ].join(" ")}
          // paddingBottom: 0 cancels the Sheet's own blanket bottom-sheet
          // inset (bottom-sheet-shared.jsx forces ~1.5rem+safe-area via
          // inline style, so it can't be dropped via className p-0) — it's
          // pure dead space here because the composer already adds its own
          // safe-area gap via `edgeInset` below. Without this the panel had
          // ~24px of empty space under an already-inset composer.
          style={{ ...chatPreferencesStyle(prefs), paddingBottom: 0 }}
        >
          {wallpaperLayer}
          <SheetHeader className="px-4 pt-1">
            <SheetTitle className="chat-font-display flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[var(--brand-primary)]" />
              Hilo
            </SheetTitle>
          </SheetHeader>

          <div
            className={["chat-scale-target", "flex-1 min-h-0 overflow-y-auto px-2 py-2"].join(" ")}
          >
            {isLoading && (
              <div className="space-y-2 px-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            )}

            {!isLoading && root && (
              <>
                <ChatMessageBubble
                  message={root}
                  isOwn={root.sender_user_id === currentUserId}
                  isFirst
                  isLast
                  {...bubbleActionProps(root)}
                />
                <div className="border-b border-[hsl(var(--border))] my-2 mx-2" />

                {!replies.length && (
                  <p className="text-center text-xs text-[hsl(var(--muted-foreground))] py-6">
                    Se el primero en responder.
                  </p>
                )}

                {replies.map((reply, i) => (
                  <ChatMessageBubble
                    key={reply.id}
                    message={reply}
                    isOwn={reply.sender_user_id === currentUserId}
                    isFirst={i === 0 || replies[i - 1]?.sender_user_id !== reply.sender_user_id}
                    isLast={i === replies.length - 1 || replies[i + 1]?.sender_user_id !== reply.sender_user_id}
                    {...bubbleActionProps(reply)}
                  />
                ))}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-[hsl(var(--border))]">
            <MessageComposer
              onSend={handleSend}
              placeholder="Responder en el hilo..."
              compact
              edgeInset
              conversationId={conversationId}
              conversationType={conversationType}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ChatAttachmentViewer
        open={viewer.open}
        onOpenChange={(o) => setViewer((v) => ({ ...v, open: o }))}
        attachments={allAttachments}
        activeIndex={viewer.activeIndex}
        onIndexChange={(i) => setViewer((v) => ({ ...v, activeIndex: i }))}
      />

      <ForwardMessageModal
        open={Boolean(forwardMessage)}
        onClose={() => setForwardMessage(null)}
        message={forwardMessage}
        conversations={conversations}
      />
    </>
  );
}
