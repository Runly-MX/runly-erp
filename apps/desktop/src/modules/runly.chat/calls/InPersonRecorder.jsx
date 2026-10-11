import { Mic, MicOff, Pause, Play, Square, Users } from "lucide-react";
import { Track } from "livekit-client";
import { cn } from "@runly/ui";
import { useAudioLevel } from "./hooks/useAudioLevel";

function formatClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// "Grabar reunión presencial": the phone/laptop sits on the table and records
// the room. One big clock, a live waveform of the microphone, and the three
// actions that matter (pause/resume recording, mute, finish).
export function InPersonRecorder({
  localParticipant,
  elapsed,
  micEnabled,
  recordingActive,
  recordingBusy,
  canRecord,
  onToggleRecording,
  onToggleMic,
  onFinish,
  onInvite,
}) {
  const micTrack = localParticipant?.getTrackPublication?.(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
  const { history } = useAudioLevel(micEnabled ? micTrack : null);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
            recordingActive ? "bg-red-500/15 text-red-300 ring-1 ring-red-400/30" : "bg-white/10 text-slate-300 ring-1 ring-white/10",
          )}
          role="status"
          aria-live="polite"
        >
          <span className={cn("h-2 w-2 rounded-full", recordingActive ? "animate-pulse bg-red-500" : "bg-slate-400")} aria-hidden />
          {recordingActive ? "GRABANDO" : recordingBusy ? "PREPARANDO..." : "EN PAUSA"}
        </span>
        <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-white sm:text-7xl">
          {formatClock(elapsed)}
        </p>
        <p className="max-w-xs text-sm text-slate-400">
          Reunión presencial. Deja el dispositivo cerca de las personas que hablan.
        </p>
      </div>

      <div className="flex h-24 w-full max-w-md items-center justify-center gap-[3px]" aria-hidden>
        {history.map((value, index) => (
          <span
            key={index}
            className={cn(
              "w-1.5 rounded-full transition-[height] duration-75",
              micEnabled ? "bg-[var(--brand-primary)]" : "bg-slate-600",
            )}
            style={{ height: `${Math.max(6, value * 96)}px`, opacity: 0.35 + (index / history.length) * 0.65 }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleMic}
          aria-pressed={!micEnabled}
          className={cn(
            "flex min-h-[48px] items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors",
            micEnabled ? "bg-white/10 text-white hover:bg-white/15" : "bg-red-500/90 text-white hover:bg-red-500",
          )}
        >
          {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          {micEnabled ? "Micrófono" : "Silenciado"}
        </button>
        {canRecord && (
          <button
            type="button"
            onClick={onToggleRecording}
            disabled={recordingBusy}
            className="flex min-h-[48px] items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            {recordingActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {recordingActive ? "Pausar" : "Reanudar"}
          </button>
        )}
        {onInvite && (
          <button
            type="button"
            onClick={onInvite}
            className="flex min-h-[48px] items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            <Users className="h-4 w-4" />
            Invitar
          </button>
        )}
        <button
          type="button"
          onClick={onFinish}
          className="flex min-h-[48px] items-center gap-2 rounded-full bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          <Square className="h-4 w-4 fill-current" />
          Terminar
        </button>
      </div>
      {!canRecord && (
        <p className="max-w-xs text-xs text-amber-300">
          No tienes permiso para grabar llamadas. Pide a un administrador el permiso de grabación.
        </p>
      )}
    </div>
  );
}
