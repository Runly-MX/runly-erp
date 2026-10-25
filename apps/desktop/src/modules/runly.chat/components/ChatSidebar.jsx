import { useState } from "react";
import {
  Button, ConfirmDialog, EmptyState, SearchInput, Skeleton,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@runly/ui";
import { Plus, Archive, ChevronDown, ChevronRight, MessageSquarePlus, Hash, Compass, Settings, Video, Images, FolderPlus, Bell } from "lucide-react";
import { ChatConversationItem, ChatConversationRow } from "./ChatConversationItem";
import { ChatActivitySheet, useChatActivity } from "./ChatActivitySheet";
import { SidebarSectionHeader, DRAG_TYPE } from "./SidebarSectionHeader";
import { SectionDialog, MoveToSectionDialog } from "./SidebarSectionDialogs";
import { addSection, assignConversation, buildSections, deleteSection, moveSection, renameSection } from "../lib/sidebarSections";
import { uuidv7 } from "../lib/uuidv7";
import { useChatSidebar } from "../hooks/useChatSidebar";
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
  const [sectionDialog, setSectionDialog] = useState({ open: false, section: null, thenMove: null });
  const [moveTarget, setMoveTarget] = useState(null);
  const [showActivity, setShowActivity] = useState(false);
  const { data: activity } = useChatActivity(true);
  const [sectionToDelete, setSectionToDelete] = useState(null);

  const { data: archivedData, isLoading: archivedLoading } = useArchivedConversations();
  const archivedConversations = archivedData?.data ?? [];
  const handleConversationAction = useConversationActionHandler();
  const filtered = (conversations ?? [])
    .filter((c) => {
      if (!search.trim()) return true;
      const displayName = getConversationDisplayName(c, userProfile?.id) ?? "";
      return displayName.toLowerCase().includes(search.toLowerCase());
    })
    // Pinned conversations float to the top; the server already returns them
    // first, this keeps the order stable during optimistic pin/unpin.
    .slice()
    .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  const filteredArchived = archivedConversations.filter((c) => {
    if (!search.trim()) return true;
    const displayName = getConversationDisplayName(c, userProfile?.id) ?? "";
    return displayName.toLowerCase().includes(search.toLowerCase());
  });

  const { state: sidebarState, save: saveSidebar } = useChatSidebar();
  const layout = buildSections({ conversations: filtered, state: sidebarState, filter: sidebarState.filter });
  const onRowAction = (action, conversation) => (action === "move" ? setMoveTarget(conversation) : handleConversationAction(action, conversation));
  const assign = (conversationId, sectionId) => saveSidebar((current) => assignConversation(current, conversationId, sectionId));
  const saveSection = ({ name, icon }) => {
    const { section, thenMove } = sectionDialog;
    if (section) saveSidebar((current) => renameSection(current, section.id, { name, icon }));
    else {
      const id = uuidv7();
      saveSidebar((current) => {
        const added = addSection(current, { id, name, icon });
        return thenMove ? assignConversation(added, thenMove, id) : added;
      });
    }
    setSectionDialog({ open: false, section: null, thenMove: null });
  };
  const toggleSection = (section) => saveSidebar((current) => section.kind === "custom"
    ? { ...current, sections: current.sections.map((item) => (item.id === section.id ? { ...item, collapsed: !section.collapsed } : item)) }
    : { ...current, collapsed: { ...current.collapsed, [section.key]: !section.collapsed } });

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
              <DropdownMenuItem onSelect={() => setSectionDialog({ open: true, section: null, thenMove: null })}>
                <FolderPlus className="h-3.5 w-3.5 mr-2" />
                Nueva sección
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
        <div className="mt-2 flex gap-1" role="group" aria-label="Filtrar conversaciones">
          {[["all", "Todo"], ["unread", "Sin leer"], ["mentions", "Menciones"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sidebarState.filter === value}
              onClick={() => saveSidebar((current) => ({ ...current, filter: value }))}
              className={["rounded-md px-2 py-1 text-xs transition-colors [@media(pointer:coarse)]:min-h-9 [@media(pointer:coarse)]:px-3",
                sidebarState.filter === value ? "bg-[var(--brand-primary)]/15 font-medium text-[var(--brand-primary)]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"].join(" ")}
            >{label}</button>
          ))}
        </div>
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

        {!search.trim() && !isLoading && (
          <button
            type="button"
            onClick={() => setShowActivity(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:min-h-11"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[hsl(var(--muted-foreground))]" aria-hidden><Bell className="h-3.5 w-3.5" /></span>
            <span className={["min-w-0 flex-1 truncate", activity?.unread ? "font-semibold" : "text-[hsl(var(--foreground))]/80"].join(" ")}>Menciones y actividad</span>
            {activity?.unread > 0 && <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-semibold text-[var(--brand-primary-foreground)]">{activity.unread > 99 ? "99+" : activity.unread}</span>}
          </button>
        )}

        {!search.trim() && !isLoading && layout.mirai.map((conv) => (
          <ConversationRowActions key={conv.id} conversation={conv} currentUserId={userProfile?.id} onAction={handleConversationAction} swipeOpenId={openRowId} onSwipeOpen={setOpenRowId}>
            <ChatConversationItem conversation={conv} isActive={conv.id === activeId} onClick={() => onSelect(conv)} currentUserId={userProfile?.id} isOnline={false} />
          </ConversationRowActions>
        ))}

        {!search.trim() && !isLoading && layout.sections.map((section) => {
          const collapsed = section.collapsed && !(section.items.some((item) => item.id === activeId));
          return (
            <div key={section.key} className="pt-1.5">
              <SidebarSectionHeader
                label={section.label}
                icon={section.icon}
                collapsed={collapsed}
                unread={section.unread}
                mentions={section.mentions}
                count={section.items.length}
                onToggle={() => toggleSection(section)}
                onDropConversation={section.key === "starred" ? undefined : (id) => assign(id, section.kind === "custom" ? section.id : null)}
                menu={section.kind === "custom" ? {
                  onRename: () => setSectionDialog({ open: true, section: sidebarState.sections.find((item) => item.id === section.id), thenMove: null }),
                  onDelete: () => setSectionToDelete(section),
                  canMoveUp: sidebarState.sections[0]?.id !== section.id,
                  canMoveDown: sidebarState.sections[sidebarState.sections.length - 1]?.id !== section.id,
                  onMoveUp: () => saveSidebar((current) => moveSection(current, section.id, -1)),
                  onMoveDown: () => saveSidebar((current) => moveSection(current, section.id, 1)),
                } : null}
              />
              {!collapsed && (
                <div className="space-y-px">
                  {section.items.length === 0 && <p className="px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">Sin conversaciones.</p>}
                  {section.items.map((conv) => {
                    const otherMember = conv.type === "direct" ? (conv.members ?? []).find((m) => m.userId !== userProfile?.id) : null;
                    return (
                      <div key={conv.id} draggable onDragStart={(event) => { event.dataTransfer.setData(DRAG_TYPE, conv.id); event.dataTransfer.effectAllowed = "move"; }}>
                        <ConversationRowActions conversation={conv} currentUserId={userProfile?.id} onAction={onRowAction} canOrganize swipeOpenId={openRowId} onSwipeOpen={setOpenRowId}>
                          <ChatConversationRow conversation={conv} isActive={conv.id === activeId} onClick={() => onSelect(conv)} currentUserId={userProfile?.id} isOnline={otherMember ? isUserOnline(otherMember.userId) : false} />
                        </ConversationRowActions>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!search.trim() && !isLoading && conversations?.length > 0 && layout.sections.length === 0 && layout.mirai.length === 0 && (
          <EmptyState className="py-8" title="Nada por aquí" description="No hay conversaciones con este filtro." />
        )}

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

      <ChatActivitySheet
        open={showActivity}
        onOpenChange={setShowActivity}
        onOpen={(item) => { setShowActivity(false); onSelect({ id: item.conversationId }, item.messageId ?? undefined); }}
      />
      <SectionDialog open={sectionDialog.open} section={sectionDialog.section} onClose={() => setSectionDialog({ open: false, section: null, thenMove: null })} onSave={saveSection} />
      <MoveToSectionDialog
        open={Boolean(moveTarget)}
        conversationName={moveTarget ? (getConversationDisplayName(moveTarget, userProfile?.id) ?? "") : ""}
        sections={sidebarState.sections}
        current={moveTarget ? (sidebarState.assignments[moveTarget.id] ?? null) : null}
        onClose={() => setMoveTarget(null)}
        onPick={(sectionId) => { assign(moveTarget.id, sectionId); setMoveTarget(null); }}
        onCreate={() => { const id = moveTarget.id; setMoveTarget(null); setSectionDialog({ open: true, section: null, thenMove: id }); }}
      />
      <ConfirmDialog
        open={Boolean(sectionToDelete)}
        onOpenChange={(value) => { if (!value) setSectionToDelete(null); }}
        title="Eliminar sección"
        description={`«${sectionToDelete?.label ?? ""}» se elimina y sus conversaciones vuelven a su sección automática. No se borra ninguna conversación.`}
        confirmLabel="Eliminar sección"
        onConfirm={() => { saveSidebar((current) => deleteSection(current, sectionToDelete.id)); setSectionToDelete(null); }}
      />

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
