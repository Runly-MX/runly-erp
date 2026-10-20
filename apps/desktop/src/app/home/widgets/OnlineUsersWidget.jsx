import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, PersonAvatar } from "@runly/ui";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useGlobalPresence } from "../../../providers/RealtimeProvider";
import { useCalls } from "../../../modules/runly.chat/calls/CallsProvider";
import { useCreateConversation } from "../../../modules/runly.chat/hooks/useCreateConversation";
import { WidgetFrame } from "./WidgetFrame";

const MAX_SHOWN = 8;

export function OnlineUsersWidget({ module }) {
  const navigate = useNavigate();
  const { userProfile, session } = useAuth();
  const token = session?.access_token;
  const { onlineUsers } = useGlobalPresence();
  const { startCall, isStarting } = useCalls();
  const { mutateAsync: createConversation } = useCreateConversation();
  const [busyId, setBusyId] = useState(null);

  // The presence payload carries a signed avatar URL captured when each person
  // connected; it can be missing or expired, so fresh URLs from the directory win.
  const { data: candidates } = useQuery({
    queryKey: ["online-widget-avatars", token],
    queryFn: () => runly.identity.listCandidates(token, { action: "chat", pageSize: 100 }),
    enabled: Boolean(token),
    staleTime: 10 * 60_000,
  });
  const avatarById = new Map((candidates?.data ?? []).map((p) => [p.id, p.avatarUrl]));

  const users = Object.values(onlineUsers ?? {})
    .filter((u) => u?.userId && u.userId !== userProfile?.id)
    .map((u) => ({ ...u, avatarUrl: avatarById.get(u.userId) ?? u.avatarUrl ?? null }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "es"));
  const shown = users.slice(0, MAX_SHOWN);

  // createConversation({ type: "direct" }) is idempotent server-side: it returns
  // the existing direct conversation with this person when there is one.
  async function resolveConversationId(user) {
    const result = await createConversation({ type: "direct", memberUserIds: [user.userId] });
    return result?.data?.id ?? null;
  }

  async function openChat(user) {
    setBusyId(user.userId);
    try {
      const conversationId = await resolveConversationId(user);
      if (!conversationId) throw new Error("sin conversación");
      navigate(`/app/m/runly.chat/chat/inbox/${conversationId}`);
    } catch {
      toast.error("No se pudo abrir la conversación.");
    } finally {
      setBusyId(null);
    }
  }

  async function callUser(user) {
    setBusyId(user.userId);
    try {
      const conversationId = await resolveConversationId(user);
      if (!conversationId) throw new Error("sin conversación");
      await startCall({ conversationId, kind: "AUDIO" });
    } catch {
      toast.error("No se pudo iniciar la llamada.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <WidgetFrame
      module={module}
      title="En línea"
      subtitle={users.length ? `${users.length} ${users.length === 1 ? "persona conectada" : "personas conectadas"}` : "Ahora"}
      isEmpty={users.length === 0}
      emptyText="No hay nadie más conectado en este momento."
    >
      <ul className="space-y-1">
        {shown.map((u) => (
          <li key={u.userId} className="group flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 hover:bg-[hsl(var(--muted))]">
            <span className="relative shrink-0">
              <PersonAvatar name={u.displayName} src={u.avatarUrl} size="sm" />
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--card))] bg-emerald-500"
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-[hsl(var(--foreground))]">{u.displayName}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label={`Escribir a ${u.displayName}`}
              title="Escribir"
              disabled={busyId === u.userId}
              onClick={() => openChat(u)}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label={`Llamar a ${u.displayName}`}
              title="Llamar"
              disabled={busyId === u.userId || isStarting}
              onClick={() => callUser(u)}
            >
              <Phone className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {users.length > MAX_SHOWN && (
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          +{users.length - MAX_SHOWN} más
        </p>
      )}
    </WidgetFrame>
  );
}
