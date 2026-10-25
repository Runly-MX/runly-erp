import {
  Pin, PinOff, Bell, BellOff, CheckCheck,
  Archive, ArchiveRestore, Trash2, LogOut, FolderInput,
} from "lucide-react";

// Single source of truth for the per-conversation row action list. Pure — takes
// a conversation row (as returned by listConversations, incl. is_pinned /
// is_muted / is_archived / unread_count / my_role from Plan A) and returns an
// ordered array of descriptors. The `action` string is dispatched to a handler
// map by ConversationRowActions; keeping it a plain identifier (not a callback)
// keeps this module trivially testable.
//
//   action: 'pin' | 'unpin' | 'mute' | 'unmute' | 'read'
//         | 'archive' | 'unarchive' | 'delete' | 'leave'

const MANAGER_ROLES = new Set(["owner", "admin"]);

export function buildConversationActions(conversation, { currentUserId, canOrganize = false } = {}) {
  if (!conversation) return [];
  const {
    type,
    is_pinned: isPinned = false,
    is_muted: isMuted = false,
    is_archived: isArchived = false,
    unread_count: unreadCount = 0,
    my_role: myRole = null,
  } = conversation;

  const actions = [];

  actions.push(
    isPinned
      ? { key: "pin", action: "unpin", label: "Desfijar", icon: PinOff }
      : { key: "pin", action: "pin", label: "Fijar arriba", icon: Pin },
  );

  // Only the sectioned sidebar can place a conversation in one of the person's own sections.
  if (canOrganize && !isArchived && type !== "mirai") {
    actions.push({ key: "move", action: "move", label: "Mover a sección...", icon: FolderInput });
  }

  actions.push(
    isMuted
      ? { key: "mute", action: "unmute", label: "Activar notificaciones", icon: Bell }
      : { key: "mute", action: "mute", label: "Silenciar", icon: BellOff },
  );

  if (unreadCount > 0) {
    actions.push({ key: "read", action: "read", label: "Marcar como leído", icon: CheckCheck });
  }

  actions.push(
    isArchived
      ? { key: "archive", action: "unarchive", label: "Desarchivar", icon: ArchiveRestore }
      : { key: "archive", action: "archive", label: "Archivar", icon: Archive },
  );

  if (type === "direct") {
    actions.push({
      key: "delete", action: "delete", label: "Eliminar chat",
      icon: Trash2, tone: "danger", destructive: true,
    });
  } else if (type === "channel" || type === "group") {
    const noun = type === "channel" ? "canal" : "grupo";
    if (MANAGER_ROLES.has(myRole)) {
      actions.push({
        key: "delete", action: "delete", label: `Eliminar ${noun}`,
        icon: Trash2, tone: "danger", destructive: true,
      });
    } else {
      actions.push({
        key: "leave", action: "leave", label: `Salir del ${noun}`,
        icon: LogOut, tone: "danger", destructive: true,
      });
    }
  }

  return actions;
}

// The action fired by a full right-swipe on the row (archive / unarchive).
export function fullSwipeAction(conversation) {
  return conversation?.is_archived ? "unarchive" : "archive";
}
