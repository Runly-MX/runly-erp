import { useMemo, useRef } from "react";
import { useIsMobile, SwipeBackStack } from "@runly/ui";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import "../chat-theme.css";
import { ChatSidebar } from "../components/ChatSidebar";
import { ChatWindow } from "../components/ChatWindow";
import { AllRecordingsView } from "../components/AllRecordingsView";
import { useChatConversations, useArchivedConversations } from "../hooks/useChatConversations";
import { useEnsureMiraiConversation } from "../hooks/useMirAI";
import { ChatPreferencesProvider, useChatPreferences, chatPreferencesStyle } from "../hooks/useChatPreferences";
import { hapticTick } from "../lib/haptics";

export function ChatScreen() {
  return (
    <ChatPreferencesProvider>
      <ChatScreenInner />
    </ChatPreferencesProvider>
  );
}

function ChatScreenInner() {
  const { "*": wildcard } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFilesView = searchParams.get("view") === "files";
  const jumpMessageId = searchParams.get("msg");

  // Extract conversation ID from /chat/inbox/<id>
  const conversationIdFromUrl = useMemo(() => {
    const match = (wildcard ?? "").match(/^chat\/inbox\/(.+)$/);
    return match ? match[1] : null;
  }, [wildcard]);

  // /chat/inbox?view=recordings — a query param, not a new sub-path, because
  // the module's navigation only authorizes /chat/inbox(/...).
  const recordingsRoute = !conversationIdFromUrl && searchParams.get("view") === "recordings";
  const mobileShowWindow = Boolean(conversationIdFromUrl) || recordingsRoute;
  const isMobile = useIsMobile();
  const stackRef = useRef(null);

  const { data, isLoading } = useChatConversations();

  // Make sure the user's MirAI conversation exists (backend also self-heals
  // in GET /chat/conversations). Fire-and-forget; the row shows up on the next
  // conversations refetch.
  useEnsureMiraiConversation();

  // MirAI always sits at the very top, above any other pinned conversation.
  const conversations = useMemo(() => {
    const list = data?.data ?? [];
    return list.slice().sort((a, b) => {
      const am = a.type === "mirai" ? 1 : 0;
      const bm = b.type === "mirai" ? 1 : 0;
      return bm - am;
    });
  }, [data]);

  // A conversation opened via URL may have just been archived (or already
  // was) — it disappears from useChatConversations' list the moment that
  // happens, per the backend's own archiveClause default. Fall back to the
  // archived list rather than letting activeConversation silently resolve
  // to null and the window go blank; only fetched when actually needed.
  const needsArchivedLookup = Boolean(
    conversationIdFromUrl && !conversations.some((c) => c.id === conversationIdFromUrl),
  );
  const { data: archivedData } = useArchivedConversations({ enabled: needsArchivedLookup });
  const archivedConversations = archivedData?.data ?? [];

  const activeConversation = useMemo(
    () =>
      conversations.find((c) => c.id === conversationIdFromUrl) ??
      archivedConversations.find((c) => c.id === conversationIdFromUrl) ??
      null,
    [conversations, archivedConversations, conversationIdFromUrl],
  );

  function handleSelect(conv, messageId) {
    const qs = messageId ? `?msg=${encodeURIComponent(messageId)}` : "";
    navigate(`/app/m/runly.chat/chat/inbox/${conv.id}${qs}`, { replace: Boolean(conversationIdFromUrl) });
  }

  function handleCreated(conv) {
    if (conv?.id) {
      navigate(`/app/m/runly.chat/chat/inbox/${conv.id}`, { replace: Boolean(conversationIdFromUrl) });
    }
  }

  function navigateToInbox() {
    navigate("/app/m/runly.chat/chat/inbox", { replace: true });
  }

  // Phones animate the conversation out (same as the edge swipe) first.
  function handleClose() {
    if (isMobile && stackRef.current) stackRef.current.back();
    else navigateToInbox();
  }

  const { prefs } = useChatPreferences();

  const sidebar = (
    <ChatSidebar
      conversations={conversations}
      isLoading={isLoading}
      activeId={activeConversation?.id}
      onSelect={handleSelect}
      onCreated={handleCreated}
      recordingsActive={recordingsRoute}
      onOpenRecordings={() => navigate("/app/m/runly.chat/chat/inbox?view=recordings", { replace: Boolean(conversationIdFromUrl) || recordingsRoute })}
    />
  );
  const chatWindow = recordingsRoute ? (
    <AllRecordingsView
      onBack={handleClose}
      onOpenConversation={(id) => navigate(`/app/m/runly.chat/chat/inbox/${id}`)}
    />
  ) : (
    <ChatWindow
      conversation={activeConversation}
      onClose={handleClose}
      initialFilesView={initialFilesView}
      initialJumpMessageId={jumpMessageId}
    />
  );

  if (isMobile) {
    // Phone: list and conversation are a navigation stack with an
    // interactive edge swipe back (iOS-style) and slide transitions.
    return (
      <div className="chat-glass-theme flex h-full min-h-0 overflow-hidden" style={chatPreferencesStyle(prefs)}>
        <SwipeBackStack
          ref={stackRef}
          open={mobileShowWindow}
          onBack={navigateToInbox}
          onThresholdCross={hapticTick}
          base={sidebar}
          detail={chatWindow}
        />
      </div>
    );
  }

  return (
    <div className="chat-glass-theme flex h-full min-h-0 overflow-hidden" style={chatPreferencesStyle(prefs)}>
      {/* Conversation list — fixed 288px beside the conversation */}
      <div className="flex w-72 min-h-0 shrink-0 flex-col overflow-hidden">
        {sidebar}
      </div>
      {/* Chat window — fills remaining space */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {chatWindow}
      </div>
    </div>
  );
}
