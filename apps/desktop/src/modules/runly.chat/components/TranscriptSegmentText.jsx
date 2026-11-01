import { useState } from "react";
import { Button, Textarea } from "@runly/ui";
import { Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useUpdateTranscriptSegment } from "../hooks/useTranscriptionVocabulary";

// One transcript line that can be fixed in place. The engine's own text is
// kept by the API (originalText), so an edited line can always be restored; a
// small word replacement is remembered in the company glossary.
export function TranscriptSegmentText({ transcriptId, segment, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const update = useUpdateTranscriptSegment(transcriptId);
  const edited = segment.originalText != null;

  function startEditing() {
    setDraft(segment.text);
    setEditing(true);
  }

  async function save() {
    const next = draft.trim();
    if (!next || next === segment.text) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({ segmentId: segment.id, text: next });
      setEditing(false);
    } catch (err) {
      toast.error(err?.message ?? "No se pudo guardar el texto.");
    }
  }

  async function restore() {
    try {
      await update.mutateAsync({ segmentId: segment.id, revert: true });
    } catch (err) {
      toast.error(err?.message ?? "No se pudo restaurar el texto.");
    }
  }

  if (editing) {
    return (
      <div className="min-w-0 flex-1 space-y-2">
        <Textarea
          value={draft}
          rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 70)))}
          autoFocus
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={update.isPending || !draft.trim()} onClick={save}>Guardar</Button>
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>Cancelar</Button>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Si corriges una palabra, la recordaremos para las próximas transcripciones.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`group/seg flex min-w-0 flex-1 items-start gap-1 ${className}`}>
      <p className="min-w-0 flex-1 leading-relaxed">
        {segment.text}
        {edited && (
          <span
            className="ml-1.5 align-middle text-[11px] text-[hsl(var(--muted-foreground))]"
            title={`Texto original: ${segment.originalText}`}
          >
            (corregido)
          </span>
        )}
      </p>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/seg:opacity-100 max-md:opacity-100">
        {edited && (
          <button
            type="button"
            aria-label="Restaurar texto original"
            title="Restaurar texto original"
            disabled={update.isPending}
            onClick={restore}
            className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Corregir texto"
          title="Corregir texto"
          onClick={startEditing}
          className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
