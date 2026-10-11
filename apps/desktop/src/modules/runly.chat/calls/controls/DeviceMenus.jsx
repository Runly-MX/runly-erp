import {
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
} from "@runly/ui";
import { Flashlight, FlashlightOff, Settings2, SwitchCamera, Volume2 } from "lucide-react";
import { Track } from "livekit-client";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { CALL_SOUND_URLS } from "../callSounds";

// Plays the join chime on the chosen speaker (setSinkId when supported).
function testSpeaker(deviceId) {
  try {
    const audio = new Audio(CALL_SOUND_URLS.join);
    audio.volume = 0.8;
    const play = () => audio.play().catch(() => {});
    if (deviceId && typeof audio.setSinkId === "function") audio.setSinkId(deviceId).then(play, play);
    else play();
  } catch { /* no audio output available */ }
}

export function MicLevelMeter({ room, enabled }) {
  const track = enabled
    ? room?.localParticipant?.getTrackPublication?.(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null
    : null;
  const { level } = useAudioLevel(track, { historySize: 1 });
  const bars = 12;
  const lit = Math.round(level * bars);
  return (
    <div className="flex items-center gap-[3px] px-2 py-1.5" aria-label="Nivel del micrófono">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 rounded-full transition-colors duration-75 ${i < lit ? (i > 9 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

function DeviceRadioList({ title, kind, mediaDevices, emptyText }) {
  const list = mediaDevices.devices[kind] ?? [];
  return (
    <>
      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-white/50">{title}</DropdownMenuLabel>
      {list.length ? (
        <DropdownMenuRadioGroup value={mediaDevices.active[kind] ?? list[0]?.deviceId} onValueChange={(id) => mediaDevices.select(kind, id)}>
          {list.map((device) => (
            <DropdownMenuRadioItem key={device.deviceId} value={device.deviceId} className="pr-3">
              <span className="truncate">{device.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      ) : (
        <p className="px-2 py-1.5 text-xs text-white/50">{emptyText}</p>
      )}
    </>
  );
}

// Content of the microphone ▾ menu: input + output pickers and a level meter.
export function MicDeviceMenu({ room, micEnabled, mediaDevices, onOpenSettings, audioRoute = null }) {
  return (
    <>
      <DeviceRadioList title="Micrófono" kind="audioinput" mediaDevices={mediaDevices} emptyText="No se detectaron micrófonos." />
      <MicLevelMeter room={room} enabled={micEnabled} />
      {audioRoute?.supported ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-white/50">Salida de audio</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={audioRoute.active ?? ""} onValueChange={audioRoute.select}>
            {audioRoute.routes.map((route) => (
              <DropdownMenuRadioItem key={route.id} value={route.id}>{route.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </>
      ) : mediaDevices.outputSupported ? (
        <>
          <DropdownMenuSeparator />
          <DeviceRadioList title="Altavoz" kind="audiooutput" mediaDevices={mediaDevices} emptyText="Usando el altavoz del sistema." />
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); testSpeaker(mediaDevices.active.audiooutput); }}>
        <Volume2 className="mr-2 h-4 w-4" /> Probar altavoz
      </DropdownMenuItem>
      {onOpenSettings && (
        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings2 className="mr-2 h-4 w-4" /> Configuración de audio y video
        </DropdownMenuItem>
      )}
    </>
  );
}

// Content of the camera ▾ menu: camera picker plus phone-only flip/torch.
export function CameraDeviceMenu({ mediaDevices, canSwitchCamera, onSwitchCamera, torchSupported, torchEnabled, onToggleTorch, onOpenSettings }) {
  return (
    <>
      <DeviceRadioList title="Cámara" kind="videoinput" mediaDevices={mediaDevices} emptyText="No se detectaron cámaras." />
      {(canSwitchCamera || torchSupported) && <DropdownMenuSeparator />}
      {canSwitchCamera && onSwitchCamera && (
        <DropdownMenuItem onSelect={onSwitchCamera}>
          <SwitchCamera className="mr-2 h-4 w-4" /> Cambiar cámara frontal / trasera
        </DropdownMenuItem>
      )}
      {torchSupported && (
        <DropdownMenuItem onSelect={onToggleTorch}>
          {torchEnabled ? <FlashlightOff className="mr-2 h-4 w-4" /> : <Flashlight className="mr-2 h-4 w-4" />}
          {torchEnabled ? "Apagar linterna" : "Encender linterna"}
        </DropdownMenuItem>
      )}
      {onOpenSettings && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenSettings}>
            <Settings2 className="mr-2 h-4 w-4" /> Configuración de audio y video
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
