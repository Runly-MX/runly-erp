import { Camera, CameraOff, Circle, MonitorUp, Pause, Play, ScreenShareOff, Square, Users } from "lucide-react";
import { Track } from "livekit-client";
import { cn } from "@runly/ui";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { TrackRenderer } from "./ParticipantTile";
import { formatClock } from "./ui/callTheme";

function ActionButton({ icon: Icon, label, onClick, tone = "default", disabled = false, pressed }) {
  const tones = {
    default: "bg-white/10 text-white hover:bg-white/15",
    active: "bg-(--call-accent) text-(--brand-primary-foreground) hover:bg-(--call-accent-hover)",
    warn: "bg-amber-400 text-amber-950 hover:bg-amber-300",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn("flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors disabled:opacity-50", tones[tone])}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

// "Grabar reunión presencial": one device records the room. Pausing mutes
// the microphone instead of stopping the recording, so the meeting ends up
// as one continuous file with the paused stretch as silence. Turning on the
// camera and/or sharing the screen makes it an exposition: both are part of
// the recording.
export function InPersonRecorder({
  localParticipant,
  elapsed,
  micEnabled,
  recordingActive,
  recordingBusy,
  canRecord,
  onStartRecording,
  onToggleMic,
  cameraEnabled = false,
  onToggleCamera,
  screenEnabled = false,
  screenShareSupported = false,
  onToggleScreen,
  mirror = true,
  onFinish,
  onInvite,
}) {
  const micTrack = localParticipant?.getTrackPublication?.(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
  const { history } = useAudioLevel(micEnabled ? micTrack : null);
  const paused = !micEnabled;
  const exposition = cameraEnabled || screenEnabled;
  const status = !recordingActive
    ? recordingBusy ? "PREPARANDO…" : "SIN GRABAR"
    : paused ? "EN PAUSA" : "GRABANDO";

  const statusPill = (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
        recordingActive && !paused && "bg-red-500/15 text-red-300 ring-1 ring-red-400/30",
        recordingActive && paused && "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30",
        !recordingActive && "bg-white/10 text-slate-300 ring-1 ring-white/10",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", recordingActive && !paused ? "call-rec-dot bg-red-500" : paused ? "bg-amber-300" : "bg-slate-400")} aria-hidden />
      {status}
    </span>
  );

  const waveform = (
    <div className={cn("flex w-full max-w-md items-center justify-center gap-0.75", exposition ? "h-10" : "h-24")} aria-hidden>
      {history.map((value, index) => (
        <span
          key={index}
          className={cn("w-1.5 rounded-full transition-[height] duration-75", micEnabled ? "bg-(--brand-primary)" : "bg-slate-600")}
          style={{ height: `${Math.max(exposition ? 4 : 6, value * (exposition ? 40 : 96))}px`, opacity: 0.35 + (index / history.length) * 0.65 }}
        />
      ))}
    </div>
  );

  return (
    <div className={cn("flex h-full flex-col items-center px-4 text-center", exposition ? "justify-between gap-4 py-2" : "justify-center gap-8")}>
      {exposition ? (
        <>
          <div className="flex w-full items-center justify-center gap-3">
            {statusPill}
            <span className="font-mono text-2xl font-semibold tabular-nums text-white">{formatClock(elapsed)}</span>
          </div>
          {/* Exposition preview: what goes into the recording. */}
          <div className="relative min-h-0 w-full max-w-5xl flex-1 overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
            {screenEnabled ? (
              <TrackRenderer participant={localParticipant} source={Track.Source.ScreenShare} muted fit="contain" />
            ) : (
              <TrackRenderer participant={localParticipant} source={Track.Source.Camera} muted mirror={mirror} fit="contain" />
            )}
            {screenEnabled && cameraEnabled && (
              <div className="absolute bottom-3 right-3 aspect-video w-[26%] max-w-64 overflow-hidden rounded-2xl ring-2 ring-white/20 shadow-2xl">
                <TrackRenderer participant={localParticipant} source={Track.Source.Camera} muted mirror={mirror} fit="cover" />
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {screenEnabled ? "Presentando pantalla" : "Cámara"} · se incluye en la grabación
            </span>
          </div>
          {waveform}
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3">
            {statusPill}
            <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-white sm:text-7xl">{formatClock(elapsed)}</p>
            <p className="max-w-sm text-sm text-slate-400">
              {paused
                ? "En pausa: la grabación sigue, sin audio, hasta que reanudes."
                : "Reunión presencial. Deja el dispositivo cerca de las personas que hablan."}
            </p>
          </div>
          {waveform}
        </>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {canRecord && !recordingActive && !recordingBusy && (
          <ActionButton icon={Circle} label="Grabar" tone="danger" onClick={onStartRecording} />
        )}
        <ActionButton
          icon={paused ? Play : Pause}
          label={paused ? "Reanudar" : "Pausar"}
          tone={paused ? "warn" : "default"}
          pressed={paused}
          onClick={onToggleMic}
        />
        {onToggleCamera && (
          <ActionButton
            icon={cameraEnabled ? Camera : CameraOff}
            label={cameraEnabled ? "Apagar cámara" : "Cámara"}
            tone={cameraEnabled ? "active" : "default"}
            pressed={cameraEnabled}
            onClick={onToggleCamera}
          />
        )}
        {onToggleScreen && (
          <ActionButton
            icon={screenEnabled ? ScreenShareOff : MonitorUp}
            label={screenEnabled ? "Dejar de presentar" : "Presentar pantalla"}
            tone={screenEnabled ? "active" : "default"}
            pressed={screenEnabled}
            disabled={!screenShareSupported && !screenEnabled}
            onClick={onToggleScreen}
          />
        )}
        {onInvite && <ActionButton icon={Users} label="Invitar" onClick={onInvite} />}
        <button
          type="button"
          onClick={onFinish}
          className="flex min-h-12 items-center gap-2 rounded-full bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          <Square className="h-4 w-4 fill-current" aria-hidden />
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
