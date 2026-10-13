import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, SelectField, TagsField, ErrorState, SwitchField, cn,
} from "@runly/ui";
import { Video, Calendar, Mic, Check, CheckCircle2, Plus } from "lucide-react";
import { ConversationTypeBadge } from "./ConversationTypeBadge";
import { toast } from "sonner";
import EventFormModal from "../../runly.calendar/components/EventFormModal";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useChatConversations } from "../hooks/useChatConversations";
import { getConversationDisplayName } from "../lib/chatUtils";
import { useCalls } from "../calls/CallsProvider";
import { useQueryClient } from "@tanstack/react-query";
import { startMeeting } from "../lib/startMeeting.js";
import { summarizeInviteResult, describeInviteOutcome } from "../calls/lib/inviteResult";
import { CallAccessSettings } from "../calls/CallAccessSettings";

function unwrap(r) {
  return r?.data ?? r;
}

// Same identity as the chat list: photo, emoji or initials plus the
// channel/group corner badge, so rooms are told apart at a glance.
function RoomAvatar({ conversation, name }) {
  const url = conversation.avatarUrl ?? null;
  const emoji = conversation.avatar_emoji ?? null;
  const initials = String(name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="relative inline-flex shrink-0">
      {url ? (
        <img src={url} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : emoji ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-base leading-none">{emoji}</span>
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-xs font-semibold text-(--brand-primary-foreground)">{initials}</span>
      )}
      <ConversationTypeBadge type={conversation.type} />
    </span>
  );
}

const NEW_ROOM_ICON = (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-(--brand-primary)/50 bg-(--brand-primary)/10 text-(--brand-primary)">
    <Plus className="h-4 w-4" aria-hidden />
  </span>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_ROOM = "__new__";

const MODES = [
  {
    key: "now",
    label: "Reunión ahora",
    hint: "Entra a la sala en este momento y los demás se unen.",
    points: [
      "Sin timbre: avisamos que empezó y cada quien se une",
      "Desde la llamada puedes llamar a quien falte",
      "Comparte el enlace o el ID para invitados externos",
    ],
    Icon: Video,
    tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  },
  {
    key: "schedule",
    label: "Programar",
    hint: "Elige fecha y hora y envía las invitaciones.",
    points: [
      "Se crea el evento en tu calendario",
      "Invita por correo a personas externas",
      "Decide si entran con sala de espera, PIN o libre",
    ],
    Icon: Calendar,
    tint: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  },
  {
    key: "inperson",
    label: "Presencial",
    hint: "Graba una reunión en sala o una exposición desde un solo dispositivo.",
    points: [
      "Antes de grabar eliges y pruebas micrófono, altavoz y cámara",
      "Empieza con audio; activa cámara o presenta tu pantalla si expones",
      "Se graba y transcribe al pulsar Comenzar a grabar",
      "Nadie recibe timbre ni notificación de llamada",
      "Al terminar, la grabación queda en la conversación",
    ],
    Icon: Mic,
    tint: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  },
];

const ACTION = {
  now: { label: "Iniciar reunión", busy: "Abriendo...", Icon: Video },
  schedule: { label: "Continuar al calendario", busy: "Preparando...", Icon: Calendar },
  inperson: { label: "Preparar grabación", busy: "Abriendo...", Icon: Mic },
};

function ModeCard({ mode, selected, disabled, onSelect }) {
  const { label, hint, points, Icon, tint } = mode;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative grid h-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-3 rounded-2xl border p-4 text-left transition-all duration-150 md:flex md:flex-col",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)",
        selected
          ? "border-(--brand-primary) bg-(--brand-soft) shadow-sm"
          : "border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 hover:border-(--brand-primary)/50 hover:bg-[hsl(var(--muted))]/50",
      )}
    >
      {selected && (
        <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-(--brand-primary)" aria-hidden />
      )}
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tint)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="space-y-1 pr-6 md:pr-0">
        <span className="block text-base font-semibold text-[hsl(var(--foreground))]">{label}</span>
        <span className="block text-sm leading-snug text-[hsl(var(--muted-foreground))]">{hint}</span>
      </span>
      {/* Phones show the details only for the chosen mode. */}
      <ul className={cn("col-span-2 mt-auto space-y-1.5", !selected && "hidden md:block")}>
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[13px] leading-snug text-[hsl(var(--foreground))]/80">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--brand-primary)" aria-hidden />
            {point}
          </li>
        ))}
      </ul>
    </button>
  );
}

