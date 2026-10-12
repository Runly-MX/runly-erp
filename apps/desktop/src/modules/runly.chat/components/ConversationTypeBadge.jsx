import { Hash, Users } from "lucide-react";

// Small corner badge signaling conversation type — rendered by each of the
// 3 places a conversation avatar shows (ChatConversationItem, ChatWindow,
// FloatingChatHub). Renders nothing for "direct" (a 1:1 chat's identity is
// the other person's own photo, which is signal enough) and for unknown
// types (defensive — a badge for a type we don't recognize would be
// misleading, not helpful).
export function ConversationTypeBadge({ type, className = "" }) {
  // Background is the page/card background (a "cutout" against the avatar),
  // never an accent color — an avatar's own fallback background is already
  // --brand-primary, so a same-family accent color here would blend into it
  // almost invisibly (confirmed as a real, reported bug: the previous
  // version used bg-primary + a barely-legible h-2 w-2 icon). The icon
  // itself carries the color/contrast instead, at a size that's actually
  // legible at typical avatar sizes.
  if (type === "channel") {
    return (
      <span className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(var(--background))] ring-2 ring-[hsl(var(--background))] shadow-sm ${className}`}>
        <Hash className="h-2.5 w-2.5 text-[var(--brand-primary)] stroke-3" />
      </span>
    );
  }
  if (type === "group") {
    return (
      <span className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(var(--background))] ring-2 ring-[hsl(var(--background))] shadow-sm ${className}`}>
        <Users className="h-2.5 w-2.5 text-[hsl(var(--muted-foreground))] stroke-3" />
      </span>
    );
  }
  return null;
}
