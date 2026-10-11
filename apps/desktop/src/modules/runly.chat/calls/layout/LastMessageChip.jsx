import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CallAvatar } from "../ui/CallAvatar";

function previewText(message) {
  if (!message) return "";
  if (message.body) return message.body.replace(/\s+/g, " ").trim();
  if (message.attachments?.length || message.message_type === "file") return "Envió un archivo";
  return "Mensaje";
}

// Phone: the newest chat message of the call floats above the controls; tap
// opens the chat sheet. Dismissable until the next message arrives.
export function LastMessageChip({ message, senderName, avatarUrl, unread, onOpen }) {
  const [dismissedId, setDismissedId] = useState(null);
  useEffect(() => {
    if (message?.id && dismissedId && message.id !== dismissedId) setDismissedId(null);
  }, [message?.id, dismissedId]);
  if (!message || message.id === dismissedId) return null;

  return (
    <div className="call-glass mx-3 mb-2 flex items-center gap-2.5 rounded-2xl px-2.5 py-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-label="Abrir el chat de la llamada">
        <span className="relative">
          <CallAvatar name={senderName} seed={message.sender_user_id ?? senderName} url={avatarUrl} size="xs" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--call-accent) px-1 text-[9px] font-bold text-(--brand-primary-foreground)">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-white">{senderName}</span>
          <span className="block truncate text-xs text-white/65">{previewText(message)}</span>
        </span>
        <span className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">Chat</span>
      </button>
      <button type="button" onClick={() => setDismissedId(message.id)} aria-label="Ocultar mensaje" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
