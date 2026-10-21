import { useState } from "react";
import { cn } from "@runly/ui";
import { Check, ChevronDown, Copy, LayoutGrid, Maximize2, Minimize2, Phone, Sparkles, SwitchCamera, UserPlus, Users, Volume2, Wifi, WifiOff } from "lucide-react";
import { ConnectionQuality } from "livekit-client";
import { formatClock } from "../ui/callTheme";

const LAYOUTS = [
  { value: "auto", label: "Auto", Icon: Sparkles },
  { value: "focus", label: "Foco", Icon: Maximize2 },
  { value: "grid", label: "Cuadrícula", Icon: LayoutGrid },
];

// The single recording status of the room: REC / EN PAUSA (in-person recorder
// with the mic paused) / idleLabel (in-person recorder not started yet, so a
// running "EN VIVO" clock doesn't read as a recording).
function StatusPill({ status, elapsed, recordingActive, recordingPaused = false, recordingElapsed, idleLabel = null }) {
  if (recordingActive) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ring-1",
          recordingPaused ? "bg-amber-400/15 text-amber-200 ring-amber-300/30" : "bg-red-500/15 text-red-300 ring-red-400/30",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", recordingPaused ? "bg-amber-300" : "call-rec-dot bg-red-500")} aria-hidden />
        {recordingPaused ? "EN PAUSA" : "REC"} <span className="font-mono font-semibold tabular-nums">{formatClock(recordingElapsed)}</span>
      </span>
    );
  }
  if (idleLabel && status === "connected") {
    return (
      <span role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-300 ring-1 ring-white/10">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
        {idleLabel}
      </span>
    );
  }
  if (status !== "connected") {
    const label = status === "reconnecting" ? "Reconectando" : status === "failed" ? "Sin conexión" : status === "ringing" ? "Llamando" : "Conectando";
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/25" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" aria-hidden />
        {label}…
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
      <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
      EN VIVO <span className="font-mono tabular-nums text-emerald-100/90">{formatClock(elapsed)}</span>
    </span>
  );
}

function MeetingIdChip({ meetingId }) {
  const [copied, setCopied] = useState(false);
  if (!meetingId) return null;
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(meetingId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      title="Copiar ID de reunión"
      className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-xs text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
    >
      {meetingId}
      {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}

function NetworkBadge({ quality }) {
  if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Unknown || quality == null) return null;
  const bad = quality === ConnectionQuality.Lost;
  return (
    <span
      title={bad ? "Conexión perdida" : "Conexión inestable"}
      className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium ring-1", bad ? "bg-red-500/15 text-red-300 ring-red-400/30" : "bg-amber-400/10 text-amber-200 ring-amber-300/20")}
    >
      {bad ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
      <span className="hidden lg:inline">{bad ? "Sin señal" : "Señal débil"}</span>
    </span>
  );
}

// Desktop top bar.
export function CallTopBar({ title, subtitle, status, elapsed, recordingActive, recordingPaused = false, recordingElapsed, idleLabel = null, meetingId, quality, layoutPref, onLayoutChange, canInvite, onInvite, lobbyCount = 0, onMinimize, hidden = false }) {
  return (
    <header
      data-hidden={hidden}
      className="call-chrome call-chrome-top flex shrink-0 items-center gap-3 px-4 pb-3"
      style={{ paddingTop: "calc(0.75rem + var(--sat))" }}
    >
      <StatusPill status={status} elapsed={elapsed} recordingActive={recordingActive} recordingPaused={recordingPaused} recordingElapsed={recordingElapsed} idleLabel={idleLabel} />
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold leading-tight text-white">{title}</h1>
        {subtitle && <p className="truncate text-xs text-white/55">{subtitle}</p>}
      </div>
      <MeetingIdChip meetingId={meetingId} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <NetworkBadge quality={quality} />
        {onLayoutChange && (
          <div role="radiogroup" aria-label="Diseño" className="hidden items-center rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/10 lg:flex">
            {LAYOUTS.map(({ value, label, Icon }) => {
              const active = layoutPref === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onLayoutChange(value)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors",
                    active ? "bg-white/15 text-white" : "text-white/60 hover:text-white",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                </button>
              );
            })}
          </div>
        )}
        {canInvite && (
          <button
            type="button"
            onClick={onInvite}
            className="relative flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.08] px-3 text-sm font-semibold text-white ring-1 ring-white/10 transition-colors hover:bg-white/15"
          >
            <UserPlus className="h-4 w-4" /> Invitar
            {lobbyCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--call-hand) px-1 text-[10px] font-bold text-amber-950 ring-2 ring-(--call-stage)">
                {lobbyCount}
              </span>
            )}
          </button>
        )}
        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            title="Minimizar llamada"
            aria-label="Minimizar llamada"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </header>
  );
}

