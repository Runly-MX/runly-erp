import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { Maximize2, Mic, MicOff, PhoneOff } from "lucide-react";

const TAP_THRESHOLD_PX = 4;
const MARGIN = 12;

function fmt(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useTrack(participant, source) {
  const ref = useRef(null);
  const pub = participant?.getTrackPublication?.(source);
  const track = pub?.track && !pub.isMuted ? pub.track : null;
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return undefined;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);
  return { ref, hasTrack: Boolean(track) };
}

// Floating, draggable minimized-call widget. Rendered by CallRoom while the
// call is minimized — CallRoom itself stays mounted so the LiveKit room keeps
// running. Fixed to the viewport at the same z tier as the full call overlay
// (z-[46]): above app chrome, below the modal layer (z-50) so dialogs still
// open on top of it.
export function MiniCallBubble({
  remoteParticipants = [],
  localParticipant = null,
  elapsed = 0,
  micEnabled = true,
  onToggleMic,
  onRestore,
  onHangUp,
}) {
  const nodeRef = useRef(null);
  const dragRef = useRef(null);
  // Set by endDrag before it clears dragRef, read by the restore button's
  // onClick — a click that ends a drag must not restore the call.
  const lastGestureWasDrag = useRef(false);
  const [pos, setPos] = useState(null); // { x, y } from viewport top-left; null = anchor bottom-right

  const focus =
    remoteParticipants.find((p) => {
      const cam = p?.getTrackPublication?.(Track.Source.Camera);
      const scr = p?.getTrackPublication?.(Track.Source.ScreenShare);
      return (cam?.track && !cam.isMuted) || (scr?.track && !scr.isMuted);
    })
    || remoteParticipants[0]
    || localParticipant;

  const screenPub = focus?.getTrackPublication?.(Track.Source.ScreenShare);
  const showScreen = Boolean(screenPub?.track && !screenPub.isMuted);
  const video = useTrack(focus, showScreen ? Track.Source.ScreenShare : Track.Source.Camera);
  const name = focus?.name || focus?.identity || "En llamada";

  const clamp = useCallback((x, y) => {
    const node = nodeRef.current;
    if (!node) return { x, y };
    const maxX = Math.max(MARGIN, window.innerWidth - node.offsetWidth - MARGIN);
    const maxY = Math.max(MARGIN, window.innerHeight - node.offsetHeight - MARGIN);
    return { x: Math.min(Math.max(MARGIN, x), maxX), y: Math.min(Math.max(MARGIN, y), maxY) };
  }, []);

  useEffect(() => {
    const onResize = () => setPos((cur) => (cur ? clamp(cur.x, cur.y) : cur));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const node = nodeRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    lastGestureWasDrag.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos ? pos.x : rect.left,
      originY: pos ? pos.y : rect.top,
      moved: false,
      captured: false,
    };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > TAP_THRESHOLD_PX) d.moved = true;
    if (!d.moved) return;
    // Capture only now that this is really a drag. Capturing on pointerdown
    // retargets pointerup away from the restore <button> and breaks
    // click-to-restore with a mouse.
    if (!d.captured) {
      nodeRef.current?.setPointerCapture?.(e.pointerId);
      d.captured = true;
    }
    setPos(clamp(d.originX + dx, d.originY + dy));
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    lastGestureWasDrag.current = d.moved;
    if (d.captured) nodeRef.current?.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const style = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px` }
    : {
        right: `calc(${MARGIN}px + var(--sar))`,
        bottom: `calc(${MARGIN}px + var(--sab))`,
      };

  return (
    <div
      ref={nodeRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={style}
      className="fixed z-[46] w-44 touch-none select-none overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/20"
    >
      <button
        type="button"
        onPointerUp={endDrag}
        onClick={() => { if (!lastGestureWasDrag.current) onRestore?.(); }}
        title="Volver a la llamada"
        className="relative block aspect-video w-full bg-slate-950"
      >
        {video.hasTrack ? (
          // react-doctor-disable-next-line media-has-caption -- live WebRTC video preview; audio handled by the call room.
          <video
            ref={video.ref}
            autoPlay
            playsInline
            muted
            className={`h-full w-full ${showScreen ? "object-contain" : "object-cover"}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/25 text-sm font-semibold text-violet-100">
              {name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
          {fmt(elapsed)}
        </span>
        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 ring-1 ring-white/20">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>

      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/80">{name}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleMic}
          title={micEnabled ? "Silenciar" : "Activar micrófono"}
          className={`flex h-7 w-7 items-center justify-center rounded-full ${micEnabled ? "bg-white/10 hover:bg-white/20" : "bg-red-500/80"}`}
        >
          {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onHangUp}
          title="Colgar"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 hover:bg-red-600"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
