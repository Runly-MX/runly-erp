import {
  BookOpen,
  Bell,
  Boxes,
  CalendarClock,
  Clock,
  FolderKanban,
  Globe,
  Megaphone,
  MessageCircle,
  NotebookPen,
  PhoneIncoming,
  ShieldAlert,
  ShoppingCart,
  Wallet,
} from "lucide-react";

// Source module of a notification, derived from its eventType prefix. Tones are
// resolved to Tailwind classes in NotificationItem (kept literal there so the
// class names survive Tailwind's content scan).
const MODULES = [
  { prefix: "chat.call.", key: "chat", label: "Llamadas", Icon: PhoneIncoming, tone: "emerald" },
  { prefix: "chat.", key: "chat", label: "Chat", Icon: MessageCircle, tone: "sky" },
  { prefix: "calendar.", key: "calendar", label: "Calendario", Icon: CalendarClock, tone: "violet" },
  { prefix: "projects.", key: "projects", label: "Proyectos", Icon: FolderKanban, tone: "indigo" },
  { prefix: "inventory.", key: "inventory", label: "Inventario", Icon: Boxes, tone: "amber" },
  { prefix: "ledger.", key: "ledger", label: "Finanzas", Icon: Wallet, tone: "emerald" },
  { prefix: "pfm.", key: "pfm", label: "Finanzas personales", Icon: Wallet, tone: "emerald" },
  { prefix: "lms.", key: "lms", label: "Cursos", Icon: BookOpen, tone: "rose" },
  { prefix: "notes.", key: "notes", label: "Notas", Icon: NotebookPen, tone: "amber" },
  { prefix: "growth.", key: "growth", label: "Crecimiento", Icon: Megaphone, tone: "teal" },
  { prefix: "attendance.", key: "attendance", label: "Asistencia", Icon: Clock, tone: "sky" },
  { prefix: "website.sale", key: "website", label: "Tienda", Icon: ShoppingCart, tone: "teal" },
  { prefix: "website.", key: "website", label: "Sitio web", Icon: Globe, tone: "teal" },
  { prefix: "system.", key: "system", label: "Sistema", Icon: ShieldAlert, tone: "slate" },
];

const FALLBACK_MODULE = { key: "general", label: "General", Icon: Bell, tone: "slate" };

const ACTIONS = {
  "chat.message.new": "Mensaje nuevo",
  "chat.mention.new": "Te mencionó",
  "chat.thread.reply": "Respondió en un hilo",
  "chat.member.added": "Te agregó a una conversación",
  "chat.call.incoming": "Llamada entrante",
  "chat.call.meeting_started": "Inició una reunión",
  "chat.call.guest_waiting": "Un invitado espera entrar",
  "chat.new_guest_message": "Mensaje de un invitado",
};

export function getNotificationModule(eventType) {
  const type = String(eventType ?? "");
  return MODULES.find((m) => type.startsWith(m.prefix)) ?? FALLBACK_MODULE;
}

export function isMessageNotification(notification) {
  return String(notification?.eventType ?? "").startsWith("chat.");
}

// Everything the list UIs need to render one notification: who, what, where.
export function getNotificationPresentation(notification) {
  const mod = getNotificationModule(notification?.eventType);
  const meta = notification?.metadata ?? {};
  const actorName = notification?.actor?.displayName ?? meta.senderName ?? null;
  const isChat = mod.key === "chat";
  const room =
    isChat && (meta.conversationType === "channel" || meta.conversationType === "group") && meta.conversationTitle
      ? meta.conversationTitle
      : null;
  const count = typeof meta.count === "number" && meta.count > 1 ? meta.count : 1;

  // Chat rows lead with the person; legacy rows (no actor stored) keep their title.
  const heading = isChat && actorName ? actorName : notification?.title ?? "";
  const action = isChat && actorName ? ACTIONS[notification.eventType] ?? null : null;
  const context = [action, room ? `en ${room}` : null].filter(Boolean).join(" · ") || null;

  return {
    module: mod,
    heading,
    context,
    count,
    actor: notification?.actor ?? null,
    actorName: isChat || notification?.actor ? actorName : null,
    isHigh: notification?.priority === "high" || notification?.priority === "critical",
  };
}

export function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(date));
}
