import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, SelectField, TagsField, ErrorState, SwitchField,
} from "@runly/ui";
import { Video, Calendar, Mic } from "lucide-react";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEW_ROOM = "__new__";

const MODES = [
  { key: "now", label: "Ahora", hint: "Entra ya y espera a los demás", Icon: Video },
  { key: "schedule", label: "Programar", hint: "Elige fecha y hora", Icon: Calendar },
  { key: "inperson", label: "Presencial", hint: "Graba una reunión en sala", Icon: Mic },
];

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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent size="sm" scrollable>
        <DialogHeader><DialogTitle>Nueva reunión</DialogTitle></DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
        {!callsEnabled ? (
          <p className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Las llamadas no están configuradas en esta instancia.
          </p>
        ) : (
          <div className="space-y-4">
            <SelectField
              label="Sala"
              value={conversationId}
              disabled={busy}
              onValueChange={setConversationId}
              options={[
                { value: NEW_ROOM, label: "➕ Nueva sala de reunión" },
                ...conversations.map((c) => ({
                  value: c.id,
                  label: getConversationDisplayName(c, userProfile?.id),
                })),
              ]}
            />

            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de reunión">
              {MODES.map(({ key, label, hint, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mode === key}
                  disabled={busy}
                  onClick={() => setMode(key)}
                  className={[
                    "flex min-h-[84px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)",
                    mode === key
                      ? "border-(--brand-primary) bg-(--brand-soft)"
                      : "border-border hover:border-(--brand-primary)/40",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 text-[hsl(var(--foreground))]" aria-hidden />
                  <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</span>
                  <span className="text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">{hint}</span>
                </button>
              ))}
            </div>

            {mode === "now" && otherMemberCount > 0 && (
              <SwitchField
                label="Llamar a los miembros"
                description={ringMembers
                  ? "Sonará el timbre en los dispositivos de todos."
                  : "Nadie recibe timbre: les avisamos que la reunión empezó y pueden unirse. Desde la llamada puedes llamar a quien quieras."}
                checked={ringMembers}
                onChange={setRingMembers}
                disabled={busy}
              />
            )}

            {mode === "inperson" && (
              <p className="rounded-xl bg-[hsl(var(--muted))]/60 px-3 py-2.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                Inicia una reunión solo de audio que se graba y transcribe automáticamente. Nadie recibe timbre.
                Deja el dispositivo cerca de quienes hablan; al terminar, la grabación queda en la conversación.
              </p>
            )}

            {mode === "schedule" && (
              <>
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
              </>
            )}

            {error && <ErrorState className="py-3" title="No se pudo iniciar la reunión" description={error} />}
            {activeCall && <p className="text-sm text-muted-foreground">Ya tienes una llamada en curso. Termínala antes de iniciar otra reunión.</p>}
            <div className="flex justify-end pt-1">
              {mode === "now" ? (
                <Button onClick={() => startNow()} disabled={busy || isStarting || Boolean(activeCall)}>
                  <Video className="mr-2 h-4 w-4" /> {busy ? "Abriendo..." : "Iniciar reunión"}
                </Button>
              ) : mode === "inperson" ? (
                <Button onClick={() => startNow({ inPerson: true })} disabled={busy || isStarting || Boolean(activeCall)}>
                  <Mic className="mr-2 h-4 w-4" /> {busy ? "Abriendo..." : "Empezar a grabar"}
                </Button>
              ) : (
                <Button onClick={continueToSchedule} disabled={busy}>
                  <Calendar className="mr-2 h-4 w-4" /> {busy ? "Preparando..." : "Continuar"}
                </Button>
              )}
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
