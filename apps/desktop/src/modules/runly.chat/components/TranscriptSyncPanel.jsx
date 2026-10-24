import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Skeleton, ErrorState } from "@runly/ui";
import { LocateFixed, Search } from "lucide-react";
import { useTranscript } from "../hooks/useConversationTranscripts";
import {
  activeSegmentIndex, formatTimestamp, speakerColor, transcriptToVideoOffsetMs,
} from "../lib/transcriptDisplay";

const normalize = (text) => String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function SegmentRow({ segment, active, color, query, onSeek, rowRef }) {
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSeek}
      className={`flex w-full gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        active ? "bg-[hsl(var(--muted))]" : "hover:bg-[hsl(var(--muted)/0.5)]"
      }`}
    >
      <span className="shrink-0 pt-0.5 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
        {formatTimestamp(segment.startMs)}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">
        {segment.speakerLabel && (
          <span className="mr-1.5 font-semibold" style={{ color }}>{segment.speakerLabel}</span>
        )}
        <span className={active ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--foreground))]/85"}>
          {query ? highlight(segment.text, query) : segment.text}
        </span>
      </span>
    </button>
  );
}

function highlight(text, query) {
  const index = normalize(text).indexOf(normalize(query));
  if (index < 0 || normalize(text).length !== text.length) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[hsl(var(--ring))]/30 px-0.5 text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

// Transcript beside the recording player: the segment being spoken is
// highlighted and followed, clicking any segment seeks the video to it.
// `getMedia()` returns the live <video> (provided by AdvancedFileViewer).
export function TranscriptSyncPanel({ transcript: summary, recording, getMedia: getMediaProp }) {
  // The viewer passes a new function every render; keep one stable identity.
  const getMediaRef = useRef(getMediaProp);
  getMediaRef.current = getMediaProp;
  const getMedia = useCallback(() => getMediaRef.current(), []);
  const { data, isLoading, isError, refetch } = useTranscript(summary.id, true);
  const transcript = data?.data ?? data;
  const segments = useMemo(() => transcript?.segments ?? [], [transcript]);
  const offsetMs = transcriptToVideoOffsetMs(transcript ?? summary, recording);
  const [currentMs, setCurrentMs] = useState(0);
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const listRef = useRef(null);
  const activeRef = useRef(null);
  const programmaticScroll = useRef(false);

  const speakerIndex = useMemo(() => {
    const map = new Map();
    for (const s of segments) if (s.speakerLabel && !map.has(s.speakerLabel)) map.set(s.speakerLabel, map.size);
    return map;
  }, [segments]);

  // Video time -> transcript time. timeupdate fires ~4 Hz, enough for lines.
  useEffect(() => {
    const media = getMedia();
    if (!media) return undefined;
    const sync = () => setCurrentMs(Math.round(media.currentTime * 1000) - offsetMs);
    sync();
    media.addEventListener("timeupdate", sync);
    media.addEventListener("seeked", sync);
    return () => {
      media.removeEventListener("timeupdate", sync);
      media.removeEventListener("seeked", sync);
    };
  }, [getMedia, offsetMs, segments]);

  const activeIndex = activeSegmentIndex(segments, currentMs);

  const needle = normalize(query.trim());
  const visible = useMemo(() => (
    needle
      ? segments.map((s, index) => ({ s, index })).filter(({ s }) => normalize(`${s.speakerLabel ?? ""} ${s.text}`).includes(needle))
      : segments.map((s, index) => ({ s, index }))
  ), [segments, needle]);

  // Keep the active line in view while following (not while searching).
  useEffect(() => {
    if (!follow || needle || !activeRef.current) return;
    programmaticScroll.current = true;
    activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => { programmaticScroll.current = false; }, 600);
    return () => clearTimeout(t);
  }, [activeIndex, follow, needle]);

  const seek = useCallback((segment) => {
    const media = getMedia();
    if (!media) return;
    media.currentTime = Math.max(0, (segment.startMs + offsetMs) / 1000);
    media.play?.().catch(() => {});
    setFollow(true);
  }, [getMedia, offsetMs]);

  // A manual scroll pauses following until the user asks for it back.
  const pauseFollow = () => { if (!programmaticScroll.current) setFollow(false); };

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (isError) return <div className="p-3"><ErrorState title="No se pudo cargar la transcripción" onRetry={refetch} /></div>;
  if (!segments.length) {
    return <p className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Sin contenido reconocible.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la transcripción…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {!follow && !needle && (
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setFollow(true)} title="Volver al momento actual">
            <LocateFixed className="h-3.5 w-3.5" />
            Seguir
          </Button>
        )}
      </div>
      <div
        ref={listRef}
        onWheel={pauseFollow}
        onTouchMove={pauseFollow}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2"
      >
        {visible.length === 0 && (
          <p className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Sin coincidencias.</p>
        )}
        {visible.map(({ s, index }) => (
          <SegmentRow
            key={s.id}
            segment={s}
            active={index === activeIndex}
            color={s.speakerLabel ? speakerColor(speakerIndex.get(s.speakerLabel)) : undefined}
            query={needle ? query.trim() : ""}
            rowRef={index === activeIndex ? activeRef : undefined}
            onSeek={() => seek(s)}
          />
        ))}
      </div>
    </div>
  );
}
