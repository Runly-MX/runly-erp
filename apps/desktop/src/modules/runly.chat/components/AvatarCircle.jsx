import { useState, useEffect } from "react";
import { MiraiAvatar } from "@runly/ui";
import { ConversationTypeBadge } from "./ConversationTypeBadge";

// Extracted out of MiniChatWindow.jsx so components that only need the avatar
// (e.g. ChannelMembersTab's member rows) don't have to import that whole
// module — MiniChatWindow.jsx re-exports this for its existing callers
// (FloatingChatHub.jsx) and would otherwise form an import cycle with
// ConversationProfilePanel.jsx -> ChannelMembersTab.jsx -> MiniChatWindow.jsx.
export function AvatarCircle({ avatarUrl, avatarEmoji, type, name, size = "md", online = false }) {
  const [avatarErr, setAvatarErr] = useState(false);
  const sizeClass = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";

  useEffect(() => { setAvatarErr(false); }, [avatarUrl]);

  return (
    <div className="relative shrink-0">
      {online && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[hsl(var(--card))] z-10" />
      )}
      {type === "mirai" ? (
        <MiraiAvatar size={size === "sm" ? 28 : 32} />
      ) : avatarUrl && !avatarErr ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeClass} rounded-full object-cover`}
          onError={() => setAvatarErr(true)}
        />
      ) : avatarEmoji ? (
        <div className={`${sizeClass} rounded-full flex items-center justify-center bg-[hsl(var(--muted))]`}>
          <span className="text-sm leading-none">{avatarEmoji}</span>
        </div>
      ) : (
        <div
          className={`${sizeClass} rounded-full flex items-center justify-center font-bold`}
          style={{ backgroundColor: "var(--brand-primary)", color: "var(--brand-primary-foreground)" }}
        >
          {name?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <ConversationTypeBadge type={type} />
    </div>
  );
}
