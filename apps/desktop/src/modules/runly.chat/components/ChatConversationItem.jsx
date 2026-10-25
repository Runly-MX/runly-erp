import { AtSign, Hash, Pin, Users, Video } from "lucide-react";
import { isMeeting } from "../lib/sidebarSections";
import { MiraiAvatar } from "@runly/ui";
import { AssistantWordmark, renderMentionText } from "@runly/ui";
import { formatMessageTime } from "../lib/chatUtils";
import { ConversationTypeBadge } from "./ConversationTypeBadge";

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, avatarUrl, avatarEmoji, type, size = "md", online = false, dnd = false, isBot = false }) {
  const sizeClass = size === "xs" ? "h-6 w-6 text-[10px]" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  if (isBot) {
    return (
      <div className="relative shrink-0">
        <MiraiAvatar size={size === "sm" ? 32 : 40} />
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[hsl(var(--background))] px-1 text-[9px] font-bold leading-tight text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/40">
          IA
        </span>
      </div>
    );
  }
  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeClass} rounded-full object-cover`}
        />
      ) : avatarEmoji ? (
        <div
          className={`${sizeClass} rounded-full flex items-center justify-center bg-[hsl(var(--muted))]`}
        >
          <span className="text-lg leading-none">{avatarEmoji}</span>
        </div>
      ) : (
        <div
          className={`${sizeClass} rounded-full flex items-center justify-center font-semibold`}
          style={{ backgroundColor: "var(--brand-primary)", color: "var(--brand-primary-foreground)" }}
        >
          {getInitials(name)}
        </div>
      )}
      {online && (
        <span title={dnd ? "No molestar" : "En línea"} className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[hsl(var(--background))] ${dnd ? "bg-red-500" : "bg-green-500"}`} />
      )}
      <ConversationTypeBadge type={type} />
    </div>
  );
}

// One-line preview of the last message ("Imagen", "Archivo adjunto" or its text).
function previewOf(lastMsg) {
  if (!lastMsg) return "";
  if (lastMsg.messageType === "system") return lastMsg.body ?? "";
  if (lastMsg.messageType === "image") return "Imagen";
  if (lastMsg.messageType === "file") return "Archivo adjunto";
  return lastMsg.body ?? "";
}

