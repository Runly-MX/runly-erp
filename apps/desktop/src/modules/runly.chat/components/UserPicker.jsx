// apps/desktop/src/modules/runly.chat/components/UserPicker.jsx
//
// User-search-and-multi-select building blocks for chat and files, on top of
// the shared @runly/ui PersonAvatar / PersonOption.
import { PersonAvatar, PersonOption, Skeleton, personName } from "@runly/ui";

export function UserAvatar({ user, size = "md" }) {
  const avatar = <PersonAvatar name={personName(user)} src={user.avatarUrl ?? null} size={size} />;
  // `online` is set by useCompanyPeople; other callers simply omit it.
  if (!user.online) return avatar;
  return (
    <span className="relative shrink-0">
      {avatar}
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[hsl(var(--card))]" aria-label="En línea" />
    </span>
  );
}

export function UserPickerItem({ user, selected, onToggle }) {
  return <PersonOption user={user} selected={selected} onSelect={onToggle} secondary={user.online ? "En línea" : user.email} />;
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
