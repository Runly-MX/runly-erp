import { useState } from "react";
import {
  MapPin,
  Video,
  Calendar,
  Clock,
  Users,
  Repeat,
  Edit2,
  Trash2,
  BellRing,
} from "lucide-react";
import { useDeleteEvent } from "../hooks/useCalendarData";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  MarkdownViewer,
  ConfirmDialog,
  Skeleton,
} from "@runly/ui";
import {
  formatReminderClock,
  formatReminderLead,
  getPrimaryReminderMinutes,
} from "../lib/reminder-utils";
import { MeetingJoinButton } from "../../runly.chat/calls/MeetingJoinButton";
import ProjectTaskCard from "./ProjectTaskCard";

const DAY_MS = 24 * 60 * 60 * 1000;
const FULL_DATE = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
const SHORT_DATE = { weekday: "short", day: "numeric", month: "short" };
const TIME = { hour: "2-digit", minute: "2-digit", hour12: false };

// All-day events are stored as UTC midnight with an inclusive endAt: read them in UTC,
// or a Mexico viewer sees the day before.
function describeWhen(event) {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;

  if (event.allDay) {
    const fmt = (d, opts) => d.toLocaleDateString("es-MX", { timeZone: "UTC", ...opts });
    const days = end ? Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / DAY_MS) + 1 : 1;
    if (days <= 1) return { primary: fmt(start, FULL_DATE), secondary: "Todo el día" };
    return {
      primary: `${fmt(start, SHORT_DATE)} – ${fmt(end, FULL_DATE)}`,
      secondary: `Todo el día · ${days} días`,
    };
  }

  const date = (d, opts) => d.toLocaleDateString("es-MX", opts);
  const time = (d) => d.toLocaleTimeString("es-MX", TIME);
  if (end && date(end, {}) !== date(start, {})) {
    return {
      primary: `${date(start, SHORT_DATE)}, ${time(start)}`,
      secondary: `hasta ${date(end, SHORT_DATE)}, ${time(end)}`,
    };
  }
  return {
    primary: date(start, FULL_DATE),
    secondary: end ? `${time(start)} – ${time(end)}` : time(start),
  };
}

// Where "today" sits relative to the event: upcoming / in progress (day k of n) / finished.
function describeProgress(event) {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : start;
  const now = new Date();
  const day = (d, utc) =>
    utc
      ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const s = day(start, event.allDay);
  const e = day(end, event.allDay);
  const today = day(now, false);
  const total = Math.round((e - s) / DAY_MS) + 1;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  if (today < s) {
    const n = Math.round((s - today) / DAY_MS);
    return { tone: "upcoming", label: n === 1 ? "Empieza mañana" : `Empieza en ${plural(n, "día")}`, total };
  }
  if (today > e) return { tone: "past", label: "Finalizado", total };
  const k = Math.round((today - s) / DAY_MS) + 1;
  if (total === 1) return { tone: "live", label: "Hoy", total };
  const left = total - k;
  return {
    tone: "live",
    label: `En curso · Día ${k} de ${total}${left === 0 ? " (último día)" : ` · quedan ${plural(left, "día")}`}`,
    total,
  };
}

function formatDuration(event) {
  if (event.allDay || !event.endAt) return null;
  const mins = Math.round((new Date(event.endAt) - new Date(event.startAt)) / 60000);
  if (mins <= 0 || mins >= 24 * 60) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

const PROGRESS_TONES = {
  upcoming: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
  live: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  past: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] opacity-70",
};

const STATUS_LABELS = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  DECLINED: "Rechazado",
};

const RECURRENCE_LABELS = {
  DAILY: "Se repite diariamente",
  WEEKLY: "Se repite semanalmente",
  MONTHLY: "Se repite mensualmente",
  YEARLY: "Se repite anualmente",
};

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {label}
        </div>
        <div className="mt-0.5 break-words text-sm text-[hsl(var(--foreground))]">{children}</div>
      </div>
    </div>
  );
}

const ACTION_BTN =
  "rounded-md p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40 disabled:pointer-events-none disabled:opacity-40";

