import { useEffect, useRef, useState } from "react";
import {
  cn, useCoarsePointer,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@runly/ui";
import { Hand, MicOff, MoreHorizontal, Pin, PinOff, SignalLow, UserX, MonitorUp } from "lucide-react";
import { ConnectionQuality, Track } from "livekit-client";
import { CallAvatar } from "./ui/CallAvatar";
import { isGuestIdentity } from "./ui/callTheme";
import "./ui/call-ui.css";

// A caller-requested "auto" fit means cover for camera, contain for screen.
// A portrait phone camera forced to `cover` in a landscape tile crops so much
// it reads as distorted, so camera "auto" is resolved from the decoded track
// orientation. See docs/superpowers/specs/2026-09-23-call-spotlight-polish-round2-design.md §8.1.
function resolveAutoFit(isPortrait) {
  return isPortrait ? "contain" : "cover";
}

export function TrackRenderer({ participant, source, muted = false, mirror = false, fit = "cover", className = "" }) {
  const elementRef = useRef(null);
  const publication = participant?.getTrackPublication?.(source);
  const track = publication?.track;
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!track || !element) return undefined;
    track.attach(element);
    const checkOrientation = () => {
      if (element.videoWidth && element.videoHeight) {
        setIsPortrait(element.videoHeight > element.videoWidth);
      }
    };
    checkOrientation();
    element.addEventListener("loadedmetadata", checkOrientation);
    element.addEventListener("resize", checkOrientation);
    return () => {
      element.removeEventListener("loadedmetadata", checkOrientation);
      element.removeEventListener("resize", checkOrientation);
      track.detach(element);
    };
  }, [track]);

  if (!track || publication?.isMuted) return null;
  const effectiveFit = fit === "auto" ? resolveAutoFit(isPortrait) : fit;
  return (
    // react-doctor-disable-next-line media-has-caption -- LiveKit attaches a video-only WebRTC track; remote audio is rendered separately.
    <video
      ref={elementRef}
      autoPlay
      playsInline
      muted={muted}
      className={cn(
        "h-full w-full",
        effectiveFit === "contain" ? "object-contain" : "object-cover",
        mirror && "-scale-x-100",
        className,
      )}
    />
  );
}

function NameChip({ name, role, micMuted, speaking, isScreen, compact }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/55 font-medium text-white backdrop-blur-md",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
    >
      {isScreen ? (
        <MonitorUp className="h-3.5 w-3.5 shrink-0 text-white/80" aria-hidden />
      ) : micMuted ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-(--call-danger)" title="Micrófono apagado">
          <MicOff className="h-2.5 w-2.5" aria-label="Micrófono apagado" />
        </span>
      ) : speaking ? (
        <span className="call-eq shrink-0" aria-label="Hablando"><span /><span /><span /></span>
      ) : null}
      <span className="truncate">{name}</span>
      {role === "host" && !compact && (
        <span className="shrink-0 rounded-full bg-(--call-accent-soft) px-1.5 py-px text-[10px] font-semibold text-(--call-accent)">
          Anfitrión
        </span>
      )}
      {role === "guest" && !compact && (
        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold text-white/70">
          Invitado
        </span>
      )}
    </span>
  );
}

