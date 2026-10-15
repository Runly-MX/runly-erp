import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";
import { filesError } from "../lib/files-error";

// Folder tree (+ virtual per-module folders) and the folder mutations. Every
// mutation toasts its own outcome and refreshes the tree and the file list.
export function useFilesFolders({ token, userId, enabled }) {
  const queryClient = useQueryClient();
  const treeQuery = useQuery({
    queryKey: ["files-folders", userId],
    queryFn: () => runly.files.folders.tree(token),
    enabled: Boolean(token) && enabled,
    staleTime: 30_000,
  });
  const folders = useMemo(() => treeQuery.data?.data?.folders ?? [], [treeQuery.data]);
  const modules = useMemo(() => treeQuery.data?.data?.modules ?? [], [treeQuery.data]);

  const run = useCallback(
    async (action, messages) => {
      try {
        const pending = action();
        toast.promise(pending, {
          loading: messages.loading,
          success: messages.success,
          error: (error) => filesError(error, messages.error),
        });
        const result = await pending;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["files-folders"] }),
          queryClient.invalidateQueries({ queryKey: ["files-list"] }),
        ]);
        return result;
      } catch {
        return null;
      }
    },
    [queryClient],
  );

  return {
    folders,
    modules,
    isLoading: treeQuery.isLoading,
    createFolder: (data) => run(() => runly.files.folders.create(data, token), { loading: "Creando carpeta...", success: "Carpeta creada", error: "No se pudo crear la carpeta" }),
    updateFolder: (id, data) => run(() => runly.files.folders.update(id, data, token), { loading: "Guardando carpeta...", success: "Carpeta actualizada", error: "No se pudo actualizar la carpeta" }),
    removeFolder: (id) => run(() => runly.files.folders.remove(id, token), { loading: "Eliminando carpeta...", success: "Carpeta eliminada; su contenido pasó a la carpeta superior", error: "No se pudo eliminar la carpeta" }),
    moveFiles: (fileIds, folderId) => run(() => runly.files.folders.moveFiles({ fileIds, folderId }, token), { loading: "Moviendo archivos...", success: "Archivos movidos", error: "No se pudieron mover los archivos" }),
  };
}
