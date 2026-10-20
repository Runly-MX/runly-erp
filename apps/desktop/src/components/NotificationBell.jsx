import { useEffect, useState } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@runly/ui";
import { runly } from "../lib/runly";
import { getSystemNotificationPermission, isTauriRuntime } from "../lib/systemNotifications";
import { isWebPushSupported } from "../lib/webPush";
import { useNotificationSoundStore } from "../stores/notificationSound";
import { NotificationItem } from "./notifications/NotificationItem";

const TABS = [
  { value: "general", label: "General", empty: "Sin notificaciones generales" },
  { value: "messages", label: "Mensajes", empty: "Sin mensajes nuevos" },
];

function CountBadge({ value }) {
  if (!value) return null;
  return (
    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {value > 9 ? "9+" : value}
    </span>
  );
}

export function NotificationBell({
  token,
  onNavigate,
  onSeeAll,
}) {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("general");

  // Always fetches the unread counters; the list itself follows the active tab.
  const { data } = useQuery({
    queryKey: ["notifications", "panel", tab],
    queryFn: () => runly.notifications.list(token, { category: tab, limit: 15 }),
    enabled: Boolean(token),
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "bell-unread"],
    queryFn: () => runly.notifications.list(token, { unreadOnly: true, limit: 1 }),
    enabled: Boolean(token),
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const recent = Array.isArray(data) ? data : (data?.data ?? []);
  const unreadCount = unreadData?.unreadCount ?? data?.unreadCount ?? 0;
  const unreadByCategory = unreadData?.unreadByCategory ?? data?.unreadByCategory ?? {};
  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[0];

  const markAllRead = useMutation({
    mutationFn: () => runly.notifications.markAllRead(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOneRead = useMutation({
    mutationFn: (id) => runly.notifications.markRead(token, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const [open, setOpen] = useState(false);
  const [showEnableReminder, setShowEnableReminder] = useState(false);
  const soundMuted = useNotificationSoundStore((s) => s.muted);
  const toggleSound = useNotificationSoundStore((s) => s.toggle);

  useEffect(() => {
    let cancelled = false;
    async function checkPermission() {
      const permission = isTauriRuntime()
        ? await getSystemNotificationPermission().catch(() => "unsupported")
        : isWebPushSupported()
          ? (typeof Notification !== "undefined" ? Notification.permission : "unsupported")
          : "unsupported";
      if (!cancelled) setShowEnableReminder(permission !== "granted" && permission !== "unsupported");
    }
    checkPermission();
    return () => { cancelled = true; };
  }, []);

  function handleEnableReminderClick() {
    setOpen(false);
    if (typeof onNavigate === "function") onNavigate("/m/runly.notifications/settings");
  }

  function handleNotificationClick(notification) {
    if (!notification) return;
    setOpen(false);
    if (!notification.read) markOneRead.mutate(notification.id);
    if (notification.link && typeof onNavigate === "function") {
      onNavigate(notification.link);
      return;
    }
    if (typeof onSeeAll === "function") onSeeAll();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          title="Notificaciones"
          className="relative h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors duration-150 outline-none"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.65)]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Notificaciones</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || unreadCount === 0}
              className="rounded-md px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
            >
              Marcar todo leído
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundMuted ? "Activar sonido de notificaciones" : "Silenciar sonido de notificaciones"}
              title={soundMuted ? "Activar sonido de notificaciones" : "Silenciar sonido de notificaciones"}
              className="h-8 w-8 flex items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer shrink-0"
            >
              {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="px-3 pb-2">
          <TabsList className="w-full">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1">
                {t.label}
                <CountBadge value={unreadByCategory[t.value]} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {showEnableReminder && (
          <button
            type="button"
            onClick={handleEnableReminderClick}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 transition-colors cursor-pointer border-y border-[hsl(var(--border))] text-left"
          >
            <BellOff size={13} className="shrink-0" />
            Activa las notificaciones para no perderte avisos
          </button>
        )}

        <div className="max-h-[min(26rem,60vh)] overflow-y-auto border-t border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-[hsl(var(--muted-foreground))]">
              <Bell size={24} className="opacity-40" />
              <p className="text-sm">{activeTab.empty}</p>
            </div>
          ) : (
            recent.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                compact
                onOpen={handleNotificationClick}
              />
            ))
          )}
        </div>

        <div className="border-t border-[hsl(var(--border))] p-2">
          <button
            type="button"
            onClick={() => { setOpen(false); onSeeAll?.(); }}
            className="w-full rounded-md px-3 py-2.5 text-xs text-left text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer"
          >
            Ver todas las notificaciones
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
