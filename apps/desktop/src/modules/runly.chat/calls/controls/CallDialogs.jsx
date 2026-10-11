import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, SelectField } from "@runly/ui";
import { Track } from "livekit-client";
import { TrackRenderer } from "../ParticipantTile";
import { MicLevelMeter } from "./DeviceMenus";
import { CALL_SHORTCUTS } from "../hooks/useCallShortcuts";

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

// "Configuración de audio y video": camera preview + every device picker.
export function DeviceSettingsDialog({ open, onOpenChange, room, mediaDevices, micEnabled, cameraEnabled, mirror, audioRoute = null }) {
  const local = room?.localParticipant;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="dark" style={{ zIndex: 10003 }}>
        <DialogHeader>
          <DialogTitle>Audio y video</DialogTitle>
          <DialogDescription>Elige qué micrófono, cámara y altavoz usar en esta llamada. Se recordará para las próximas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[1fr_1.1fr]">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
            {cameraEnabled ? (
              <TrackRenderer participant={local} source={Track.Source.Camera} muted mirror={mirror} fit="cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/50">Cámara apagada</div>
            )}
          </div>
          <div className="space-y-4">
            <DeviceSelect label="Micrófono" kind="audioinput" mediaDevices={mediaDevices} emptyText="No se detectaron micrófonos." />
            <div className="-mt-2 rounded-lg bg-white/5"><MicLevelMeter room={room} enabled={micEnabled} /></div>
            <DeviceSelect label="Cámara" kind="videoinput" mediaDevices={mediaDevices} emptyText="No se detectaron cámaras." />
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="dark" style={{ zIndex: 10003 }}>
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Funcionan mientras estás en la llamada.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-white/10">
          {CALL_SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span>{s.label}</span>
              <kbd className="shrink-0 rounded-md bg-white/10 px-2 py-1 font-mono text-xs">{s.keys}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