export default function EventDetailModal({
  event,
  onClose,
  onEdit,
  canEdit,
  canDelete,
}) {
  const deleteEvent = useDeleteEvent();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!event) return null;

  if (event._isLoading) {
    return (
      <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent size="lg">
          <DialogTitle className="sr-only">Cargando evento</DialogTitle>
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const calColor = event.color || event.calendar?.color || "#6B46C1";
  const reminderMinutes = getPrimaryReminderMinutes(event);
  const reminderClock = formatReminderClock(event, reminderMinutes);
  const isChatMeeting = event.sourceModule === "runly.chat" && Boolean(event.sourceEntityId);
  const deleteTitle = event._isRecurrenceInstance ? "Eliminar serie" : "Eliminar evento";
  const deleteDescription = event._isRecurrenceInstance
    ? "¿Eliminar todos los eventos de esta serie?"
    : "¿Eliminar este evento?";
  const when = describeWhen(event);
  const progress = describeProgress(event);
  const duration = formatDuration(event);
  const accepted = event.attendees?.filter((a) => a.status === "ACCEPTED").length ?? 0;
  const pending = event.attendees?.filter((a) => a.status === "PENDING").length ?? 0;
  const showDelete = canDelete && !event.sourceModule;

  async function doDelete() {
    try {
      await deleteEvent.mutateAsync(event._baseEventId ?? event.id);
      toast.success("Evento eliminado", { description: "Si fue un error, recupéralo en Calendario > Desactivados." });
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      toast.error(err.message || "Error al eliminar el evento");
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent size="lg">
          <div className="space-y-4">
            {/* Header: calendar chip + actions on one row, then the title.
                Actions keep clear of the dialog's close (X) on desktop (md:pr-8);
                on the phone sheet there is no X so they sit flush right. */}
            <div className="space-y-2 md:pr-8">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: `${calColor}22`, color: calColor }}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: calColor }} />
                  <span className="truncate">{event.calendar?.name ?? "Evento"}</span>
                </span>
                <div className="ml-auto flex items-center gap-0.5">
                  {canEdit && (
                    <button type="button" onClick={() => onEdit(event)} className={ACTION_BTN} title={event._isRecurrenceInstance ? "Editar serie" : "Editar"}>
                      <Edit2 size={16} />
                    </button>
                  )}
                  {showDelete && (
                    <button type="button" onClick={() => setConfirmOpen(true)} disabled={deleteEvent.isPending} className={ACTION_BTN} title={event._isRecurrenceInstance ? "Eliminar serie" : "Eliminar"}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              <DialogTitle className="text-xl font-semibold leading-snug break-words">
                {event.title}
              </DialogTitle>
            </div>

            {/* When: the key fact, shown prominently with the calendar colour. */}
            <div className="flex items-start gap-3">
              <Clock size={18} className="mt-0.5 shrink-0" style={{ color: calColor }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold first-letter:uppercase break-words">{when.primary}</div>
                <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {when.secondary}
                  {duration ? ` · ${duration}` : ""}
                </div>
                <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PROGRESS_TONES[progress.tone]}`}>
                  {progress.label}
                </span>
              </div>
            </div>

            {isChatMeeting && (
              <MeetingJoinButton
                conversationId={event.sourceEntityId}
                calendarEventId={event._baseEventId ?? event.id}
                startAt={event.startAt}
                endAt={event.endAt}
                onDone={onClose}
              />
            )}

            {event.sourceModule === "runly.projects" && event.sourceEntityId && (
              <ProjectTaskCard taskId={event.sourceEntityId} onNavigate={onClose} />
            )}

            {event.description && (
              <MarkdownViewer value={event.description} accentColor={calColor} />
            )}

            <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))]">
              {event.location && <InfoRow icon={MapPin} label="Ubicación">{event.location}</InfoRow>}

              {event.videoUrl && (
                <InfoRow icon={Video} label="Videollamada">
                  <a href={event.videoUrl} target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">
                    {isChatMeeting ? "Enlace para invitados externos" : "Unirse a la videollamada"}
                  </a>
                </InfoRow>
              )}

              {event.calendar && <InfoRow icon={Calendar} label="Calendario">{event.calendar.name}</InfoRow>}

              {event.recurrenceRule && (
                <InfoRow icon={Repeat} label="Repetición">
                  {RECURRENCE_LABELS[event.recurrenceRule.freq]}
                  {event.recurrenceRule.interval > 1 && ` cada ${event.recurrenceRule.interval}`}
                </InfoRow>
              )}

              {reminderMinutes !== null && (
                <InfoRow icon={BellRing} label="Recordatorio">
                  {formatReminderLead(reminderMinutes)}
                  {reminderClock ? ` (${reminderClock})` : ""}
                </InfoRow>
              )}

              {event.attendees?.length > 0 && (
                <InfoRow icon={Users} label={`Invitados (${event.attendees.length})`}>
                  <div className="mb-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {accepted} aceptado{accepted === 1 ? "" : "s"} · {pending} pendiente{pending === 1 ? "" : "s"}
                  </div>
                  <div className="space-y-1.5">
                    {event.attendees.map((att) => (
                      <div key={att.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{att.user?.firstName} {att.user?.lastName}</span>
                        <span className="shrink-0 rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                          {STATUS_LABELS[att.status] ?? att.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </InfoRow>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Eliminar"
        loading={deleteEvent.isPending}
        onConfirm={doDelete}
      />
    </>
  );
}
