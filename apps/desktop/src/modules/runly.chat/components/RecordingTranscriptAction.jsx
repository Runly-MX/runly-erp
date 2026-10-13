import { useState } from "react";
import { cn } from "@runly/ui";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRequestTranscript } from "../hooks/useConversationTranscripts";
import { TranscriptViewerDialog } from "./TranscriptViewerDialog";

// Per-recording action shown in ChatRecordingsGallery.jsx — one CallRecording
// maps to at most one active/most-recent CallTranscript (server-enforced,
// 409 on a duplicate request for the same call). V1 only ever transcribes
// audio already captured by an existing READY recording — see
// docs/TRANSCRIPTION_SPEC.md §0.1 for why this dependency exists.
function formatCallTitle(recording) {
  if (recording?.title) return `Transcripción — ${recording.title}`;
  if (!recording?.startedAt) return "Transcripción de llamada";
  const formatted = new Date(recording.startedAt).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return `Transcripción — ${formatted}`;
}

const TONES = {
  neutral: "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/70",
  brand: "bg-(--brand-primary)/10 text-(--brand-primary) hover:bg-(--brand-primary)/15",
  danger: "bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400",
};

// Same footprint as the card's "Reproducir" button so the action bar lines up.
export function CardActionButton({ icon: Icon, label, onClick, disabled = false, tone = "neutral", spin = false, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted))]/50 disabled:text-[hsl(var(--muted-foreground))]",
        TONES[tone],
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", spin && "animate-spin")} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Always rendered (disabled with the reason when it doesn't apply) so every
// card has the same action bar.
export function RecordingTranscriptAction({ recording, transcript, conversationId }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const requestTranscript = useRequestTranscript(conversationId);
  const callTitle = formatCallTitle(recording);

  async function handleRequest() {
    try {
      await requestTranscript.mutateAsync({ callId: recording.callId, recordingId: recording.id });
    } catch (err) {
      toast.error(err?.message ?? "No se pudo solicitar la transcripción.");
    }
  }

  let button;
  if (transcript?.status === "READY") {
    button = <CardActionButton icon={FileText} label="Transcripción" tone="brand" onClick={() => setViewerOpen(true)} title="Ver transcripción" />;
  } else if (["CAPTURING", "PENDING", "PROCESSING"].includes(transcript?.status)) {
    const label = transcript.status === "CAPTURING" ? "Capturando…" : "Transcribiendo…";
    button = <CardActionButton icon={Loader2} spin label={label} disabled title={transcript.status === "CAPTURING" ? "Capturando el audio de cada participante…" : "Transcribiendo…"} />;
  } else if (transcript?.status === "FAILED") {
    button = <CardActionButton icon={AlertCircle} label="Reintentar" tone="danger" onClick={() => setViewerOpen(true)} title="La transcripción falló — ver detalle y reintentar" />;
  } else if (recording.status !== "READY") {
    button = <CardActionButton icon={FileText} label="Transcribir" disabled title="Se puede transcribir cuando la grabación esté lista" />;
  } else {
    button = (
      <CardActionButton
        icon={requestTranscript.isPending ? Loader2 : FileText}
        spin={requestTranscript.isPending}
        label="Transcribir"
        onClick={handleRequest}
        disabled={requestTranscript.isPending}
      />
    );
  }

  return (
    <>
      {button}
      {transcript && (transcript.status === "READY" || transcript.status === "FAILED") && (
        <TranscriptViewerDialog
          transcriptId={transcript.id}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          conversationId={conversationId}
          callTitle={callTitle}
        />
      )}
    </>
  );
}
