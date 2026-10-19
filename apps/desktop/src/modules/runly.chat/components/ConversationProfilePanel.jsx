// apps/desktop/src/modules/runly.chat/components/ConversationProfilePanel.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, FolderOpen, Users, Bell, Settings, Shield, AlertTriangle, CalendarDays, Mail, Phone, ChevronDown, Sparkles } from "lucide-react";
import {
  AdvancedFileViewer, AssistantWordmark, BackButton, Tabs, TabsList, TabsTrigger, TabsContent,
  Accordion, AccordionItem, AccordionTrigger, AccordionContent, cn,
} from "@runly/ui";
import { ChannelGeneralTab } from "./ChannelGeneralTab";
import { ChannelMembersTab } from "./ChannelMembersTab";
import { ChannelRolesTab } from "./ChannelRolesTab";
import { ChannelDangerZoneTab } from "./ChannelDangerZoneTab";
import { ConversationInfoTab } from "./ConversationInfoTab";
import { ConversationMediaTab } from "./ConversationMediaTab";
import { ChannelEventsTab } from "./ChannelEventsTab";
import { GroupsInCommonTab } from "./GroupsInCommonTab";
import { NotificationsTab } from "./NotificationsTab";
import { AvatarFace, ProfileAvatar } from "./profile/ProfileAvatar";
import { ProfileCallActions } from "./profile/ProfileCallActions";
import { useChatConversationDetail } from "../hooks/useChatConversationDetail";
import { roleHasPermission, findOwnMember, CHAT_PERMISSIONS } from "../lib/chatPermissions";
import { getConversationDisplayName } from "../lib/chatUtils";
import { MIRAI_EXAMPLE_PROMPTS, MIRAI_NAME, MIRAI_SUBTITLE } from "../lib/mirai";
import { useGlobalPresence } from "../../../providers/RealtimeProvider";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";

// Same height as ChatHeader (h-16), so the panel's top line continues the
// chat header's bottom border once the hero has collapsed.
const BAR = "h-16";

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-5 pb-2">
      <Icon className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
    </div>
  );
}

