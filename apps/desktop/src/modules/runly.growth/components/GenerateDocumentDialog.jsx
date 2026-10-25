import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  SegmentedControl,
  SelectField,
} from "@runly/ui";
import { Files } from "lucide-react";
import { toast } from "sonner";

import { runly } from "../../../lib/runly.js";

const KIND = "growth.lead";
const FORMAT_LABELS = { docx: "Word", xlsx: "Excel", pptx: "PowerPoint", pdf: "PDF" };

// Generates a document of a lead from a published template of the Documents
// hub (kind growth.lead), as the template's own format (Word, Excel...) or PDF.
// `onGenerated` receives { generated, url, format, fileName, fileAssetId }.
export function GenerateDocumentDialog({ open, onOpenChange, leadId, token, onGenerated }) {
  const [templateId, setTemplateId] = useState("");
  const [output, setOutput] = useState("native");
  const {
    data: templatesResponse,
    isLoading: isTemplatesLoading,
    isError: isTemplatesError,
  } = useQuery({
    queryKey: ["documents", "file-templates", KIND],
    queryFn: () => runly.documents.listFileTemplates(token, { kind: KIND }),
    enabled: Boolean(open && token),
  });
  const templates = useMemo(
    () => (templatesResponse?.items ?? []).filter((template) => template.publishedVersionId),
    [templatesResponse],
  );
  const selected = templates.find((template) => template.id === templateId) ?? null;

  useEffect(() => {
    if (open && !templateId && templates.length) {
      setTemplateId((templates.find((t) => t.isDefault) ?? templates[0]).id);
    }
  }, [open, templateId, templates]);

  const nativeLabel = FORMAT_LABELS[selected?.format] ?? "Word";
  const effectiveOutput = selected?.format === "pdf" ? "pdf" : output;

  const mutation = useMutation({
    mutationFn: () =>
      runly.documents.generateDocument(
        { kind: KIND, templateId, sourceId: leadId, output: effectiveOutput },
        token,
      ),
    onSuccess: (result) => {
      onOpenChange(false);
      setTemplateId("");
      onGenerated(result);
      toast.success("Documento generado");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={Files}>
          <DialogTitle>Generar documento</DialogTitle>
          <DialogDescription>
            Elige una plantilla publicada del lead y el formato del documento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isTemplatesLoading ? <LoadingState label="Cargando plantillas..." /> : null}
          {isTemplatesError ? <ErrorState description="No se pudieron cargar las plantillas." /> : null}
          {!isTemplatesLoading && !isTemplatesError && templates.length === 0 ? (
            <EmptyState
              icon={Files}
              title="No hay plantillas publicadas"
              description="Sube y publica una plantilla de «Lead de Growth» en Documentos > Plantillas."
            />
          ) : null}
          {templates.length ? (
            <>
              <SelectField
                label="Plantilla"
                value={templateId}
                options={templates.map((template) => ({
                  value: template.id,
                  label: `${template.name} (${FORMAT_LABELS[template.format] ?? template.format})`,
                }))}
                onValueChange={setTemplateId}
              />
              {selected?.format === "pdf" ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Esta plantilla es un PDF; el documento se genera en PDF.</p>
              ) : (
                <SegmentedControl
                  ariaLabel="Formato de salida"
                  value={output}
                  onChange={setOutput}
                  options={[
                    { value: "native", label: nativeLabel },
                    { value: "pdf", label: "PDF" },
                  ]}
                />
              )}
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!templateId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Generando..." : `Generar ${effectiveOutput === "pdf" ? "PDF" : nativeLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
