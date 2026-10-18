import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  FileVideo, Loader2, Maximize, Minimize, Pause, Play, RectangleHorizontal, RotateCcw, RotateCw, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { useHlsPlayback } from "../lib/useHlsPlayback.js";
import { formatVideoTime, resolveStartAt } from "../lib/videoTime.js";
import { PlayerButton, ScrubBar, SpeedMenu } from "./VideoPlayerParts.jsx";

const HIDE_AFTER_MS = 3000;
const SEEK_STEP = 10;
const KEY_SEEK = 5;
const PLAYBACK_ERROR = "No se pudo reproducir el video.";

// Blob URL of HLS manifest text (segments already signed), revoked on change.
function useManifestUrl(manifest) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!manifest) { setUrl(null); return undefined; }
    const next = URL.createObjectURL(new Blob([manifest], { type: "application/vnd.apple.mpegurl" }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [manifest]);
  return url;
}

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

// Touch-first device (no hover): controls are toggled by tapping instead of hovering.
const COARSE_QUERY = "(hover: none) and (pointer: coarse)";
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(COARSE_QUERY).matches));
  useEffect(() => {
    const query = window.matchMedia?.(COARSE_QUERY);
    if (!query) return undefined;
    const sync = () => setCoarse(query.matches);
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  return coarse;
}

// Video player with custom controls. Sources: `src` (MP4/WebM URL or an
// .m3u8 URL) or `hlsManifest` (manifest text, wins over `src`). HLS goes
// through useHlsPlayback (hls.js with recovery, native HLS on Safari/iOS).
// Callbacks receive (currentTime, duration). The forwarded ref is the <video>.
export const VideoPlayer = forwardRef(function VideoPlayer({
  src = null, hlsManifest = null, poster = null, startAt = 0,
  onTimeUpdate, onPause, onEnded, onError,
  theater = false, onTheaterChange, className, title,
}, ref) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimer = useRef(null);
  const startAtRef = useRef(startAt);
  const scrubResume = useRef(false);
  const lastPointer = useRef("mouse");
  const coarse = useCoarsePointer();
  const callbacks = useRef({});
  callbacks.current = { onTimeUpdate, onPause, onEnded, onError };

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [failed, setFailed] = useState(false);

  const manifestUrl = useManifestUrl(hlsManifest);
  const isHlsUrl = !hlsManifest && typeof src === "string" && /\.m3u8(\?|#|$)/i.test(src);
  const hlsSrc = manifestUrl ?? (isHlsUrl ? src : null);
  const fileSrc = hlsManifest || isHlsUrl ? null : src;
  const playKey = hlsManifest ? manifestUrl : src;

  const setVideoNode = useCallback((node) => {
    videoRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const onFatal = useCallback(() => {
    setFailed(true);
    callbacks.current.onError?.();
  }, []);
  // Failing unmounts the <video>; passing null then re-attaches on "Reintentar".
  useHlsPlayback(videoRef, failed ? null : hlsSrc, onFatal);

  // A new source starts from scratch (and from the startAt given with it).
  useEffect(() => {
    startAtRef.current = startAt;
    setFailed(false);
    setPlaying(false);
    setStarted(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
  }, [playKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Controls auto-hide after 3 s while playing; any pointer move shows them.
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (videoRef.current && !videoRef.current.paused) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_AFTER_MS);
    }
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => { if (!playing) { clearTimeout(hideTimer.current); setControlsVisible(true); } else revealControls(); }, [playing, revealControls]);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(fullscreenElement() && fullscreenElement() === containerRef.current));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const times = () => {
    const video = videoRef.current;
    return [video?.currentTime || 0, Number.isFinite(video?.duration) ? video.duration : 0];
  };

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) video.play()?.catch?.(() => {});
    else video.pause();
  }, []);

  const seekTo = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : seconds;
    video.currentTime = Math.min(Math.max(0, seconds), max);
    setCurrent(video.currentTime);
  }, []);

  const applyVolume = useCallback((next) => {
    const video = videoRef.current;
    const value = Math.min(1, Math.max(0, next));
    setVolume(value);
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
    setMuted(value === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    if (!next && video.volume === 0) applyVolume(1);
  }, [applyVolume]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (fullscreenElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    const request = container?.requestFullscreen || container?.webkitRequestFullscreen;
    if (request) { request.call(container)?.catch?.(() => {}); return; }
    // iOS Safari only allows fullscreen on the <video> element itself.
    if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }, []);

  function changeSpeed(value) {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  }

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const onButton = event.target instanceof HTMLElement && event.target.closest("button");
    const key = event.key.toLowerCase();
    if ((key === " " || key === "enter") && onButton) return;
    const actions = {
      " ": togglePlay,
      k: togglePlay,
      arrowleft: () => seekTo(times()[0] - KEY_SEEK),
      arrowright: () => seekTo(times()[0] + KEY_SEEK),
      arrowup: () => applyVolume((muted ? 0 : volume) + 0.1),
      arrowdown: () => applyVolume((muted ? 0 : volume) - 0.1),
      f: toggleFullscreen,
      m: toggleMute,
    };
    const action = actions[key];
    if (!action) return;
    event.preventDefault();
    action();
    revealControls();
  }

  const video = {
    onLoadedMetadata: (event) => {
      const el = event.currentTarget;
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      setDuration(d);
      const start = resolveStartAt(startAtRef.current, d);
      if (start > 0) el.currentTime = start;
      el.playbackRate = speed;
      el.volume = volume;
      el.muted = muted;
    },
    onDurationChange: (event) => { const d = event.currentTarget.duration; if (Number.isFinite(d)) setDuration(d); },
    onTimeUpdate: (event) => {
      const el = event.currentTarget;
      setCurrent(el.currentTime);
      callbacks.current.onTimeUpdate?.(el.currentTime, Number.isFinite(el.duration) ? el.duration : 0);
    },
    onProgress: (event) => {
      const el = event.currentTarget;
      if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
    },
    onPlay: () => { setPlaying(true); setStarted(true); },
    onPlaying: () => setWaiting(false),
    onWaiting: () => setWaiting(true),
    onPause: (event) => {
      setPlaying(false);
      if (!event.currentTarget.ended && !scrubResume.current) callbacks.current.onPause?.(...times());
    },
    onEnded: () => { setPlaying(false); callbacks.current.onEnded?.(...times()); },
    // Under hls.js (MediaSource src) media errors go through its recovery;
    // plain files and native HLS (Safari/iOS, src === hlsSrc) fail here.
    onError: (event) => {
      if (hlsSrc && event.currentTarget.currentSrc !== hlsSrc) return;
      setFailed(true);
      callbacks.current.onError?.();
    },
  };

  const hasSource = Boolean(hlsManifest || src);
  const frame = cn("relative isolate aspect-video w-full overflow-hidden rounded-md bg-black text-white", fullscreen && "rounded-none", className);

  if (!hasSource || failed) {
    return (
      <div className={cn(frame, "flex flex-col items-center justify-center gap-2 p-4 text-center")}>
        <FileVideo className="size-8 text-white/60" aria-hidden />
        <p className="text-sm text-white/80">{failed ? PLAYBACK_ERROR : "Sin video"}</p>
        {failed ? (
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/15" onClick={() => setFailed(false)}>
            <RotateCcw className="size-3.5" aria-hidden />Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  const fraction = duration > 0 ? current / duration : 0;
  const showChrome = controlsVisible || !playing;
  const touch = coarse || lastPointer.current === "touch";

  // Mouse: click plays/pauses. Touch: a tap shows the controls, a second tap hides them.
  function onVideoTap() {
    if (lastPointer.current === "mouse") { togglePlay(); return; }
    if (controlsVisible && playing) { clearTimeout(hideTimer.current); setControlsVisible(false); }
    else revealControls();
  }
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={title ? `Reproductor: ${title}` : "Reproductor de video"}
      className={cn(frame, "group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]", !showChrome && "cursor-none")}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => { if (event.pointerType === "mouse") revealControls(); }}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType;
        // Touch: a tap on the video toggles the controls (handled on click);
        // a tap on a control keeps them visible and restarts the hide timer.
        if (event.pointerType === "mouse" || event.target.closest?.("[data-player-controls]")) revealControls();
      }}
      // Touch screens fire pointerleave when the finger lifts: only the mouse hides on leave.
      onPointerLeave={(event) => { if (event.pointerType === "mouse" && playing) setControlsVisible(false); }}
    >
      <video
        key={playKey ?? "empty"}
        ref={setVideoNode}
        src={fileSrc ?? undefined}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        className="absolute inset-0 size-full object-contain"
        onClick={onVideoTap}
        onDoubleClick={() => { if (lastPointer.current === "mouse") toggleFullscreen(); }}
        {...video}
      >
        Tu navegador no puede reproducir este video.
      </video>

      {waiting && playing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-10 animate-spin text-white/80 motion-reduce:animate-none" aria-hidden />
        </div>
      ) : null}

      {touch && started && showChrome ? (
        // Touch: big centered controls (the bottom bar keeps the rest). The layer
        // lets taps on empty space reach the video so they toggle the controls.
        <div data-player-controls className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-8 bg-black/25">
          <button type="button" aria-label="Retroceder 10 segundos" className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-black/45 text-white" onClick={() => seekTo(current - SEEK_STEP)}>
            <RotateCcw className="size-6" aria-hidden />
          </button>
          <button type="button" aria-label={playing ? "Pausar" : "Reanudar"} className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg" onClick={togglePlay}>
            {playing ? <Pause className="size-7" fill="currentColor" aria-hidden /> : <Play className="ml-1 size-7" fill="currentColor" aria-hidden />}
          </button>
          <button type="button" aria-label="Adelantar 10 segundos" className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-black/45 text-white" onClick={() => seekTo(current + SEEK_STEP)}>
            <RotateCw className="size-6" aria-hidden />
          </button>
        </div>
      ) : null}

      {!playing && !(touch && started) ? (
        <button
          type="button"
          aria-label={started ? "Reanudar" : "Reproducir"}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 focus-visible:outline-none"
          onClick={togglePlay}
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform hover:scale-105">
            <Play className="ml-1 size-7" fill="currentColor" aria-hidden />
          </span>
        </button>
      ) : null}

      <div
        data-player-controls
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/85 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity duration-300",
          showChrome ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ScrubBar
          label="Posición del video"
          value={fraction}
          buffered={duration > 0 ? buffered / duration : 0}
          step={duration > 0 ? KEY_SEEK / duration : 0.05}
          valueText={`${formatVideoTime(current)} de ${formatVideoTime(duration)}`}
          onChange={(value) => seekTo(value * duration)}
          onScrubStart={() => {
            const el = videoRef.current;
            scrubResume.current = Boolean(el && !el.paused);
            if (scrubResume.current) el.pause();
          }}
          onScrubEnd={() => {
            if (scrubResume.current) videoRef.current?.play()?.catch?.(() => {});
            scrubResume.current = false;
          }}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-0.5">
            <PlayerButton label={playing ? "Pausar" : "Reproducir"} onClick={togglePlay}>
              {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </PlayerButton>
            <PlayerButton label="Retroceder 10 segundos" className="hidden sm:inline-flex" onClick={() => seekTo(current - SEEK_STEP)}><RotateCcw /></PlayerButton>
            <PlayerButton label="Adelantar 10 segundos" className="hidden sm:inline-flex" onClick={() => seekTo(current + SEEK_STEP)}><RotateCw /></PlayerButton>
            <div className="group/volume flex items-center">
              <PlayerButton label={muted || volume === 0 ? "Activar sonido" : "Silenciar"} onClick={toggleMute}><VolumeIcon /></PlayerButton>
              {/* Touch devices use the hardware volume keys: only the mute button shows there. */}
              <div className="w-0 overflow-hidden transition-[width] duration-200 group-focus-within/volume:w-20 group-hover/volume:w-20 [@media(hover:none)]:hidden">
                <ScrubBar
                  label="Volumen" thick className="mx-2 w-16"
                  value={muted ? 0 : volume} step={0.1}
                  valueText={`${Math.round((muted ? 0 : volume) * 100)} %`}
                  onChange={applyVolume}
                />
              </div>
            </div>
            <span className="ml-1 truncate text-xs font-medium tabular-nums text-white/90">
              {formatVideoTime(current)} / {formatVideoTime(duration)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <SpeedMenu speed={speed} onSelect={changeSpeed} />
            {onTheaterChange && !fullscreen ? (
              <PlayerButton
                label={theater ? "Salir del modo teatro" : "Modo teatro"} active={theater} aria-pressed={theater}
                className="hidden sm:inline-flex" onClick={() => onTheaterChange(!theater)}
              >
                <RectangleHorizontal />
              </PlayerButton>
            ) : null}
            <PlayerButton label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize /> : <Maximize />}
            </PlayerButton>
          </div>
        </div>
      </div>
    </div>
  );
});