export function ChatConversationItem({ conversation, isActive, onClick, currentUserId, isOnline = false }) {
  const isMirai = conversation.type === "mirai";
  const otherMember = conversation.type === "direct"
    ? (conversation.members ?? []).find((m) => m.userId !== currentUserId)
    : null;

  const displayName = isMirai
    ? "MirAI"
    : (conversation.title ??
      otherMember?.displayName ??
      (conversation.type === "group" ? "Grupo" : "Conversacion directa"));
  // Prefixed only for the visible label — Avatar below still gets the raw
  // displayName so its initials fallback shows the channel's real first
  // letter, not "#".
  const titleLabel = conversation.type === "channel" ? `#${displayName}` : displayName;

  const avatarUrl = conversation.avatarUrl ?? otherMember?.avatarUrl ?? null;
  const avatarEmoji = conversation.avatar_emoji ?? null;
  const lastMsg = conversation.last_message;
  const unread = conversation.unread_count ?? 0;
  const unreadMentions = conversation.unread_mention_count ?? 0;

  let lastMsgPreview = "";
  if (lastMsg) {
    if (lastMsg.messageType === "system") {
      lastMsgPreview = lastMsg.body;
    } else if (lastMsg.messageType === "image") {
      lastMsgPreview = "Imagen";
    } else if (lastMsg.messageType === "file") {
      lastMsgPreview = "Archivo adjunto";
    } else {
      lastMsgPreview = lastMsg.body ?? "";
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={[
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
          isActive
            ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
            : "hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
        ].join(" ")}
      >
        <Avatar name={displayName} avatarUrl={avatarUrl} avatarEmoji={avatarEmoji} type={conversation.type} online={isOnline} isBot={isMirai} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm truncate chat-font-display font-semibold flex items-center gap-1 min-w-0">
              {conversation.is_pinned && (
                <Pin className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))] fill-current" />
              )}
              <span className="truncate">{isMirai ? <AssistantWordmark className="text-foreground" /> : titleLabel}</span>
            </span>
            {lastMsg?.createdAt && (
              <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">
                {formatMessageTime(lastMsg.createdAt)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
              {lastMsgPreview ? renderMentionText(lastMsgPreview) : "Sin mensajes"}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {unreadMentions > 0 && (
                <span
                  title={`${unreadMentions} mencion${unreadMentions === 1 ? "" : "es"} sin leer`}
                  className="inline-flex items-center justify-center h-4.5 min-w-[1.125rem] px-1 rounded-full bg-accent text-white text-[10px] font-semibold"
                >
                  <AtSign className="h-2.5 w-2.5" strokeWidth={3} />
                  {unreadMentions > 9 ? "9+" : unreadMentions}
                </span>
              )}
              {unread > 0 && (
                <span className="inline-flex items-center justify-center h-4.5 min-w-[1.125rem] px-1 rounded-full bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] text-[10px] font-semibold">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

// Dense row of the sectioned sidebar: channels read as "# name", direct messages keep a
// small avatar with presence, groups and meetings get an icon. Unread conversations are
// bold; mentions and unread counts sit on the right. 44 px on touch, 32 px with a mouse.
export function ChatConversationRow({ conversation, isActive, onClick, currentUserId, isOnline = false, status = null }) {
  const otherMember = conversation.type === "direct"
    ? (conversation.members ?? []).find((m) => m.userId !== currentUserId)
    : null;
  const name = conversation.title ?? otherMember?.displayName ?? (conversation.type === "group" ? "Grupo" : "Conversación directa");
  const unread = conversation.unread_count ?? 0;
  const mentions = conversation.unread_mention_count ?? 0;
  const meeting = isMeeting(conversation);
  const photo = conversation.type !== "direct" ? (conversation.avatarUrl ?? null) : null;
  const emoji = conversation.type !== "direct" ? (conversation.avatar_emoji ?? null) : null;
  const direct = conversation.type === "direct";
  const preview = direct ? previewOf(conversation.last_message) : "";
  const lead = photo ? (
    <img src={photo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
  ) : emoji ? (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none" aria-hidden>{emoji}</span>
  ) : conversation.type === "direct" ? (
    <Avatar name={name} avatarUrl={conversation.avatarUrl ?? otherMember?.avatarUrl ?? null} avatarEmoji={conversation.avatar_emoji ?? null} type="direct" size="sm" online={isOnline} dnd={status?.dnd === true} />
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[hsl(var(--muted-foreground))]" aria-hidden>
      {meeting ? <Video className="h-3.5 w-3.5" /> : conversation.type === "channel" ? <Hash className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
    </span>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "true" : undefined}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors [@media(pointer:coarse)]:min-h-11", direct && preview ? "py-1.5" : "py-1",
        isActive ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]" : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
      ].join(" ")}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className={["min-w-0 truncate", unread > 0 || mentions > 0 ? "font-semibold" : "font-normal text-[hsl(var(--foreground))]/80"].join(" ")}>{conversation.type === "channel" && !meeting && (photo || emoji) && <span className="mr-0.5 text-[hsl(var(--muted-foreground))]">#</span>}{name}</span>
          {direct && status?.emoji && <span title={status.text} aria-label={status.text} className="shrink-0 text-sm leading-none">{status.emoji}</span>}
        </span>
        {direct && preview && <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{renderMentionText(preview)}</span>}
      </span>
      {mentions > 0 && (
        <span title={`${mentions} mención${mentions === 1 ? "" : "es"} sin leer`} className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
          <AtSign className="h-2.5 w-2.5" strokeWidth={3} />{mentions > 9 ? "9+" : mentions}
        </span>
      )}
      {unread > 0 && (
        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-semibold text-[var(--brand-primary-foreground)]">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
