import { MonitorUp, ScreenShareOff } from "lucide-react";
import { cn } from "@runly/ui";
import { Track } from "livekit-client";
import { ParticipantTile, TrackRenderer } from "../ParticipantTile";
import { DraggablePip } from "../DraggablePip";
import { CallAvatar } from "../ui/CallAvatar";
import { Filmstrip } from "./Filmstrip";
import { ZoomableStage } from "./ZoomableStage";
import { cameraAspect, useVideoAspectVersion } from "../lib/videoAspect";

function stripProps(isPhone, landscape) {
  if (landscape) return { orientation: "vertical", className: "h-full w-[150px]" };
  return { orientation: "horizontal", size: isPhone ? "sm" : "md" };
}

// One big speaker (pinned, else the stable active speaker) + everyone else.
export function FocusView({ mainEntry, others, tileProps, isPhone, landscape, stripCollapsed, onToggleStrip }) {
  const strip = stripProps(isPhone, landscape);
  return (
    <div className={cn("flex h-full min-h-0 w-full gap-3", landscape ? "flex-row" : "flex-col")}>
      <div className="relative min-h-0 min-w-0 flex-1">
        {mainEntry && (
          <ParticipantTile
            participant={mainEntry.participant}
            isLocal={mainEntry.isLocal}
            preferSource="camera"
            fit="contain"
            avatarSize="xl"
            className="rounded-3xl"
            {...tileProps(mainEntry)}
          />
        )}
      </div>
      <Filmstrip
        entries={others}
        tileProps={tileProps}
        collapsed={stripCollapsed}
        onToggleCollapsed={!isPhone && !landscape ? onToggleStrip : null}
        {...strip}
      />
    </div>
  );
}

function PresentingCard({ participant, onStopSharing }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 rounded-3xl bg-[radial-gradient(circle_at_50%_30%,var(--call-accent-soft),transparent_60%)] p-6 text-center ring-1 ring-white/[0.07]">
      <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl opacity-60 ring-1 ring-white/10">
        <TrackRenderer participant={participant} source={Track.Source.ScreenShare} muted fit="contain" />
      </div>
      <div>
        <p className="flex items-center justify-center gap-2 text-base font-semibold">
          <MonitorUp className="h-5 w-5 text-(--call-accent)" /> Estás presentando tu pantalla
        </p>
        <p className="mt-1 text-sm text-white/60">Los demás ven tu pantalla. La vista previa está atenuada para evitar el efecto espejo.</p>
      </div>
      <button
        type="button"
        onClick={onStopSharing}
        className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 transition-transform active:scale-[0.97]"
      >
        <ScreenShareOff className="h-4 w-4" /> Dejar de compartir
      </button>
    </div>
  );
}

// A screen share is the stage: zoomable on touch, the presenter's camera in a
// draggable bubble, everyone else in the strip. Several shares -> tabs.
export function PresentationView({
  screenEntries, activeScreenIdentity, onSelectScreen, cameraEntries, tileProps, presenterInfo,
  isPhone, landscape, stripCollapsed, onToggleStrip, onStopSharing, mirrorLocalCamera,
}) {
  useVideoAspectVersion();
  const active = screenEntries.find((e) => e.participant?.identity === activeScreenIdentity) ?? screenEntries[0];
  const presenter = active?.participant;
  const presenterIdentity = presenter?.identity?.replace(/^screen:/, "") ?? null;
  const presenterCamera = cameraEntries.find((e) => e.participant?.identity === presenterIdentity && !e.isLocal) ?? null;
  const cameraLive = Boolean(presenterCamera?.participant?.getTrackPublication?.(Track.Source.Camera)?.track
    && !presenterCamera.participant.getTrackPublication(Track.Source.Camera).isMuted);
  const others = cameraEntries.filter((e) => !(cameraLive && e === presenterCamera));
  const strip = stripProps(isPhone, landscape);
  const localPresenting = Boolean(active?.isLocal);
  const presenterName = presenterInfo?.(presenterIdentity)?.name ?? presenter?.name ?? "Alguien";

  return (
    <div className={cn("flex h-full min-h-0 w-full gap-3", landscape ? "flex-row" : "flex-col")}>
      <div className="relative min-h-0 min-w-0 flex-1">
        {screenEntries.length > 1 && (
          <div role="tablist" aria-label="Pantallas compartidas" className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] gap-1 overflow-x-auto rounded-xl bg-black/55 p-1 backdrop-blur">
            {screenEntries.map((entry) => {
              const id = entry.participant?.identity;
              const name = presenterInfo?.(id?.replace(/^screen:/, ""))?.name ?? entry.participant?.name ?? "Pantalla";
              const selected = entry === active;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onSelectScreen(id)}
                  className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold", selected ? "bg-white text-slate-900" : "text-white/75 hover:text-white")}
                >
                  {entry.isLocal ? "Tu pantalla" : name}
                </button>
              );
            })}
          </div>
        )}
        {localPresenting ? (
          <PresentingCard participant={presenter} onStopSharing={onStopSharing} />
        ) : active ? (
          <div className="relative h-full w-full overflow-hidden rounded-3xl bg-black ring-1 ring-white/[0.07]">
            <ZoomableStage key={active.participant?.identity}>
              <TrackRenderer participant={presenter} source={Track.Source.ScreenShare} fit="contain" />
            </ZoomableStage>
            <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium backdrop-blur" style={screenEntries.length > 1 ? { top: "3rem" } : undefined}>
              <MonitorUp className="h-3.5 w-3.5" /> {presenterName} está presentando
            </span>
            {cameraLive && (
              <DraggablePip label={presenterName} initial={presenterName.slice(0, 1).toUpperCase()} aspect={cameraAspect(presenterCamera.participant)}>
                <ParticipantTile participant={presenterCamera.participant} isLocal={false} preferSource="camera" avatarSize="sm" compact mirrorLocalCamera={mirrorLocalCamera} {...tileProps(presenterCamera)} />
              </DraggablePip>
            )}
          </div>
        ) : null}
      </div>
      <Filmstrip
        entries={others}
        tileProps={tileProps}
        collapsed={stripCollapsed}
        onToggleCollapsed={!isPhone && !landscape ? onToggleStrip : null}
        {...strip}
      />
    </div>
  );
}

// Voice call (or video off for everyone): big avatars, who's speaking pulses.
export function AudioView({ entries, tileInfo, speakingIds, waitingText }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-10 px-4">
      <div className="flex flex-wrap items-start justify-center gap-10 sm:gap-16">
        {entries.map((entry) => {
          const id = entry.participant?.identity;
          const info = tileInfo(id) ?? {};
          const name = info.name ?? entry.participant?.name ?? "Participante";
          const muted = entry.participant && !entry.participant.isMicrophoneEnabled;
          return (
            <div key={id || "local"} className="flex w-40 flex-col items-center gap-3 text-center">
              <CallAvatar name={name} seed={id} url={info.avatarUrl} size="xl" speaking={speakingIds.has(id)} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{entry.isLocal ? `${name} (tú)` : name}</p>
                <p className="text-xs text-white/55">
                  {muted ? "Micrófono apagado" : speakingIds.has(id) ? "Hablando…" : info.role === "host" ? "Anfitrión" : " "}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {waitingText && <p className="max-w-xs text-center text-sm text-white/55">{waitingText}</p>}
    </div>
  );
}
