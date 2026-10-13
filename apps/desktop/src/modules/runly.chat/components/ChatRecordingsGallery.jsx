import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AdvancedFileViewer, ConfirmDialog, EmptyState, ErrorState, Input, Skeleton,
  cn, useCoarsePointer, useHlsPosterFrame,
} from "@runly/ui";
import { AlertCircle, CalendarDays, Check, Clock, Loader2, Pencil, Play, Trash2, User, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useConversationRecordings, useDeleteRecording, useRenameRecording } from "../hooks/useConversationRecordings";
import { useConversationTranscripts } from "../hooks/useConversationTranscripts";
import { CardActionButton, RecordingTranscriptAction } from "./RecordingTranscriptAction";

// Always shows the full date, unlike chatUtils' formatMessageTime (which
// collapses "today" down to just a time) — recordings are reviewed well
// after the fact and several can share a day, so the date is load-bearing
// here, not just decoration.
function formatRecordingDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatFileSize(bytes) {
  if (bytes == null) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex > 0 && value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

// Cards fill the panel: one column on a phone, several on a wide screen.
const GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3";

function formatDuration(ms) {
  if (ms == null) return null;
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// Infra errors arrive in English from LiveKit/S3; say what happened in plain
// Spanish and keep the original only when nothing matches.
function friendlyReason(detail) {
  const text = String(detail ?? "");
  if (/timeout|timed out|aborted/i.test(text)) return "El servidor de grabación tardó demasiado en responder.";
  if (/egress/i.test(text)) return "El servicio de grabación no aceptó la solicitud.";
  if (/not found|NoSuchKey|404/i.test(text)) return "El archivo de video ya no existe en el almacenamiento.";
  if (/sign|credential|access denied|403/i.test(text)) return "No se pudo generar el enlace seguro del video.";
  return text;
}

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

// True once the element has come near the viewport (and stays true), so
// poster frames are only fetched for cards the user can actually see.
function useInView() {
  const [node, setNode] = useState(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!node || inView) return undefined;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setInView(true);
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView]);
  return [setNode, inView];
}

