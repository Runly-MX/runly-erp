import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, SelectField } from "@runly/ui";
import { CameraOff, Volume2 } from "lucide-react";
import { Track } from "livekit-client";
import { TrackRenderer } from "../ParticipantTile";
import { MicLevelMeter } from "./DeviceMenus";
import { CALL_SOUND_URLS } from "../callSounds";
import { CALL_SHORTCUTS } from "../hooks/useCallShortcuts";
import "../ui/call-ui.css";

function testSpeaker(deviceId) {
  try {
    const audio = new Audio(CALL_SOUND_URLS.join);
    audio.volume = 0.8;
    const play = () => audio.play().catch(() => {});
    if (deviceId && typeof audio.setSinkId === "function") audio.setSinkId(deviceId).then(play, play);
    else play();
  } catch { /* no audio output */ }
}

function DeviceSelect({ label, kind, mediaDevices, emptyText }) {
  const list = mediaDevices.devices[kind] ?? [];
  if (!list.length) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{emptyText}</p>
      </div>
    );
  }
  return (
    <SelectField
      label={label}
      value={mediaDevices.active[kind] ?? list[0].deviceId}
      onValueChange={(id) => mediaDevices.select(kind, id)}
      options={list.map((d) => ({ value: d.deviceId, label: d.label }))}
    />
  );
}

// "Audio y video": a large live camera preview, then every device picker,
// the mic level and a speaker test. Uses the call's dark surface.
export function DeviceSettingsDialog({ open, onOpenChange, room, mediaDevices, micEnabled, cameraEnabled, mirror, audioRoute = null }) {
  const local = room?.localParticipant;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="call-dialog">
        <DialogHeader>
          <DialogTitle>Audio y video</DialogTitle>
          <DialogDescription>Elige qué micrófono, cámara y altavoz usar. Se recordará para tus próximas llamadas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
            {cameraEnabled ? (
              <TrackRenderer participant={local} source={Track.Source.Camera} muted mirror={mirror} fit="cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-white/55">
                <CameraOff className="h-7 w-7" aria-hidden />
                Tu cámara está apagada
              </div>
            )}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <DeviceSelect label="Micrófono" kind="audioinput" mediaDevices={mediaDevices} emptyText="No se detectaron micrófonos." />
              <div className="rounded-lg bg-white/5 ring-1 ring-white/10">
                <MicLevelMeter room={room} enabled={micEnabled} />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{micEnabled ? "Habla para ver el nivel." : "Tu micrófono está silenciado."}</p>
            </div>
            <DeviceSelect label="Cámara" kind="videoinput" mediaDevices={mediaDevices} emptyText="No se detectaron cámaras." />
            <div className="space-y-2 md:col-span-2">
              {audioRoute?.supported ? (
                <SelectField
                  label="Salida de audio"
                  value={audioRoute.active ?? ""}
                  onValueChange={audioRoute.select}
                  options={audioRoute.routes.map((r) => ({ value: r.id, label: r.label }))}
                />
              ) : mediaDevices.outputSupported ? (
                <DeviceSelect label="Altavoz" kind="audiooutput" mediaDevices={mediaDevices} emptyText="Usando el altavoz del sistema." />
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Este navegador usa la salida de audio del sistema; cámbiala desde la configuración del dispositivo.
                </p>
              )}
              <button
                type="button"
                onClick={() => testSpeaker(mediaDevices.active.audiooutput)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
              >
                <Volume2 className="h-4 w-4" aria-hidden /> Probar altavoz
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="call-dialog">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Funcionan mientras estás en la llamada.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-white/10">
          {CALL_SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span>{s.label}</span>
              <kbd className="shrink-0 rounded-md bg-white/10 px-2 py-1 font-mono text-xs">{s.keys}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