// Conversation profile, swapped into ChatWindow/MiniChatWindow's content slot
// (root carries flex-1/min-h-0 so it fills it like the message list).
//
// Layout: one scroll area. No header strip — the back arrow floats over the
// hero. Scrolling past the hero turns the top bar solid (same 64px as the chat
// header, so both bottom borders line up) and shows a compact avatar + name +
// short description in it; group/channel tabs then stick right under it so
// the tab content gets the whole height.
//
// `initialTab`: "members" opens group/channel on the members tab; for direct
// it scrolls a `data-section` into view. Callers remount on change
// (`key={initialTab}`). `messages`/`isLoadingMessages` come from the caller's
// own useChatMessages — never call that hook again here (it would open a
// second Realtime subscription and kill the caller's live updates).
export function ConversationProfilePanel({
  conversation,
  currentUserId,
  initialTab,
  onBack,
  messages,
  isLoadingMessages,
  onShowAllFiles,
  onOpenConversation,
  onDeleted,
  callsEnabled,
  callPending,
  onStartAudioCall,
  onStartVideoCall,
  onStartInPerson,
  onShowRecordings,
}) {
  const conversationId = conversation?.id;
  const type = conversation?.type;
  const isMirai = type === "mirai";
  const { data: convData } = useChatConversationDetail(conversationId);
  const detail = convData?.data ?? conversation;
  // is_muted only comes from the listConversations row (getConversation's
  // SELECT c.* never joins the per-member muted_at).
  const isMuted = Boolean(conversation?.is_muted);

  const { isUserOnline, getLastSeen } = useGlobalPresence();
  const displayName = isMirai ? MIRAI_NAME : getConversationDisplayName(detail ?? conversation, currentUserId);
  const otherMember = type === "direct"
    ? (detail?.members ?? conversation?.members ?? []).find((m) => m.userId !== currentUserId)
    : null;
  const heroAvatarUrl = detail?.avatarUrl ?? conversation?.avatarUrl ?? otherMember?.avatarUrl ?? null;
  const heroAvatarFileId = detail?.avatar_file_id ?? conversation?.avatar_file_id ?? otherMember?.avatarFileId ?? null;
  const heroAvatarEmoji = detail?.avatar_emoji ?? conversation?.avatar_emoji ?? null;
  const memberCount = (detail?.members ?? conversation?.members ?? []).length;
  const description = detail?.description ?? conversation?.description ?? null;

  let statusLine;
  if (isMirai) {
    statusLine = MIRAI_SUBTITLE;
  } else if (type === "direct") {
    const online = otherMember ? isUserOnline(otherMember.userId) : false;
    const lastSeen = otherMember ? getLastSeen(otherMember.userId) : null;
    statusLine = online
      ? "En linea"
      : lastSeen
        ? `Visto ${lastSeen.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
        : "Desconectado";
  } else {
    statusLine = `${memberCount} ${memberCount === 1 ? "miembro" : "miembros"}`;
  }

  const [avatarErr, setAvatarErr] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const { session } = useAuth();

  // Direct chats resolve the other member's avatar through the chat endpoint
  // (the files endpoint 404s on identity avatars); group/channel avatars are
  // company files.
  const resolveAvatarSignedUrl = useCallback(async (variant) => {
    const token = session?.access_token;
    if (!token) return null;
    if (type === "direct") {
      if (!conversationId || !otherMember?.userId) return null;
      const res = await runly.chat.getMemberAvatarSignedUrl(conversationId, otherMember.userId, token, { variant });
      return res?.data?.signedUrl ?? null;
    }
    if (!heroAvatarFileId) return null;
    const res = await runly.files.getSignedUrl(heroAvatarFileId, token, { variant });
    return res?.data?.signedUrl ?? null;
  }, [type, conversationId, otherMember?.userId, heroAvatarFileId, session?.access_token]);

  // The list embeds a 40px thumb; the 96px hero asks for the "card" variant.
  const { data: heroCrispUrl } = useQuery({
    queryKey: ["chat-hero-avatar-card", type, conversationId, heroAvatarFileId, otherMember?.userId],
    queryFn: () => resolveAvatarSignedUrl("card"),
    enabled: Boolean(heroAvatarUrl && !avatarErr && session?.access_token && !isMirai),
    staleTime: 50 * 60 * 1000,
  });
  const resolveFullAvatarUrl = useCallback(() => resolveAvatarSignedUrl("full"), [resolveAvatarSignedUrl]);
  const avatarUrl = heroAvatarUrl && !avatarErr ? (heroCrispUrl ?? heroAvatarUrl) : null;

  // ---- collapsing hero ----------------------------------------------------
  const scrollRef = useRef(null);
  const heroRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    const hero = heroRef.current;
    if (!el || !hero) return;
    // Collapse once the name has slid under the 64px bar.
    const next = el.scrollTop > hero.offsetHeight - 72;
    setCollapsed((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    if (!initialTab || !scrollRef.current) return;
    const target = scrollRef.current.querySelector(`[data-section="${initialTab}"]`);
    target?.scrollIntoView({ block: "start" });
  }, [initialTab]);

  const ownMember = findOwnMember(detail?.members ?? [], currentUserId);
  const canManageRoles = roleHasPermission(ownMember, CHAT_PERMISSIONS.ROLES_MANAGE);
  const canManageChannel = roleHasPermission(ownMember, CHAT_PERMISSIONS.CHANNEL_MANAGE);
  const isRoom = type === "group" || type === "channel";

  const topBar = (
    <div
      className={cn(
        "absolute inset-x-0 top-0 z-20 flex items-center gap-2 border-b px-3 transition-colors duration-200",
        BAR,
        collapsed
          ? "border-[hsl(var(--border))] bg-[hsl(var(--background))]/92 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <BackButton
        onClick={onBack}
        label="Volver a mensajes"
        className={cn("ml-0 md:ml-0", !collapsed && "bg-[hsl(var(--card))]/85 shadow-sm ring-1 ring-[hsl(var(--border))] backdrop-blur")}
      />
      <div
        aria-hidden={!collapsed}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
          collapsed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
        )}
      >
        <AvatarFace size="compact" url={avatarUrl} emoji={heroAvatarEmoji} name={displayName} mirai={isMirai} />
        <div className="min-w-0">
          <p className="chat-font-display truncate text-sm font-semibold leading-tight">{isMirai ? <AssistantWordmark /> : displayName}</p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{(isRoom && description) || statusLine}</p>
        </div>
      </div>
    </div>
  );

  const hero = (
    <div ref={heroRef} className="flex flex-col items-center gap-2 px-4 pb-4 pt-16 text-center">
      <ProfileAvatar
        conversationId={conversationId}
        canEdit={isRoom && canManageChannel}
        url={avatarUrl}
        emoji={heroAvatarEmoji}
        name={displayName}
        mirai={isMirai}
        onView={() => setAvatarViewerOpen(true)}
        onImageError={() => setAvatarErr(true)}
      />
      <h2 className="chat-font-display mt-1 max-w-full text-lg font-bold leading-snug wrap-anywhere line-clamp-2">
        {isMirai ? <AssistantWordmark /> : displayName}
      </h2>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{statusLine}</p>
      {isRoom && description && (
        <div className="w-full max-w-full">
          <p className={cn("whitespace-pre-wrap text-xs text-[hsl(var(--muted-foreground))]", !descExpanded && "line-clamp-2")}>{description}</p>
          {description.length > 80 && (
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="mx-auto mt-0.5 flex min-h-8 items-center gap-0.5 text-[11px] font-medium text-(--brand-primary) hover:underline"
            >
              {descExpanded ? "Ver menos" : "Ver mas"}
              <ChevronDown className={cn("h-3 w-3 transition-transform", descExpanded && "rotate-180")} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  const avatarViewer = heroAvatarUrl && !isMirai ? (
    <AdvancedFileViewer imageEditing={false}
      open={avatarViewerOpen}
      onOpenChange={setAvatarViewerOpen}
      files={[{ id: heroAvatarFileId ?? "avatar", mimeType: "image/jpeg", originalName: displayName ?? "Foto de perfil", sizeBytes: 0 }]}
      activeIndex={0}
      onIndexChange={() => {}}
      onResolveSignedUrl={resolveFullAvatarUrl}
      zIndex={10000}
    />
  ) : null;

  const callActions = callsEnabled && !isMirai ? (
    <ProfileCallActions
      disabled={callPending}
      onStartAudioCall={onStartAudioCall}
      onStartVideoCall={onStartVideoCall}
      onStartInPerson={onStartInPerson}
      onShowRecordings={onShowRecordings}
    />
  ) : null;

  const media = (
    <div data-section="media">
      <SectionHeader icon={FolderOpen} label="Multimedia" />
      <ConversationMediaTab conversationId={conversationId} messages={messages} isLoading={isLoadingMessages} preview onShowAll={onShowAllFiles} />
    </div>
  );

  let body;
  if (isMirai) {
    body = (
      <>
        <div className="px-4">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 p-4">
            <p className="text-sm leading-relaxed">
              Soy tu asistente dentro de Runly: resumo conversaciones, explico mensajes y archivos, y consulto la información de tus módulos por ti.
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Prueba pedirme</p>
            <ul className="mt-2 space-y-1.5">
              {MIRAI_EXAMPLE_PROMPTS.map((prompt) => (
                <li key={prompt} className="flex items-start gap-2 text-xs text-[hsl(var(--foreground))]/85">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--brand-primary)" aria-hidden />
                  {prompt}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {media}
      </>
    );
  } else if (type === "direct") {
    const hasContactInfo = Boolean(otherMember?.email || otherMember?.phone || otherMember?.bio);
    body = (
      <>
        {hasContactInfo && (
          <div data-section="contact-info">
            <SectionHeader icon={Info} label="Informacion" />
            <div className="space-y-1 px-4 pb-1">
              {otherMember.bio && <p className="pb-1 text-sm text-[hsl(var(--muted-foreground))]">{otherMember.bio}</p>}
              {otherMember.email && (
                <a href={`mailto:${otherMember.email}`} className="flex min-h-10 items-center gap-2.5 text-sm transition-colors hover:text-(--brand-primary)">
                  <Mail className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  <span className="truncate">{otherMember.email}</span>
                </a>
              )}
              {otherMember.phone && (
                <a href={`tel:${otherMember.phone}`} className="flex min-h-10 items-center gap-2.5 text-sm transition-colors hover:text-(--brand-primary)">
                  <Phone className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  <span className="truncate">{otherMember.phone}</span>
                </a>
              )}
            </div>
          </div>
        )}
        {media}
        <div data-section="common">
          <SectionHeader icon={Users} label="En comun" />
          <GroupsInCommonTab otherUserId={otherMember?.userId} />
        </div>
        <div data-section="notifications">
          <SectionHeader icon={Bell} label="Notificaciones" />
          <NotificationsTab conversationId={conversationId} isMuted={isMuted} />
        </div>
        <div data-section="info">
          <SectionHeader icon={Info} label="Zona de peligro" />
          <ConversationInfoTab conversationId={conversationId} otherUserId={otherMember?.userId} otherDisplayName={otherMember?.displayName} />
        </div>
      </>
    );
  } else {
    // group / channel: Informacion / Miembros y roles. The tab bar sticks
    // under the top bar so each tab's content gets the full height.
    body = (
      <Tabs defaultValue={initialTab === "members" ? "members" : "info"}>
        <div className={cn("sticky top-16 z-10 border-b bg-[hsl(var(--background))]/92 px-4 py-2 backdrop-blur-md transition-colors", collapsed ? "border-[hsl(var(--border))]" : "border-transparent")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Informacion</TabsTrigger>
            <TabsTrigger value="members">Miembros y roles</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="info" className="mt-0">
          <SectionHeader icon={Settings} label="Ajustes" />
          <ChannelGeneralTab conversationId={conversationId} currentUserId={currentUserId} />
          <SectionHeader icon={CalendarDays} label="Eventos" />
          <ChannelEventsTab conversationId={conversationId} />
          {media}
          <SectionHeader icon={Bell} label="Notificaciones" />
          <NotificationsTab conversationId={conversationId} isMuted={isMuted} />
          {canManageChannel && (
            <>
              <SectionHeader icon={AlertTriangle} label="Zona de peligro" />
              <ChannelDangerZoneTab conversationId={conversationId} onDeleted={onDeleted} />
            </>
          )}
        </TabsContent>
        <TabsContent value="members" className="mt-0">
          <SectionHeader icon={Users} label="Miembros" />
          <div className="px-4 pb-3">
            <ChannelMembersTab conversationId={conversationId} currentUserId={currentUserId} onOpenConversation={onOpenConversation} />
          </div>
          {canManageRoles && (
            <div className="px-4 pb-4">
              <Accordion type="single" collapsible>
                <AccordionItem value="roles">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                      Gestion de roles
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ChannelRolesTab conversationId={conversationId} currentUserId={currentUserId} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {topBar}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {hero}
        {callActions}
        {body}
      </div>
      {avatarViewer}
    </div>
  );
}
