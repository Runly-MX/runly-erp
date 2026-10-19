import { PersonAvatar } from "@runly/ui";
import { getNotificationPresentation, formatTimeAgo } from "../../lib/notificationPresentation";

const TONES = {
  sky: "bg-sky-500/15 text-sky-500",
  violet: "bg-violet-500/15 text-violet-500",
  indigo: "bg-indigo-500/15 text-indigo-400",
  amber: "bg-amber-500/15 text-amber-500",
  emerald: "bg-emerald-500/15 text-emerald-500",
  rose: "bg-rose-500/15 text-rose-500",
  teal: "bg-teal-500/15 text-teal-500",
  slate: "bg-slate-500/15 text-slate-400",
};

// One notification row, shared by the bell panel (compact) and the inbox screen.
// Leading visual: the person who caused it (with the source-module badge on the
// corner) or, when there is no person, the module icon.
export function NotificationItem({ notification, onOpen, compact = false, className = "" }) {
  const p = getNotificationPresentation(notification);
  const { Icon } = p.module;
  const tone = TONES[p.module.tone] ?? TONES.slate;
  const unread = !notification.read;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(notification)}
      className={`group relative w-full flex items-start gap-3 text-left cursor-pointer transition-colors duration-150 hover:bg-(--glass-tint) focus-visible:outline-none focus-visible:bg-(--glass-tint) ${
        compact ? "px-3 py-3 min-h-14" : "px-4 py-3.5"
      } ${unread ? "bg-(--brand-soft)/40" : ""} ${className}`}
    >
      {unread && (
        <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-(--brand-primary)" />
      )}

      <span className="relative shrink-0">
        {p.actorName ? (
          <PersonAvatar name={p.actorName} src={p.actor?.avatarUrl ?? null} size={compact ? "md" : "lg"} />
        ) : (
          <span className={`flex items-center justify-center rounded-full ${compact ? "h-9 w-9" : "h-12 w-12"} ${tone}`}>
            <Icon size={compact ? 16 : 20} />
          </span>
        )}
        {p.actorName && (
          <span
            className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-[hsl(var(--card))] ${tone}`}
          >
            <Icon size={10} />
          </span>
        )}
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span
            className={`truncate text-sm ${unread ? "font-semibold text-[hsl(var(--foreground))]" : "font-medium text-[hsl(var(--foreground))]/80"}`}
          >
            {p.heading}
          </span>
          {p.count > 1 && (
            <span className="shrink-0 rounded-full bg-(--brand-primary) px-1.5 text-[10px] font-semibold leading-4 text-(--brand-primary-foreground)">
              {p.count > 99 ? "99+" : p.count}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
            {formatTimeAgo(notification.createdAt)}
          </span>
        </span>

        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span className={`shrink-0 rounded px-1.5 py-px font-medium ${tone}`}>{p.module.label}</span>
          {p.context && <span className="truncate">{p.context}</span>}
          {p.isHigh && !p.context && (
            <span className="shrink-0 font-medium text-amber-500">
              {notification.priority === "critical" ? "Crítica" : "Importante"}
            </span>
          )}
        </span>

        {notification.body && (
          <span className={`mt-1 block text-[hsl(var(--muted-foreground))] ${compact ? "text-xs line-clamp-2" : "text-sm line-clamp-3"}`}>
            {notification.body}
          </span>
        )}
      </span>
    </button>
  );
}
