import { useMemo, useRef, useState } from "react";
import { Button } from "@runly/ui";
import { toast } from "sonner";
import { CalendarPlus, Clapperboard, Hash, KeyRound, MessageSquare, Mic, Phone, Users, Video } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { useCalls } from "../calls/CallsProvider";
import { useLiveCalls } from "../calls/hooks/useLiveCalls";
import { JoinByIdDialog } from "../calls/JoinByIdDialog";
import { PreJoinDialog } from "../calls/PreJoinDialog";
import { useCompanyPeople, useStartDirectChat } from "../hooks/useCompanyPeople";
import { getConversationDisplayName } from "../lib/chatUtils";
import { isMeeting } from "../lib/sidebarSections";
import { AvatarCircle } from "./AvatarCircle";
import { NewMeetingDialog } from "./NewMeetingDialog";

const PEOPLE_LIMIT = 12;
const ROOMS_LIMIT = 6;

function Section({ title, aside = null, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function QuickAction({ icon: Icon, label, hint, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 p-3 text-left transition-colors hover:bg-[hsl(var(--muted))] disabled:opacity-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-(--brand-primary)/10 text-(--brand-primary)">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>
      </span>
    </button>
  );
}

// What the chat pane shows with no conversation open: calls you can join or
// go back to, call shortcuts, who is connected, and the meeting rooms.
export function ChatHome({ conversations, onOpenConversation, onOpenRecordings }) {
  const { userProfile } = useAuth();
  const { enabled: callsEnabled, isStarting, activeCall, startCall, joinCall } = useCalls();
  const { calls: liveCalls } = useLiveCalls();
  const { people, onlineCount } = useCompanyPeople();
  const [meetingMode, setMeetingMode] = useState(null);
  const [joinTarget, setJoinTarget] = useState(null);
  const [joinByIdOpen, setJoinByIdOpen] = useState(false);
  const busy = isStarting || Boolean(activeCall);

  // A call is started from the 1:1 chat: open it (or reuse it), then call.
  const pendingCallKind = useRef(null);
  const { start: openDirectChat, startingId } = useStartDirectChat((conversation) => {
    const kind = pendingCallKind.current;
    pendingCallKind.current = null;
    if (!conversation?.id) return;
    if (kind) startCall({ conversationId: conversation.id, kind });
    else onOpenConversation(conversation);
  });
  const openDirect = (person, kind = null) => { pendingCallKind.current = kind; openDirectChat(person); };

  const byId = useMemo(() => new Map(conversations.map((c) => [c.id, c])), [conversations]);
  // Only calls of conversations in this company's list; mine first.
  const joinable = liveCalls
    .filter((entry) => byId.has(entry.conversationId) && entry.call.id !== activeCall?.id && entry.myStatus !== "JOINED" && entry.myStatus !== "REMOVED")
    .sort((a, b) => Number(Boolean(b.myStatus)) - Number(Boolean(a.myStatus)));
  const online = people.filter((p) => p.online).slice(0, PEOPLE_LIMIT);
  const rooms = conversations.filter(isMeeting).slice(0, ROOMS_LIMIT);
  const liveByConversation = new Map(liveCalls.map((entry) => [entry.conversationId, entry]));

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-8 sm:px-8">
        <header className="space-y-1">
          <h1 className="chat-font-display text-xl font-semibold">Hola{userProfile?.displayName ? `, ${userProfile.displayName.split(" ")[0]}` : ""}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Elige una conversación de la lista o empieza algo nuevo desde aquí.</p>
        </header>

        {callsEnabled && joinable.length > 0 && (
          <Section title="Llamadas en curso">
            <ul className="space-y-2">
              {joinable.map((entry) => {
                const conversation = byId.get(entry.conversationId);
                const rejoin = entry.myStatus === "DISCONNECTED" || entry.myStatus === "LEFT";
                const Icon = entry.call.kind === "AUDIO" ? Phone : Video;
                return (
                  <li key={entry.call.id} className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300 ring-2 ring-[hsl(var(--background))]" aria-hidden />
                    </span>
                    <button type="button" onClick={() => onOpenConversation(conversation)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold">{getConversationDisplayName(conversation, userProfile?.id)}</span>
                      <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {rejoin ? "Saliste de esta llamada · " : ""}
                        {entry.call.joinedCount ? `${entry.call.joinedCount} conectad${entry.call.joinedCount === 1 ? "o" : "os"}` : "Nadie conectado ahora"}
                      </span>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => setJoinTarget(entry)}
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      {rejoin ? "Regresar" : "Unirse"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {callsEnabled && (
          <Section title="Acciones rápidas">
            <div className="grid gap-2 sm:grid-cols-2">
              <QuickAction icon={Video} label="Nueva reunión" hint="Abre una sala ahora; nadie recibe timbre" onClick={() => setMeetingMode("now")} disabled={busy} />
              <QuickAction icon={CalendarPlus} label="Programar reunión" hint="Con invitados, enlace y evento en el calendario" onClick={() => setMeetingMode("schedule")} disabled={busy} />
              <QuickAction icon={KeyRound} label="Unirse con un ID" hint="Escribe el ID de la reunión o pega su enlace" onClick={() => setJoinByIdOpen(true)} disabled={busy} />
              <QuickAction icon={Mic} label="Reunión presencial" hint="Graba y transcribe una reunión en persona" onClick={() => setMeetingMode("inperson")} disabled={busy} />
              <QuickAction icon={Clapperboard} label="Grabaciones" hint="Todas las grabaciones de tus llamadas" onClick={onOpenRecordings} />
            </div>
          </Section>
        )}

        <Section
          title="Conectados"
          aside={onlineCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />{onlineCount}
            </span>
          )}
        >
          {online.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No hay nadie más en línea ahora.</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {online.map((person) => (
                <li key={person.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[hsl(var(--muted))]">
                  <AvatarCircle name={person.displayName} avatarUrl={person.avatarUrl} online />
                  <span className="min-w-0 flex-1 truncate text-sm">{person.displayName ?? person.email}</span>
                  <Button type="button" size="icon-sm" variant="ghost" title="Chatear" aria-label={`Chatear con ${person.displayName ?? person.email}`} disabled={Boolean(startingId)} onClick={() => openDirect(person)}>
                    <MessageSquare />
                  </Button>
                  {callsEnabled && (
                    <>
                      <Button type="button" size="icon-sm" variant="ghost" title="Llamar" aria-label={`Llamar a ${person.displayName ?? person.email}`} disabled={busy || Boolean(startingId)} onClick={() => openDirect(person, "AUDIO")}>
                        <Phone />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" title="Videollamada" aria-label={`Videollamada con ${person.displayName ?? person.email}`} disabled={busy || Boolean(startingId)} onClick={() => openDirect(person, "VIDEO")}>
                        <Video />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {rooms.length > 0 && (
          <Section title="Salas de reunión">
            <ul className="grid gap-1 sm:grid-cols-2">
              {rooms.map((room) => {
                const live = liveByConversation.get(room.id);
                return (
                  <li key={room.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[hsl(var(--muted))]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                      {live ? <Users className="h-4 w-4 text-emerald-500" aria-hidden /> : <Hash className="h-4 w-4" aria-hidden />}
                    </span>
                    <button type="button" onClick={() => onOpenConversation(room)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm">{getConversationDisplayName(room, userProfile?.id)}</span>
                      {live && <span className="block text-xs text-emerald-600 dark:text-emerald-400">En curso</span>}
                    </button>
                    {callsEnabled && !live && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => startCall({ conversationId: room.id, kind: "VIDEO", ring: false })}>
                        Iniciar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </div>

      <NewMeetingDialog open={Boolean(meetingMode)} onOpenChange={(open) => { if (!open) setMeetingMode(null); }} initialMode={meetingMode ?? "now"} />
      <JoinByIdDialog
        open={joinByIdOpen}
        onOpenChange={setJoinByIdOpen}
        onJoinLive={setJoinTarget}
        onOpenConversation={(id) => {
          const conversation = byId.get(id);
          if (conversation) onOpenConversation(conversation);
          else toast.info("Esa reunión es de otra empresa: cámbiate a esa empresa para entrar.");
        }}
      />
      <PreJoinDialog
        open={Boolean(joinTarget)}
        onOpenChange={(open) => { if (!open) setJoinTarget(null); }}
        subtitle={joinTarget?.call.joinedCount ? `${joinTarget.call.joinedCount} en la llamada` : "No hay nadie conectado ahora"}
        name={userProfile?.displayName}
        defaultCamera={joinTarget?.call.kind !== "AUDIO"}
        busy={isStarting}
        onJoin={async (prefs) => {
          if (joinTarget && await joinCall(joinTarget.call.id, prefs)) setJoinTarget(null);
        }}
      />
    </div>
  );
}