// Phone top bar: minimize, title + clock + ID, quick camera flip and invite.
export function MobileCallTopBar({ title, status, elapsed, recordingActive, recordingPaused = false, recordingElapsed, idleLabel = null, meetingId, onMinimize, canSwitchCamera, onSwitchCamera, speaker = null, canInvite, onInvite, onOpenPeople, lobbyCount = 0, hidden = false, dragHandlers = null }) {
  const clock = recordingActive
    ? `${recordingPaused ? "En pausa · " : ""}${formatClock(recordingElapsed)}`
    : idleLabel ?? formatClock(elapsed);
  const statusText = status === "connected" ? clock :status === "reconnecting" ? "Reconectando…" : status === "ringing" ? "Llamando…" : status === "failed" ? "Sin conexión" : "Conectando…";
  return (
    <header
      data-hidden={hidden}
      className="call-chrome call-chrome-top flex shrink-0 items-center gap-2 px-3 pb-2"
      style={{ paddingTop: "calc(0.5rem + var(--sat))" }}
      {...(dragHandlers ?? {})}
    >
      {onMinimize ? (
        <button type="button" onClick={onMinimize} aria-label="Minimizar llamada" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] ring-1 ring-white/10 active:bg-white/15">
          <ChevronDown className="h-5 w-5" />
        </button>
      ) : <span className="h-10 w-10 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1 text-center">
        <p className="flex items-center justify-center gap-1.5 truncate text-sm font-semibold">
          {recordingActive && (recordingPaused
            ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-label="Grabación en pausa" />
            : <span className="call-rec-dot h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Grabando" />)}
          <span className="truncate">{title}</span>
        </p>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/60">
          <span className="font-mono tabular-nums">{statusText}</span>
          {meetingId && <><span aria-hidden>·</span><span className="truncate font-mono">{meetingId}</span></>}
        </p>
      </div>
      {speaker && (
        <button
          type="button"
          onClick={speaker.toggle}
          aria-pressed={speaker.speakerOn}
          aria-label={speaker.speakerOn ? "Desactivar altavoz" : "Activar altavoz"}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 active:brightness-110",
            speaker.speakerOn ? "bg-white text-slate-900 ring-transparent" : "bg-white/[0.08] ring-white/10 active:bg-white/15",
          )}
        >
          {speaker.speakerOn ? <Volume2 className="h-[18px] w-[18px]" /> : <Phone className="h-[18px] w-[18px]" />}
        </button>
      )}
      {canSwitchCamera ? (
        <button type="button" onClick={onSwitchCamera} aria-label="Girar cámara" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] ring-1 ring-white/10 active:bg-white/15">
          <SwitchCamera className="h-[18px] w-[18px]" />
        </button>
      ) : <span className="h-10 w-10 shrink-0" aria-hidden />}
      {(canInvite || onOpenPeople) ? (
      <button
        type="button"
        onClick={canInvite ? onInvite : onOpenPeople}
        aria-label={canInvite ? "Invitar personas" : "Personas"}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--call-accent) text-(--brand-primary-foreground) active:brightness-110"
      >
        {canInvite ? <UserPlus className="h-[18px] w-[18px]" /> : <Users className="h-[18px] w-[18px]" />}
        {lobbyCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--call-hand) px-1 text-[10px] font-bold text-amber-950 ring-2 ring-(--call-stage)">
            {lobbyCount}
          </span>
        )}
      </button>
      ) : <span className="h-10 w-10 shrink-0" aria-hidden />}
    </header>
  );
}

