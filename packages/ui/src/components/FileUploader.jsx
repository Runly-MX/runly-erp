import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "./Button.jsx";
import { FileCard } from "./FileCard.jsx";
import { cn } from "../lib/utils.js";

const FORMAT_CATALOG = [
  { tokens: ["image/*"], label: "Imagenes", exts: ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"] },
  { tokens: ["application/pdf", ".pdf"], label: "PDF", exts: ["pdf"] },
  { tokens: ["text/*", ".txt"], label: "Texto plano", exts: ["txt", "tsv", "log"] },
  { tokens: [".csv"], label: "CSV", exts: ["csv"] },
  { tokens: [".xlsx", ".xls"], label: "Excel", exts: ["xlsx", "xls"] },
  { tokens: [".doc", ".docx"], label: "Word", exts: ["doc", "docx"] },
  { tokens: [".zip", ".rar", ".7z"], label: "Comprimidos", exts: ["zip", "rar", "7z"] },
  { tokens: [".md", ".mdx"], label: "Markdown", exts: ["md", "mdx"] },
];

function buildFormatChips(accept) {
  if (!accept || accept === "*/*") return [];
  const parts = accept.split(",").map((p) => p.trim()).filter(Boolean);
  const usedLabels = new Set();
  const chips = [];
  for (const part of parts) {
    const group = FORMAT_CATALOG.find((g) => g.tokens.includes(part));
    if (group) {
      if (!usedLabels.has(group.label)) {
        usedLabels.add(group.label);
        chips.push({ label: group.label, exts: group.exts });
      }
    } else {
      chips.push({ label: part, exts: null });
    }
  }
  return chips;
}

export function FileUploader({
  value = null,
  onChange,
  onUpload,
  onUploadMany,
  multiple = false,
  accept = "*/*",
  maxSizeMB = 10,
  disabled = false,
  className,
  hint = "Arrastra un archivo o seleccionalo manualmente.",
  emptyLabel = "Subir archivo",
}) {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file) {
    if (!file) return;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`El archivo supera ${maxSizeMB} MB.`);
      return;
    }

    setError("");
    if (!onUpload) {
      onChange?.(file);
      return;
    }

    try {
      setIsUploading(true);
      const uploaded = await onUpload(file);
      onChange?.(uploaded);
    } catch (err) {
      setError(err?.message ?? "No se pudo subir el archivo.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    if (!multiple) {
      await handleFile(files[0]);
      return;
    }

    const oversized = files.find((file) => file.size > maxSizeMB * 1024 * 1024);
    if (oversized) {
      setError(`El archivo \"${oversized.name}\" supera ${maxSizeMB} MB.`);
      return;
    }

    setError("");

    if (!onUploadMany && !onUpload) {
      onChange?.(files);
      return;
    }

    try {
      setIsUploading(true);

      if (onUploadMany) {
        const uploadedMany = await onUploadMany(files);
        onChange?.(uploadedMany);
      } else {
        const uploadedItems = [];
        for (const file of files) {
          const uploaded = await onUpload(file);
          uploadedItems.push(uploaded);
        }
        onChange?.(uploadedItems);
      }
    } catch (err) {
      setError(err?.message ?? "No se pudieron subir los archivos.");
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(event) {
    event.preventDefault();
    if (disabled || isUploading) return;
    handleFiles(event.dataTransfer.files);
  }

  function clearFile() {
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("space-y-2", className)}>
      {value ? (
        <FileCard
          name={value.originalName ?? value.name}
          mimeType={value.mimeType}
          sizeBytes={value.sizeBytes}
          url={value.signedUrl ?? value.url}
          onRemove={disabled || isUploading ? null : clearFile}
        />
      ) : (
        <div
          onDrop={onDrop}
          onDragOver={(event) => event.preventDefault()}
          className={cn(
            "rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-4",
            "transition-colors hover:border-(--brand-primary)",
            disabled && "opacity-60 pointer-events-none",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--card))]">
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
              ) : (
                <Upload className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{emptyLabel}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {buildFormatChips(accept).map((chip) => (
                  <div key={chip.label} className="relative group inline-flex">
                    <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))] cursor-default hover:border-(--brand-primary)/40 hover:text-[hsl(var(--foreground))] transition-colors select-none">
                      {chip.label}
                    </span>
                    {chip.exts && (
                      <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-20 pointer-events-none min-w-max">
                        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-2 shadow-lg">
                          <p className="text-[10px] font-semibold text-[hsl(var(--foreground))] uppercase tracking-wide mb-1">{chip.label}</p>
                          <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">.{chip.exts.join(" · .")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <span className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))] select-none">
                  Max. {maxSizeMB} MB
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <input
              ref={inputRef}
              type="file"
              multiple={multiple}
              accept={accept}
              className="sr-only"
              // Reached through the "Seleccionar archivo" button: no second, unnamed tab stop.
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => handleFiles(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || isUploading}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading
                ? "Subiendo..."
                : multiple
                  ? "Seleccionar archivos"
                  : "Seleccionar archivo"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
