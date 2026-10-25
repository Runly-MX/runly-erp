// Header of a sidebar section: chevron, name and, when collapsed, what is unread inside.
import { ChevronDown, ChevronRight } from "lucide-react";

export function SidebarSectionHeader({ label, collapsed, unread = 0, mentions = 0, count, onToggle }) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:min-h-10"
    >
      <Chevron className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {collapsed && (mentions > 0 || unread > 0) ? (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-semibold text-[var(--brand-primary-foreground)]">{(mentions || unread) > 99 ? "99+" : mentions || unread}</span>
      ) : count != null ? <span className="text-[10px] tabular-nums">{count}</span> : null}
    </button>
  );
}
