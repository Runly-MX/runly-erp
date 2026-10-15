import { useCallback, useMemo } from "react";
import { Button, MediaGallery } from "@runly/ui";
import { FolderSymlink } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";
import { moduleLabel } from "../lib/folders";

const ZIP_CHUNK = 50; // the files API accepts up to 50 files per ZIP
const GROUPINGS = [{ key: "group", label: "Por origen" }];

// Gallery mode of the explorer: the shared MediaGallery (date groups,
// grid/cards/table, long-press selection, viewer) over the current page.
export function FilesGalleryView({ files, token, loading, onOpenFile, onMove }) {
  const items = useMemo(
    () =>
      files.map((file) => ({
        id: file.id,
        fileAssetId: file.id,
        name: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        date: file.updatedAt ?? file.createdAt,
        groupId: file.moduleKey ?? "runly.files",
        groupLabel: !file.moduleKey || file.moduleKey === "runly.files" || file.moduleKey === "atlas.files" ? "Archivos" : moduleLabel(file.moduleKey),
        file,
      })),
    [files],
  );

  const resolveSignedUrl = useCallback(
    async (fileAssetId, variant) => {
      if (!fileAssetId || !token) return null;
      try {
        const response = await runly.files.getSignedUrl(fileAssetId, token, variant ? { variant } : {});
        return response?.data?.signedUrl ?? null;
      } catch {
        return null;
      }
    },
    [token],
  );

  async function download(list) {
    const ids = [...new Set(list.map((item) => item.fileAssetId))];
    const chunks = Array.from({ length: Math.ceil(ids.length / ZIP_CHUNK) }, (_, i) => ids.slice(i * ZIP_CHUNK, (i + 1) * ZIP_CHUNK));
    const toastId = toast.loading(chunks.length > 1 ? `Preparando ${chunks.length} archivos ZIP...` : "Preparando descarga...");
    try {
      for (const fileIds of chunks) {
        const response = await runly.files.bulkDownload({ fileIds, mode: "zip" }, token);
        const url = response?.data?.signedUrl;
        if (!url) throw new Error("No se pudo preparar la descarga.");
        const link = document.createElement("a");
        link.href = url;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      toast.success("Descarga lista.", { id: toastId });
    } catch (error) {
      toast.error(error?.message ?? "No se pudo preparar la descarga.", { id: toastId });
    }
  }

  return (
    <MediaGallery
      items={items}
      loading={loading}
      resolveSignedUrl={resolveSignedUrl}
      onDownload={download}
      groupings={GROUPINGS}
      storageKey="files"
      showKindFilter={false}
      views={["grid", "cards"]}
      onOpenItem={(item) => onOpenFile(item.file)}
      selectionActions={
        onMove
          ? ({ items: picked, clear }) => (
              <Button variant="outline" size="sm" aria-label="Mover a carpeta" onClick={() => onMove(picked.map((i) => i.id), clear)}>
                <FolderSymlink className="h-4 w-4 sm:mr-1.5" />
                <span className="max-sm:sr-only">Mover</span>
              </Button>
            )
          : null
      }
      emptyDescription="Aquí aparecen las fotos y documentos de esta vista."
    />
  );
}
