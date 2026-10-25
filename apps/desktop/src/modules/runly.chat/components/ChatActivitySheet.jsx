// "Menciones y actividad": what is addressed to the person (mentions, replies in their
// threads, reactions to their messages, invitations), newest first. Spec
// docs/superpowers/specs/2026-10-26-chat-organization-design.md, section 4.
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton } from "@runly/ui";
import { AtSign, Bell, CornerDownRight, SmilePlus, UserPlus } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

const KINDS = {
  mention: { Icon: AtSign, text: (item) => `${item.sender} te mencionó` },
  reply: { Icon: CornerDownRight, text: (item) => `${item.sender} respondió en tu hilo` },
  reaction: { Icon: SmilePlus, text: (item) => `${item.sender} reaccionó ${item.emoji ?? ""} a tu mensaje` },
  invite: { Icon: UserPlus, text: (item) => `${item.sender} te agregó` },
};

const when = (value) => {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};

export function useChatActivity(enabled = true) {
  const { session } = useAuth();
  const token = session?.access_token;
  return useQuery({
    queryKey: ["chat-activity"],
    queryFn: () => runly.chat.getActivity(token).then((res) => res?.data ?? { items: [], unread: 0 }),
    enabled: Boolean(token && enabled),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

export function ChatActivitySheet({ open, onOpenChange, onOpen }) {
  const { data, isLoading, isError, refetch } = useChatActivity(open);
  const items = data?.items ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Bell className="h-4 w-4" aria-hidden /> Menciones y actividad</SheetTitle></SheetHeader>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {isLoading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>}
          {isError && <ErrorState title="No se pudo cargar la actividad" onRetry={refetch} />}
          {!isLoading && !isError && items.length === 0 && <EmptyState title="Todo al día" description="Aquí verás menciones, respuestas a tus hilos, reacciones e invitaciones de los últimos 7 días." />}
          <ul className="space-y-1">
            {items.map((item) => {
              const { Icon, text } = KINDS[item.kind] ?? KINDS.mention;
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => onOpen(item)} className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:min-h-14">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${item.unread ? "font-semibold" : ""}`}>{text(item)}</span>
                      <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{item.conversation}{item.excerpt ? ` · ${item.excerpt}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{when(item.createdAt)}</span>
                    {item.unread && <span aria-label="Sin leer" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