// Click the pencil to edit in place; Enter/blur saves, Escape cancels. An
// empty/whitespace-only save clears the custom title back to the default
// date/time label (renameRecording treats that the same way server-side).
function RecordingTitle({ recording, renameRecording }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(recording.title ?? "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // On touch devices there is no hover, so a hover-only reveal would leave
  // the pencil permanently invisible there — same fix already applied to
  // the speak button elsewhere in runly.chat (useCoarsePointer). Must run
  // before the `editing` early return below: calling it after that return
  // means it's skipped whenever `editing` becomes true, which changes the
  // number of hooks called between renders (React error #300).
  const coarse = useCoarsePointer();

  function startEditing() {
    setDraft(recording.title ?? "");
    setEditing(true);
  }

  async function save() {
    const next = draft.trim();
    if (next === (recording.title ?? "").trim()) { setEditing(false); return; }
    try {
      await renameRecording.mutateAsync({ recordingId: recording.id, title: next });
      setEditing(false);
    } catch (err) {
      toast.error(err?.message ?? "No se pudo renombrar la grabación.");
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") setEditing(false);
          }}
          maxLength={120}
          placeholder={formatRecordingDateTime(recording.startedAt)}
          className="h-7 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={renameRecording.isPending}
          title="Guardar"
          aria-label="Guardar nombre"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          title="Cancelar"
          aria-label="Cancelar"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const revealCls = coarse ? "opacity-100" : "opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100";

  return (
    <div className="group/title flex items-center gap-1.5 min-w-0">
      <p className="truncate text-sm font-medium">{recording.title || formatRecordingDateTime(recording.startedAt)}</p>
      <button
        type="button"
        onClick={startEditing}
        title="Renombrar"
        aria-label="Renombrar grabación"
        className={`${revealCls} flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-opacity`}
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function RecordingRow({ recording, deleteRecording, renameRecording, onPlay, transcript, conversationId }) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isReady = recording.status === "READY";
  const isFailed = recording.status === "FAILED";
  const isActive = ["STARTING", "ACTIVE", "PROCESSING"].includes(recording.status);
  // The backend only fills playlistManifest when it could read the .m3u8 and
  // sign every segment it references (call-recording-service.js
  // listRecordings) — a READY recording can still have no manifest if any of
  // that failed.
  const hasPlaylist = Boolean(recording.playlistManifest);
  const isUnavailable = isReady && !hasPlaylist;
  // The real reason, when the backend has one: failureReason is persisted on
  // FAILED rows (call-recording-service.js startRecording/reconcileActiveRecordings);
  // playlistUrlError is computed live on every listRecordings call for a READY
  // row whose manifest read/segment signing failed. Falls back to a generic message for
  // older rows recorded before this field existed.
  const errorDetail = isFailed
    ? (recording.failureReason || "No se pudo procesar la grabación.")
    : isUnavailable
      ? (recording.playlistUrlError || "No se pudo generar el enlace de reproducción.")
      : null;

  const status = isFailed
    ? { label: "Falló", cls: "bg-red-500/10 text-red-600 dark:text-red-400" }
    : isUnavailable
      ? { label: "No disponible", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" }
      : isActive
        ? { label: recording.status === "PROCESSING" ? "Procesando" : "Grabando", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" }
        : { label: "Lista", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  const sizeLabel = isReady ? formatFileSize(recording.sizeBytes) : null;
  const author = recording.startedBy?.displayName || "Alguien de la conversación";

  const [thumbRef, inView] = useInView();
  const playable = isReady && hasPlaylist;
  const { frame, loading: frameLoading } = useHlsPosterFrame(recording.id, playable ? recording.playlistManifest : null, { enabled: inView });
  const duration = isReady ? formatDuration(recording.durationMs) : null;

  async function handleDelete() {
    try {
      await deleteRecording.mutateAsync(recording.id);
      setConfirmDeleteOpen(false);
    } catch (err) {
      toast.error(err?.message ?? "No se pudo eliminar la grabación.");
    }
  }

  const thumb = (
    <>
      {frame ? (
        <img src={frame} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs font-medium",
            isFailed ? "bg-red-500/10 text-red-500" : isUnavailable ? "bg-amber-500/10 text-amber-500" : "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand-primary)_22%,transparent),hsl(var(--muted)))] text-(--brand-primary)",
          )}
        >
          {isFailed || isUnavailable ? (
            <>
              <Video className="h-9 w-9 opacity-80" aria-hidden />
              <span>{isFailed ? "Sin video" : "Video no disponible"}</span>
            </>
          ) : isActive || frameLoading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin opacity-70" aria-hidden />
              {isActive && <span>{recording.status === "PROCESSING" ? "Procesando video…" : "Grabando…"}</span>}
            </>
          ) : (
            <Video className="h-10 w-10 opacity-80" aria-hidden />
          )}
        </div>
      )}
      {playable && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
          </span>
        </span>
      )}
      {duration && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-white">{duration}</span>
      )}
    </>
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-shadow hover:shadow-md">
      {playable ? (
        <button
          ref={thumbRef}
          type="button"
          onClick={() => onPlay(recording)}
          aria-label={`Reproducir ${recording.title || formatRecordingDateTime(recording.startedAt)}`}
          className="relative block aspect-video w-full overflow-hidden bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--brand-primary)"
        >
          {thumb}
        </button>
      ) : (
        <div ref={thumbRef} className="relative aspect-video w-full overflow-hidden">
          {thumb}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <RecordingTitle recording={recording} renameRecording={renameRecording} />
          </div>
          <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", status.cls)}>{status.label}</span>
        </div>

        <dl className="space-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          {recording.title && (
            <MetaRow icon={CalendarDays} label="Fecha">{formatRecordingDateTime(recording.startedAt)}</MetaRow>
          )}
          <MetaRow icon={User} label="Grabado por">
            <span className="text-[hsl(var(--foreground))]">{author}</span>
          </MetaRow>
          {(duration || sizeLabel) && (
            <MetaRow icon={Clock} label="Duración">{[duration, sizeLabel].filter(Boolean).join(" · ")}</MetaRow>
          )}
        </dl>

        {errorDetail && (
          <div className={cn("flex items-start gap-2 rounded-md px-2.5 py-2 text-xs", isFailed ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200")}>
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="min-w-0">
              <span className="font-medium">{isFailed ? "No se pudo procesar la grabación." : "No se puede reproducir por ahora."}</span>{" "}
              <span className="opacity-80" title={errorDetail}>{friendlyReason(errorDetail)}</span>
            </p>
          </div>
        )}

        {/* Fixed action bar: same buttons on every card, disabled with the
            reason when they don't apply, so the grid reads consistently. */}
        <div className="mt-auto flex items-center gap-2 border-t border-[hsl(var(--border))] pt-2.5">
          <CardActionButton
            icon={Play}
            label="Reproducir"
            tone="brand"
            onClick={() => onPlay(recording)}
            disabled={!playable}
            title={playable ? "Reproducir" : isActive ? "Disponible cuando termine de procesarse" : "Esta grabación no tiene video reproducible"}
          />
          <RecordingTranscriptAction recording={recording} transcript={transcript} conversationId={conversationId} />
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isActive}
            title={isActive ? "Espera a que termine para eliminarla" : "Eliminar grabación"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[hsl(var(--muted-foreground))]"
            aria-label="Eliminar grabación"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Eliminar grabación"
        description="Esta acción no se puede deshacer. El archivo de video (si existe) se borrará permanentemente."
        confirmLabel="Eliminar"
        loading={deleteRecording.isPending}
        onConfirm={handleDelete}
      />
    </article>
  );
}

export function ChatRecordingsGallery({ conversationId }) {
  const { data, isLoading, isError, refetch } = useConversationRecordings(conversationId);
  const deleteRecording = useDeleteRecording(conversationId);
  const renameRecording = useRenameRecording(conversationId);
  const recordings = data?.data ?? data ?? [];
  const { data: transcriptsData } = useConversationTranscripts(conversationId);
  const transcriptsByRecordingId = useMemo(() => {
    const map = new Map();
    // Newest first from the API; a speaker-attributed (PER_TRACK) transcript
    // wins over a mixed-audio one for the same recording.
    for (const t of (transcriptsData?.data ?? transcriptsData ?? [])) {
      if (!t.recordingId) continue;
      const current = map.get(t.recordingId);
      if (!current || (current.sourceKind !== "PER_TRACK" && t.sourceKind === "PER_TRACK")) map.set(t.recordingId, t);
    }
    return map;
  }, [transcriptsData]);
  // Only playable recordings are browsable in the viewer — FAILED/processing/
  // unavailable rows have nothing to show and stay as their own row with a
  // warning icon on the list side (see RecordingRow's errorDetail).
  const playableRecordings = useMemo(
    () => recordings.filter((r) => r.status === "READY" && r.playlistManifest),
    [recordings],
  );

  // Reuses the same viewer the files module opens for images/PDF/audio/video
  // (AdvancedFileViewer, in @runly/ui) instead of a bespoke inline player —
  // same chrome, zoom/fullscreen, native controls, and (since every playable
  // recording of the conversation is passed in, not just the one clicked)
  // the same prev/next filmstrip navigation as any other multi-file gallery.
  // It only knows how to ask for "a signed URL" per file, so each recording's
  // HLS manifest (rewritten with signed segment URLs — see
  // call-recording-service.js) is wrapped in its own blob: URL here and
  // handed back as if it were one; useHlsPlayback (@runly/ui) handles the
  // actual hls.js attachment once the viewer renders the <video>.
  // The open recording is tracked by id, not index: the list polls every 8s
  // while another recording is processing, and a newly READY one shifts every
  // index — the viewer then jumped to (or reloaded) a different video.
  const [viewerId, setViewerId] = useState(null);
  // recordingId -> blob url, so paging back to an already-viewed recording
  // (A -> B -> A) doesn't rebuild the Blob, and every entry can be revoked on close.
  const blobUrlCacheRef = useRef(new Map());
  // Latest list for the resolver below, which must keep one identity: a new
  // function on every poll made the viewer re-resolve and restart the player.
  const playableRef = useRef(playableRecordings);
  playableRef.current = playableRecordings;

  // Rebuilt only when the set of playable recordings (or a title) changes,
  // not on every poll that returns the same rows with fresh signed URLs.
  const filesKey = playableRecordings.map((r) => `${r.id}:${r.title ?? ""}`).join("|");
  const viewerFiles = useMemo(() => playableRef.current.map((r) => ({
    id: r.id,
    mimeType: "application/vnd.apple.mpegurl",
    originalName: r.title || `Grabación ${formatRecordingDateTime(r.startedAt)}`,
    sizeBytes: r.sizeBytes,
  })), [filesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveRecordingUrl = useCallback(async (file) => {
    const cached = blobUrlCacheRef.current.get(file.id);
    if (cached) return cached;
    const recording = playableRef.current.find((r) => r.id === file.id);
    if (!recording?.playlistManifest) return null;
    const url = URL.createObjectURL(new Blob([recording.playlistManifest], { type: "application/vnd.apple.mpegurl" }));
    blobUrlCacheRef.current.set(file.id, url);
    return url;
  }, []);

  const viewerIndex = viewerId ? viewerFiles.findIndex((f) => f.id === viewerId) : -1;

  function handlePlay(recording) {
    setViewerId(recording.id);
  }

  const closeViewer = useCallback((nextOpen) => {
    if (nextOpen) return;
    for (const url of blobUrlCacheRef.current.values()) URL.revokeObjectURL(url);
    blobUrlCacheRef.current.clear();
    setViewerId(null);
  }, []);

  if (isLoading) {
    return (
      <div className={cn(GRID_CLASS, "p-3")}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 min-h-0 p-3">
        <ErrorState title="No se pudieron cargar las grabaciones" onRetry={refetch} />
      </div>
    );
  }

  if (!recordings.length) {
    return (
      <EmptyState
        className="flex-1 min-h-0"
        icon={Video}
        title="Aún no hay grabaciones"
        description="Las grabaciones de las llamadas de esta conversación aparecerán aquí."
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3">
      <div className={GRID_CLASS}>
      {recordings.map((r) => (
        <RecordingRow
          key={r.id}
          recording={r}
          deleteRecording={deleteRecording}
          renameRecording={renameRecording}
          onPlay={handlePlay}
          transcript={transcriptsByRecordingId.get(r.id)}
          conversationId={conversationId}
        />
      ))}
      </div>
      <AdvancedFileViewer
        open={viewerIndex >= 0}
        onOpenChange={closeViewer}
        files={viewerFiles}
        activeIndex={Math.max(0, viewerIndex)}
        onIndexChange={(i) => setViewerId(viewerFiles[i]?.id ?? null)}
        onResolveSignedUrl={resolveRecordingUrl}
        zIndex={10000}
      />
    </div>
  );
}