// Meet-style:
//  - Ahora      -> opens the call room immediately. By default nobody's phone
//                  rings: members get "X inició una reunión" and can join (or
//                  be rung one by one from inside). "Llamar a los miembros"
//                  rings everyone, like a normal call.
//  - Programar  -> collect emails + guest access mode, then EventFormModal;
//                  invites are sent only when the event is saved.
//  - Presencial -> audio-only meeting that records (and transcribes) by
//                  itself, for in-person meetings around one device.
export function NewMeetingDialog({ open, onOpenChange, defaultConversationId = null }) {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const { data } = useChatConversations();
  const { enabled: callsEnabled, isStarting, activeCall, startCall } = useCalls();
  const queryClient = useQueryClient();

  const conversations = useMemo(() => {
    const list = unwrap(data) ?? [];
    return list.filter((c) => c.type === "channel" || c.type === "group");
  }, [data]);

  const [conversationId, setConversationId] = useState(defaultConversationId ?? NEW_ROOM);
  const [mode, setMode] = useState("now"); // "now" | "schedule" | "inperson"
  const [ringMembers, setRingMembers] = useState(false);
  const [accessMode, setAccessMode] = useState("LOBBY");
  const [emails, setEmails] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [scheduled, setScheduled] = useState(null); // { targetId, link } once ready for EventFormModal
  const submittingRef = useRef(false);
  const createdRoomRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setMode("now"); setEmails([]); setError(null); setScheduled(null); setAccessMode("LOBBY");
    setConversationId(conversations.some((c) => c.id === defaultConversationId) ? defaultConversationId : NEW_ROOM);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = conversations.find((c) => c.id === conversationId) ?? null;
  const memberIds = (selected?.members ?? []).map((m) => m.userId).filter(Boolean);
  const otherMemberCount = memberIds.filter((id) => id !== userProfile?.id).length;
  // Ringing only makes sense with someone to ring; 1:1-sized rooms default to it.
  useEffect(() => {
    setRingMembers(otherMemberCount === 1);
  }, [conversationId, otherMemberCount]);

  async function resolveTargetId() {
    if (conversationId !== NEW_ROOM) return conversationId;
    if (createdRoomRef.current) return createdRoomRef.current;
    const when = new Date().toLocaleDateString([], { day: "2-digit", month: "short" });
    const room = unwrap(await runly.chat.createChannel({ title: `Reunión ${when}`, isPublic: false }, token));
    if (!room?.id) throw new Error("No se pudo crear la sala.");
    createdRoomRef.current = room.id;
    return room.id;
  }

  async function startNow({ inPerson = false } = {}) {
    if (submittingRef.current || isStarting || activeCall) return;
    const ring = !inPerson && ringMembers && otherMemberCount > 0;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const ok = await startMeeting({
        resolveTargetId,
        createLink: async (targetId) => {
          // A meeting without ringing needs no guest link to start (the
          // in-room invite card creates one on demand). Existing multi-member
          // conversations can ring without managing guest links either.
          if (!ring) return;
          if (targetId !== createdRoomRef.current && memberIds.length >= 2) return;
          if (targetId !== createdRoomRef.current) {
            const existing = unwrap(await runly.calls.getLink(targetId, token));
            if (existing?.link) return;
          }
          const result = unwrap(await runly.calls.createLink(targetId, token));
          if (!result?.link) throw new Error("No se pudo preparar el enlace de la reunión.");
        },
        startCall: (args) => startCall({
          ...args,
          kind: inPerson ? "AUDIO" : "VIDEO",
          ring,
          meetingMode: inPerson ? "inperson" : null,
        }),
        discardNewRoom: async (targetId) => {
          if (createdRoomRef.current !== targetId) return;
          await runly.chat.deleteConversation(targetId, token);
          createdRoomRef.current = null;
        },
      });
      if (ok) {
        createdRoomRef.current = null;
        onOpenChange(false);
      }
    } catch (e) {
      setError(e?.message || "No se pudo iniciar la reunión.");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      setBusy(false);
      submittingRef.current = false;
    }
  }

  async function continueToSchedule() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const targetId = await resolveTargetId();
      const created = unwrap(await runly.calls.createLink(targetId, token));
      let link = created?.link ?? null;
      if (!link) throw new Error("No se pudo generar el enlace de invitados.");
      if ((link.accessMode ?? "LOBBY") !== accessMode) {
        link = unwrap(await runly.calls.updateLink(targetId, { accessMode }, token))?.link ?? link;
      }
      setScheduled({ targetId, link });
    } catch (e) {
      toast.error(e?.message || "No se pudo preparar la reunión.");
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  // Invites go out only once the event is actually saved.
  async function sendScheduledInvites(targetId, schedule) {
    if (!emails.length) return;
    try {
      const res = unwrap(await runly.calls.sendInvites(targetId, emails, token, schedule));
      const { notice } = summarizeInviteResult(res);
      const outcome = describeInviteOutcome(res);
      if (outcome) toast.success(outcome);
      if (notice) {
        toast.message(notice.title, notice.description ? { description: notice.description } : undefined);
      }
    } catch (e) {
      toast.error(e?.message || "No se pudieron enviar las invitaciones.");
    }
  }

  if (scheduled) {
    return (
      <EventFormModal
        sourceModule="runly.chat"
        sourceEntityId={scheduled.targetId}
        initialAttendeeIds={memberIds}
        defaultVideoUrl={scheduled.link.url}
        onClose={async () => {
          // Backing out of the calendar step must not leave an orphan empty
          // room with a live, un-revoked guest join link behind.
          if (createdRoomRef.current && createdRoomRef.current === scheduled.targetId) {
            const roomId = createdRoomRef.current;
            createdRoomRef.current = null;
            await runly.chat.deleteConversation(roomId, token).catch(() => {});
          }
          setScheduled(null);
          onOpenChange(false);
        }}
        onSaved={async (savedPayload) => {
          await sendScheduledInvites(scheduled.targetId, {
            scheduledAt: savedPayload?.startAt ?? null,
            scheduledEndAt: savedPayload?.endAt ?? null,
          });
          createdRoomRef.current = null;
          const pinNote = scheduled.link.accessMode === "PIN" && scheduled.link.pin ? ` · PIN ${scheduled.link.pin}` : "";
          toast.success(`Reunión programada. ID de reunión: ${scheduled.link.meetingId ?? scheduled.link.code}${pinNote}`);
          setScheduled(null);
          onOpenChange(false);
        }}
      />
    );
  }

  const action = ACTION[mode];
  const actionDisabled = mode === "schedule" ? busy : busy || isStarting || Boolean(activeCall);
  const runAction = mode === "now" ? () => startNow() : mode === "inperson" ? () => startNow({ inPerson: true }) : continueToSchedule;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent size="2xl" scrollable className="gap-0 p-0 md:p-0">
        <DialogHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl">Nueva reunión</DialogTitle>
          <DialogDescription>Elige cómo quieres reunirte. Puedes usar una sala nueva o un canal o grupo existente.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5">
        {!callsEnabled ? (
          <p className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Las llamadas no están configuradas en esta instancia.
          </p>
        ) : (
          <div className="space-y-5">
            <SelectField
              label="Sala"
              value={conversationId}
              disabled={busy}
              onValueChange={setConversationId}
              options={[
                { value: NEW_ROOM, label: "Nueva sala de reunión", description: "Se crea un canal privado solo para esta reunión", icon: NEW_ROOM_ICON },
                ...conversations.map((c) => {
                  const name = getConversationDisplayName(c, userProfile?.id);
                  const count = c.members?.length ?? 0;
                  return {
                    value: c.id,
                    label: c.type === "channel" ? `#${name}` : name,
                    keywords: [name],
                    group: c.type === "channel" ? "Canales" : "Grupos",
                    description: `${c.type === "channel" ? "Canal" : "Grupo"}${count ? ` · ${count} ${count === 1 ? "miembro" : "miembros"}` : ""}`,
                    icon: <RoomAvatar conversation={c} name={name} />,
                  };
                }),
              ]}
            />

            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Tipo de reunión">
              {MODES.map((m) => (
                <ModeCard key={m.key} mode={m} selected={mode === m.key} disabled={busy} onSelect={() => setMode(m.key)} />
              ))}
            </div>

            {mode === "now" && otherMemberCount > 0 && (
              <div className="rounded-2xl border border-[hsl(var(--border))] p-4">
                <SwitchField
                  label="Llamar a los miembros"
                  description={ringMembers
                    ? "Sonará el timbre en los dispositivos de todos."
                    : "Nadie recibe timbre: les avisamos que la reunión empezó y pueden unirse."}
                  checked={ringMembers}
                  onChange={setRingMembers}
                  disabled={busy}
                />
              </div>
            )}

            {mode === "schedule" && (
              <div className="space-y-4 rounded-2xl border border-[hsl(var(--border))] p-4">
                <TagsField
                  label="Invitados externos por correo (opcional)"
                  placeholder="ana@empresa.com  (Enter para agregar)"
                  value={emails}
                  onChange={setEmails}
                  type="email"
                  inputMode="email"
                  normalizeItem={(v) => v.trim().toLowerCase()}
                  validateItem={(v) => (EMAIL_RE.test(v) ? null : "Correo no válido")}
                />
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-[hsl(var(--foreground))]">Acceso de invitados</span>
                  <CallAccessSettings
                    link={{ accessMode }}
                    onPatch={(patch) => patch.accessMode && setAccessMode(patch.accessMode)}
                    disabled={busy}
                  />
                </div>
              </div>
            )}

            {error && <ErrorState className="py-3" title="No se pudo iniciar la reunión" description={error} />}
            {activeCall && mode !== "schedule" && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Ya tienes una llamada en curso. Termínala antes de iniciar otra reunión.</p>
            )}
          </div>
        )}
        </div>
        {callsEnabled && (
          <div
            className="flex shrink-0 flex-col-reverse gap-3 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <p className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:block">
              {MODES.find((m) => m.key === mode)?.hint}
            </p>
            <Button size="lg" className="sm:min-w-52" onClick={runAction} disabled={actionDisabled}>
              <action.Icon className="mr-2 h-4 w-4" /> {busy ? action.busy : action.label}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