// One person (or one shared screen) in the call. `info` enriches the LiveKit
// participant with what LiveKit doesn't know: { name, avatarUrl, role }.
// `actions` (host moderation) shows up in the ⋯ menu: { onMute, onRemove }.
export function ParticipantTile({
  participant,
  isLocal,
  info = null,
  handRaised = false,
  pinned = false,
  onPin = null,
  mirrorLocalCamera = true,
  className = "",
  preferSource = "auto",
  // "auto" = contain for screen-share, cover-or-contain for camera depending
  // on its orientation. "contain" forces letterboxing (main stage tiles).
  fit = "auto",
  speaking = false,
  avatarSize = "lg",
  compact = false,
  actions = null,
}) {
  const coarse = useCoarsePointer();
  const screen = participant?.getTrackPublication?.(Track.Source.ScreenShare);
  const camera = participant?.getTrackPublication?.(Track.Source.Camera);
  const screenLive = Boolean(screen?.track && !screen.isMuted);
  const cameraLive = Boolean(camera?.track && !camera.isMuted);
  const source =
    preferSource === "screen"
      ? Track.Source.ScreenShare
      : preferSource === "camera"
        ? Track.Source.Camera
        : screenLive
          ? Track.Source.ScreenShare
          : Track.Source.Camera;
  const hasVideo =
    source === Track.Source.ScreenShare ? screenLive : cameraLive || (preferSource === "auto" && screenLive);
  const isScreen = source === Track.Source.ScreenShare;
  const identity = participant?.identity ?? "";
  const baseName = info?.name || participant?.name || (isLocal ? "Tú" : identity) || "Participante";
  const name = isScreen ? `Pantalla de ${isLocal ? "ti" : baseName}` : isLocal ? `${baseName} (tú)` : baseName;
  const role = info?.role ?? (isGuestIdentity(identity) ? "guest" : null);
  const micMuted = !isScreen && participant && !participant.isMicrophoneEnabled;
  const weak = [ConnectionQuality.Poor, ConnectionQuality.Lost].includes(participant?.connectionQuality);
  // Small tiles on touch screens skip the ⋯ button (double tap still pins);
  // the people panel has the same actions.
  const showMenu = Boolean(onPin || actions?.onMute || actions?.onRemove) && !(coarse && compact);

  return (
    // The speaking ring lives on the outer box (no overflow-hidden here):
    // overflow-hidden + an outer ring on the same element clips the ring.
    <div
      className={cn(
        "group/tile relative h-full min-h-0 w-full rounded-2xl transition-shadow duration-200",
        speaking && !isScreen
          ? "ring-2 ring-(--call-speaking) shadow-[0_0_0_4px_rgba(52,211,153,0.14)]"
          : pinned
            ? "ring-2 ring-(--call-accent)"
            : "ring-1 ring-white/[0.07]",
        className,
      )}
      onDoubleClick={onPin ? () => onPin(identity) : undefined}
    >
      <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-(--call-tile)">
        {hasVideo ? (
          <TrackRenderer
            participant={participant}
            source={source}
            muted={isLocal}
            fit={fit === "contain" || isScreen ? "contain" : "auto"}
            mirror={isLocal && source === Track.Source.Camera && mirrorLocalCamera}
          />
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.06),transparent_65%)]">
            <CallAvatar name={baseName} seed={identity} url={info?.avatarUrl} size={avatarSize} speaking={speaking} />
          </div>
        )}

        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5">
          {handRaised && (
            <span className="flex h-7 items-center gap-1 rounded-full bg-(--call-hand) px-2 text-[11px] font-bold text-amber-950 shadow-lg" title="Mano levantada">
              <Hand className="h-3.5 w-3.5" aria-label="Mano levantada" />
            </span>
          )}
          {weak && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-amber-300 backdrop-blur" title="Conexión inestable">
              <SignalLow className="h-4 w-4" aria-label="Conexión inestable" />
            </span>
          )}
        </div>

        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Opciones de ${baseName}`}
                className={cn(
                  "absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-black/70",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--call-accent)",
                  pinned || coarse ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-60 w-52">
              {onPin && (
                <DropdownMenuItem onSelect={() => onPin(identity)}>
                  {pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                  {pinned ? "Dejar de fijar" : "Fijar en pantalla"}
                </DropdownMenuItem>
              )}
              {actions?.onMute && !micMuted && (
                <DropdownMenuItem onSelect={() => actions.onMute(participant)}>
                  <MicOff className="mr-2 h-4 w-4" /> Silenciar
                </DropdownMenuItem>
              )}
              {actions?.onRemove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-500 focus:text-red-500" onSelect={() => actions.onRemove(participant)}>
                    <UserX className="mr-2 h-4 w-4" /> Quitar de la llamada
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-linear-to-t from-black/60 to-transparent", compact ? "p-1.5 pt-6" : "p-2.5 pt-10")}>
          <NameChip name={name} role={role} micMuted={micMuted} speaking={speaking} isScreen={isScreen} compact={compact} />
        </div>
      </div>
    </div>
  );
}
