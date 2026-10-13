import {
  Camera, CameraOff, Circle, Mic, MicOff, MonitorUp, Pause, Play, ScreenShareOff, Settings2, Square, SwitchCamera, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Track } from "livekit-client";
import { cn } from "@runly/ui";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { TrackRenderer } from "./ParticipantTile";
import { AudioOutputPicker, DeviceSelect } from "./controls/CallDialogs";
import { formatClock } from "./ui/callTheme";
import { LANDSCAPE, useVideoAspectVersion, videoAspectOf } from "./lib/videoAspect";

// Largest box with the video's own aspect ratio that fits the available area,
// so the preview never shows letterbox bars nor grows over the controls. Sized
// from a measured box (container query units were not reliable on mobile
// WebKit: the in-flow <video> then took its natural portrait height).
function FitFrame({ ratio, className = "", children }) {
  const r = ratio || LANDSCAPE;
  const [box, setBox] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!box) return undefined;
    const measure = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(box);
    return () => observer?.disconnect();
  }, [box]);
  const width = Math.min(size.width, size.height * r);
  const height = width / r;
  return (
    <div ref={setBox} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
      {width > 0 && height > 0 && (
        <div
          className={cn("relative shrink-0 overflow-hidden rounded-3xl bg-black ring-1 ring-white/10", className)}
          style={{ width: Math.floor(width), height: Math.floor(height) }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

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
  useVideoAspectVersion();
  const cameraRatio = videoAspectOf(localParticipant, Track.Source.Camera);
  const screenRatio = videoAspectOf(localParticipant, Track.Source.ScreenShare);
  const preparing = canRecord && !recordingActive;
  const paused = recordingActive && !micEnabled;
  const exposition = cameraEnabled || screenEnabled;
  // The recording status (REC / EN PAUSA / LISTO PARA GRABAR) is shown once,
  // in the call top bar — see CallRoomLayout idleLabel / recordingPaused.

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
    <div className={cn("h-full overscroll-contain", exposition ? "overflow-hidden" : "overflow-y-auto")}>
      <div className={cn("flex flex-col items-center px-4 text-center", exposition ? "h-full gap-3 pb-2 pt-1" : "min-h-full justify-center gap-6 py-4")}>
        {exposition ? (
          <>
            {/* Exposition preview: what goes into the recording. Its status
                lives in the top bar (REC / EN PAUSA), so the preview takes
                all the height. Screen + camera: the camera sits beside the
                screen (overlaid in a corner on narrow screens). */}
            <div className="flex min-h-0 w-full flex-1 items-stretch gap-3">
              <FitFrame ratio={screenEnabled ? screenRatio : cameraRatio}>
                {screenEnabled ? (
                  <TrackRenderer participant={localParticipant} source={Track.Source.ScreenShare} muted fit="contain" className="absolute inset-0" />
                ) : (
                  <TrackRenderer participant={localParticipant} source={Track.Source.Camera} muted mirror={mirror} fit="cover" className="absolute inset-0" />
                )}
                {screenEnabled && cameraEnabled && (
                  <div
                    className="absolute bottom-3 right-3 w-[26%] max-w-56 overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/20 lg:hidden"
                    style={{ aspectRatio: cameraRatio || LANDSCAPE }}
                  >
                    <TrackRenderer participant={localParticipant} source={Track.Source.Camera} muted mirror={mirror} fit="cover" />
                  </div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                  {screenEnabled ? "Presentando pantalla" : "Cámara"} · {recordingActive ? "se incluye en la grabación" : "se incluirá en la grabación"}
                </span>
              </FitFrame>
              {screenEnabled && cameraEnabled && (
                <div className="hidden w-60 shrink-0 flex-col justify-end lg:flex xl:w-72">
                  <div className="w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10" style={{ aspectRatio: cameraRatio || LANDSCAPE }}>
                    <TrackRenderer participant={localParticipant} source={Track.Source.Camera} muted mirror={mirror} fit="cover" />
                  </div>
                </div>
              )}
            </div>
            {waveform}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
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
