import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, ProgressBar, ErrorState, Skeleton,
} from "@runly/ui";
import { ClipboardList, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranscriptDocuments, useCreateTranscriptDocument } from "../hooks/useConversationTranscripts";
import { downloadTranscriptDocumentPdf } from "../lib/transcriptDocumentPdf";

const KINDS = [
  {
    kind: "MINUTA",
    icon: ClipboardList,
    title: "Minuta de reunión",
    description: "Desarrollo por tema con minutos, compromisos, riesgos y decisiones abiertas.",
  },
  {
    kind: "RESUMEN",
    icon: FileText,
    title: "Resumen ejecutivo",
    description: "Una página con panorama, hallazgos principales y prioridades de seguimiento.",
  },
];

function unwrap(r) { return r?.data ?? r; }

function DocumentCard({ spec, document, busy, onGenerate, onDownload }) {
  const Icon = spec.icon;
  const processing = document?.status === "PROCESSING";
  const ready = document?.status === "READY";
  const total = document?.progressTotal ?? 0;
  const percent = total > 0 ? Math.round((document.progressDone / total) * 100) : null;
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{spec.title}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{spec.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ready && (
            <Button size="sm" onClick={() => onDownload(document)}>
              <Download className="h-3.5 w-3.5" />
              Descargar PDF
            </Button>
          )}
          {!processing && (
            <Button size="sm" variant={ready ? "outline" : "default"} disabled={busy} onClick={() => onGenerate(spec.kind)}>
              {ready ? <RefreshCw className="h-3.5 w-3.5" /> : null}
              {ready ? "Generar de nuevo" : document?.status === "FAILED" ? "Reintentar" : "Generar"}
            </Button>
          )}
        </div>
      </div>
      {processing && (
        <div className="mt-3 space-y-1.5">
          <ProgressBar value={percent} />
          <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {total > 0
              ? `Analizando la reunión por partes (${Math.min(document.progressDone, total - 1)} de ${total - 1}). Puedes cerrar esta ventana.`
              : "Preparando el análisis…"}
          </p>
        </div>
      )}
      {document?.status === "FAILED" && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{document.failureReason || "No se pudo generar el documento."}</p>
      )}
    </div>
  );
}

// Minuta / resumen ejecutivo of a transcript, generated in the background by
// the map-reduce pipeline so a long meeting never hits the AI token limit.
export function TranscriptDocumentsDialog({ transcriptId, open, onOpenChange, callTitle }) {
  const { data, isLoading, isError, refetch } = useTranscriptDocuments(transcriptId, open);
  const create = useCreateTranscriptDocument(transcriptId);
  const documents = unwrap(data) ?? [];

  async function handleGenerate(kind) {
    try {
      await create.mutateAsync(kind);
    } catch (err) {
      toast.error(err?.message ?? "No se pudo iniciar la generación.");
    }
  }

  async function handleDownload(document) {
    try {
      await downloadTranscriptDocumentPdf(document, { callTitle });
    } catch (err) {
      toast.error(err?.message ?? "No se pudo generar el PDF.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader icon={ClipboardList}>
          <DialogTitle>Minuta y resumen</DialogTitle>
          <DialogDescription>
            MirAI procesa la transcripción completa por partes, también reuniones de más de una hora. Puede tardar unos minutos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {isError && <ErrorState title="No se pudieron cargar los documentos" onRetry={refetch} />}
          {!isLoading && !isError && KINDS.map((spec) => (
            <DocumentCard
              key={spec.kind}
              spec={spec}
              document={documents.find((d) => d.kind === spec.kind)}
              busy={create.isPending}
              onGenerate={handleGenerate}
              onDownload={handleDownload}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
