import { useState } from "react";
import {
  Button, EmptyState, SearchInput, Skeleton,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@runly/ui";
import { Plus, Archive, ChevronDown, ChevronRight, MessageSquarePlus, Hash, Compass, Settings, Video, Images } from "lucide-react";
import { ChatConversationItem } from "./ChatConversationItem";
import { ConversationRowActions } from "./ConversationRowActions";
import { MessageSearchResults } from "./MessageSearchResults";
import { useChatMessageSearch } from "../hooks/useChatMessageSearch";
import { CreateChatModal } from "./CreateChatModal";
import { CreateChannelModal } from "./CreateChannelModal";
import { ChannelDirectorySheet } from "./ChannelDirectorySheet";
import { ChatSettingsDialog } from "./ChatSettingsDialog";
import { NewMeetingDialog } from "./NewMeetingDialog";
import { AvatarCircle } from "./AvatarCircle";
import { getConversationDisplayName } from "../lib/chatUtils";
import { useAuth } from "../../../auth/AuthProvider";
import { useGlobalPresence } from "../../../providers/RealtimeProvider";
import { useArchivedConversations, useConversationActionHandler } from "../hooks/useChatConversations";

export function ChatSidebar({ conversations, isLoading, activeId, onSelect, onCreated, mediaActive = false, onOpenMedia }) {
  const { userProfile } = useAuth();
  const { isUserOnline } = useGlobalPresence();
  const [search, setSearch] = useState("");
  const [openRowId, setOpenRowId] = useState(null);
  const {
    hits: messageHits,
    isSearching: messageSearching,
    isError: messageSearchError,
    truncated: messageSearchTruncated,
    hasQuery: hasMessageQuery,
  } = useChatMessageSearch({ q: search });
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data: archivedData, isLoading: archivedLoading } = useArchivedConversations();
  const archivedConversations = archivedData?.data ?? [];
  const handleConversationAction = useConversationActionHandler();

  const filtered = (conversations ?? [])
    .filter((c) => {
      if (!search.trim()) return true;
      const displayName =
        c.title ??
        (c.members ?? []).find((m) => m.userId !== userProfile?.id)?.displayName ??
        "";
      return displayName.toLowerCase().includes(search.toLowerCase());
    })
    // Pinned conversations float to the top; the server already returns them
    // first, this keeps the order stable during optimistic pin/unpin.
    .slice()
    .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  const filteredArchived = archivedConversations.filter((c) => {
    if (!search.trim()) return true;
    const displayName =
      c.title ??
      (c.members ?? []).find((m) => m.userId !== userProfile?.id)?.displayName ??
      "";
    return displayName.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <aside className="chat-glass flex flex-col w-full h-full border-r border-[hsl(var(--border))]">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-[hsl(var(--border))] shrink-0">
        <h2 className="text-sm font-semibold">Chat</h2>
        <div className="flex items-center gap-1">
          {onOpenMedia && (
            <Button
              size="icon"
              variant="ghost"
              className={["h-9 w-9 md:h-7 md:w-7", mediaActive ? "bg-(--brand-primary)/10 text-(--brand-primary)" : ""].join(" ")}
              title="Multimedia de todos los chats"
              aria-label="Multimedia"
              aria-pressed={mediaActive}
              onClick={onOpenMedia}
            >
              <Images className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 md:h-7 md:w-7"
            title="Configuracion del chat"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 md:h-7 md:w-7" title="Nueva conversacion o canal">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setShowCreate(true)}>
                <MessageSquarePlus className="h-3.5 w-3.5 mr-2" />
                Nueva conversacion
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowCreateChannel(true)}>
                <Hash className="h-3.5 w-3.5 mr-2" />
                Crear canal
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowDirectory(true)}>
                <Compass className="h-3.5 w-3.5 mr-2" />
                Explorar canales
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowMeeting(true)}>
                <Video className="h-3.5 w-3.5 mr-2" />
                Nueva reunion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ChatSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
      <NewMeetingDialog open={showMeeting} onOpenChange={setShowMeeting} defaultConversationId={activeId ?? null} />

      {/* Search */}
      <div className="px-3 py-2 border-b border-[hsl(var(--border))] shrink-0">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Buscar conversaciones..."
        />
      </div>

      {/* Conversation list */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5"
        onScroll={() => openRowId && setOpenRowId(null)}
      >
        {isLoading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !filtered.length && !search && (
          <EmptyState
            className="py-8"
            title="Sin conversaciones"
            description="Inicia un nuevo chat con el botón +"
          />
        )}

        {!isLoading && !filtered.length && search && !hasMessageQuery && (
          <EmptyState
            className="py-8"
            title="Sin resultados"
            description="No se encontraron conversaciones."
          />
        )}

        {search.trim() && filtered.length > 0 && (
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain py-2">
            {filtered.map((conv) => {
              const other = (conv.members ?? []).find((m) => m.userId !== userProfile?.id);
              const name = getConversationDisplayName(conv, userProfile?.id);
              return (
                <button
                  key={conv.id}
                  type="button"
                  title={name}
                  aria-label={`Abrir ${name}`}
                  onClick={() => onSelect(conv)}
                  className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl p-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <AvatarCircle
                    name={name}
                    avatarUrl={conv.avatarUrl ?? (conv.type === "direct" ? other?.avatarUrl : null)}
                    avatarEmoji={conv.avatar_emoji}
                    type={conv.type}
                    online={conv.type === "direct" && isUserOnline(other?.userId)}
                  />
                  <span className="w-full truncate text-center text-xs">
                    {conv.type === "direct" ? name.split(" ")[0] : name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!search.trim() && filtered.map((conv) => {
          const otherMember = conv.type === "direct"
            ? (conv.members ?? []).find((m) => m.userId !== userProfile?.id)
            : null;
          return (
            <ConversationRowActions
              key={conv.id}
              conversation={conv}
              currentUserId={userProfile?.id}
              onAction={handleConversationAction}
              swipeOpenId={openRowId}
              onSwipeOpen={setOpenRowId}
            >
              <ChatConversationItem
                conversation={conv}
                isActive={conv.id === activeId}
                onClick={() => onSelect(conv)}
                currentUserId={userProfile?.id}
                isOnline={otherMember ? isUserOnline(otherMember.userId) : false}
              />
            </ConversationRowActions>
          );
        })}

        {/* Archived section */}
        {filteredArchived.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors touch-manipulation"
            >
              {showArchived ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <Archive className="h-3.5 w-3.5 shrink-0" />
              Archivados
              {archivedConversations.length > 0 && (
                <span className="ml-auto text-[10px] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded-full">
                  {archivedConversations.length}
                </span>
              )}
            </button>

            {showArchived && (
              <div className="mt-1 space-y-0.5">
                {archivedLoading && (
                  <div className="space-y-2 p-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3 px-2">
                        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-2.5 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!archivedLoading && filteredArchived.length === 0 && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))] px-4 py-2">
                    Sin conversaciones archivadas.
                  </p>
                )}
                {filteredArchived.map((conv) => {
                  const otherMember = conv.type === "direct"
                    ? (conv.members ?? []).find((m) => m.userId !== userProfile?.id)
                    : null;
                  const archivedConv = { ...conv, is_archived: true };
                  return (
                    <ConversationRowActions
                      key={conv.id}
                      conversation={archivedConv}
                      currentUserId={userProfile?.id}
                      onAction={handleConversationAction}
                      swipeOpenId={openRowId}
                      onSwipeOpen={setOpenRowId}
                    >
                      <ChatConversationItem
                        conversation={archivedConv}
                        isActive={conv.id === activeId}
                        onClick={() => onSelect(archivedConv)}
                        currentUserId={userProfile?.id}
                        isOnline={otherMember ? isUserOnline(otherMember.userId) : false}
                      />
                    </ConversationRowActions>
                  );
                })}
              </div>
            )}
          </div>
        )}
      {hasMessageQuery && (
        <div className="border-t border-border pb-2">
          <MessageSearchResults
            hits={messageHits}
            isSearching={messageSearching}
            isError={messageSearchError}
            truncated={messageSearchTruncated}
            onOpen={(hit) => onSelect({ id: hit.conversationId }, hit.messageId)}
          />
        </div>
      )}
      </div>

      <CreateChatModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(conv) => {
          setShowCreate(false);
          onCreated?.(conv);
        }}
      />

      <CreateChannelModal
        open={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
        onCreated={(conv) => {
          setShowCreateChannel(false);
          onCreated?.(conv);
        }}
      />

      <ChannelDirectorySheet
        open={showDirectory}
        onOpenChange={setShowDirectory}
        onJoined={(conv) => {
          setShowDirectory(false);
          onCreated?.(conv);
        }}
      />
    </aside>
  );
}
