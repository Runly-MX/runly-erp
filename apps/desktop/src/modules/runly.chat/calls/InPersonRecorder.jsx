import {
  Camera, CameraOff, Circle, Mic, MicOff, MonitorUp, Pause, Play, ScreenShareOff, Settings2, Square, SwitchCamera, Users,
} from "lucide-react";
import { Track } from "livekit-client";
import { cn } from "@runly/ui";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { TrackRenderer } from "./ParticipantTile";
import { AudioOutputPicker, DeviceSelect } from "./controls/CallDialogs";
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

// Preparation stage pickers: microphone (with the live waveform above it),
// camera when it is on, and the speaker/audio route with a test sound.
function PrepDevices({ mediaDevices, audioRoute, cameraEnabled }) {
  if (!mediaDevices) return null;
  return (
    <div className="call-dialog w-full max-w-md space-y-3 rounded-2xl p-4 text-left">
      <DeviceSelect label="Micrófono" kind="audioinput" mediaDevices={mediaDevices} emptyText="No se detectaron micrófonos." />
      {cameraEnabled && (
        <DeviceSelect label="Cámara" kind="videoinput" mediaDevices={mediaDevices} emptyText="No se detectaron cámaras." />
      )}
      <AudioOutputPicker mediaDevices={mediaDevices} audioRoute={audioRoute} />
    </div>
  );
}

// "Grabar reunión presencial": one device records the room. It opens on a
// preparation stage (pick and test the microphone, speaker and camera); the
// recording starts on "Comenzar a grabar". Pausing mutes the microphone
// instead of stopping the recording, so the meeting ends up as one continuous
// file with the paused stretch as silence. Turning on the camera and/or
// sharing the screen makes it an exposition: both are part of the recording.
export function InPersonRecorder({
  localParticipant,
  elapsed,
  engineReady = true,
  micEnabled,
  recordingActive,
  recordingBusy,
  canRecord,
  onStartRecording,
  onToggleMic,
  mediaDevices = null,
  audioRoute = null,
  onOpenDeviceSettings,
  canSwitchCamera = false,
  onSwitchCamera,
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
  const preparing = canRecord && !recordingActive;
  const paused = recordingActive && !micEnabled;
  const exposition = cameraEnabled || screenEnabled;
  const status = recordingActive
    ? paused ? "EN PAUSA" : "GRABANDO"
    : recordingBusy ? "PREPARANDO…" : canRecord ? "LISTO PARA GRABAR" : "SIN GRABAR";

  const statusPill = (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wide",
        recordingActive && !paused && "bg-red-500/15 text-red-300 ring-1 ring-red-400/30",
        paused && "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30",
        !recordingActive && "bg-white/10 text-slate-300 ring-1 ring-white/10",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", recordingActive && !paused ? "call-rec-dot bg-red-500" : paused ? "bg-amber-300" : "bg-slate-400")} aria-hidden />
      {status}
    </span>
  );

  const waveform = (
    <div className={cn("flex w-full max-w-md shrink-0 items-center justify-center gap-0.75", exposition ? "h-10" : "h-24")} aria-hidden>
      {history.map((value, index) => (
        <span
          key={index}
          className={cn("w-1.5 rounded-full transition-[height] duration-75", micEnabled ? "bg-(--brand-primary)" : "bg-slate-600")}
          style={{ height: `${Math.max(exposition ? 4 : 6, value * (exposition ? 40 : 96))}px`, opacity: 0.35 + (index / history.length) * 0.65 }}
        />
      ))}
    </div>
  );

  // Before recording the mic button is a plain mute; once recording it pauses.
  const micButton = recordingActive ? (
    <ActionButton
      icon={paused ? Play : Pause}
      label={paused ? "Reanudar" : "Pausar"}
      tone={paused ? "warn" : "default"}
      pressed={paused}
      onClick={onToggleMic}
    />
  ) : (
    <ActionButton
      icon={micEnabled ? Mic : MicOff}
      label={micEnabled ? "Silenciar" : "Activar micrófono"}
      tone={micEnabled ? "default" : "warn"}
      pressed={!micEnabled}
      onClick={onToggleMic}
    />
  );

  const showInlineDevices = preparing && !exposition;

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      <div className={cn("flex min-h-full flex-col items-center px-4 text-center", exposition ? "justify-between gap-4 py-2" : "justify-center gap-6 py-4")}>
        {exposition ? (
          <>
            <div className="flex w-full items-center justify-center gap-3">
              {statusPill}
              {recordingActive && <span className="font-mono text-2xl font-semibold tabular-nums text-white">{formatClock(elapsed)}</span>}
            </div>
            {/* Exposition preview: what goes into the recording. */}
            <div className="relative min-h-48 w-full max-w-5xl flex-1 overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
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
                {screenEnabled ? "Presentando pantalla" : "Cámara"} · {recordingActive ? "se incluye en la grabación" : "se incluirá en la grabación"}
              </span>
            </div>
            {waveform}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              {statusPill}
              {preparing ? (
                <>
                  <h2 className="text-2xl font-semibold text-white sm:text-3xl">Prepara la grabación</h2>
                  <p className="max-w-sm text-sm text-slate-400">
                    Elige el micrófono y habla para comprobar que se escucha. La grabación empieza cuando pulses «Comenzar a grabar».
                  </p>
                </>
              ) : (
                <>
                  <p className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-white sm:text-7xl">{formatClock(elapsed)}</p>
                  <p className="max-w-sm text-sm text-slate-400">
                    {paused
                      ? "En pausa: la grabación sigue, sin audio, hasta que reanudes."
                      : "Reunión presencial. Deja el dispositivo cerca de las personas que hablan."}
                  </p>
                </>
              )}
            </div>
            {waveform}
            {showInlineDevices && <PrepDevices mediaDevices={mediaDevices} audioRoute={audioRoute} cameraEnabled={cameraEnabled} />}
          </>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {preparing && (
            <ActionButton
              icon={Circle}
              label={recordingBusy ? "Preparando…" : "Comenzar a grabar"}
              tone="danger"
              disabled={recordingBusy || !engineReady}
              onClick={onStartRecording}
            />
          )}
          {micButton}
          {onToggleCamera && (
            <ActionButton
              icon={cameraEnabled ? Camera : CameraOff}
              label={cameraEnabled ? "Apagar cámara" : "Cámara"}
              tone={cameraEnabled ? "active" : "default"}
              pressed={cameraEnabled}
              onClick={onToggleCamera}
            />
          )}
          {cameraEnabled && canSwitchCamera && onSwitchCamera && (
            <ActionButton icon={SwitchCamera} label="Girar cámara" onClick={onSwitchCamera} />
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
          {onOpenDeviceSettings && !showInlineDevices && (
            <ActionButton icon={Settings2} label="Dispositivos" onClick={onOpenDeviceSettings} />
          )}
          {onInvite && <ActionButton icon={Users} label="Invitar" onClick={onInvite} />}
          <button
            type="button"
            onClick={onFinish}
            className="flex min-h-12 items-center gap-2 rounded-full bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Square className="h-4 w-4 fill-current" aria-hidden />
            {recordingActive ? "Terminar" : "Salir"}
          </button>
        </div>
        {!canRecord && (
          <p className="max-w-xs text-xs text-amber-300">
            No tienes permiso para grabar llamadas. Pide a un administrador el permiso de grabación.
          </p>
        )}
      </div>
    </div>
  );
}
