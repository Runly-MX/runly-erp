// apps/desktop/src/modules/runly.chat/components/UserPicker.jsx
//
// Shared user-search-and-multi-select building blocks, extracted from
// CreateChatModal.jsx so ChannelMembersTab's "Anadir miembros" picker can
// reuse the exact same pattern without duplicating it.
import { Check } from "lucide-react";
import { Skeleton } from "@runly/ui";

export function UserAvatar({ user, size = "md" }) {
  const sizeClass = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.displayName}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold shrink-0`}
      style={{ backgroundColor: "var(--brand-primary)", color: "var(--brand-primary-foreground)" }}
    >
      {user.displayName?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export function UserPickerItem({ user, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(user)}
      className={[
        "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors",
        selected
          ? "bg-[var(--brand-primary)]/10 ring-1 ring-inset ring-[var(--brand-primary)]"
          : "hover:bg-[hsl(var(--muted))]",
      ].join(" ")}
    >
      <UserAvatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{user.displayName}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{user.email}</p>
      </div>
      {selected && (
        <div className="shrink-0 h-5 w-5 rounded-full bg-[var(--brand-primary)] flex items-center justify-center">
          <Check className="h-3 w-3 text-[var(--brand-primary-foreground)]" />
        </div>
      )}
    </button>
  );
}

export function UserListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
