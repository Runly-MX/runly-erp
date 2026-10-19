import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ViewerImageEditingContext } from "@runly/ui";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";

// Turns on the image editor ("Editar") in every AdvancedFileViewer that shows a
// FileAsset image. The API decides who may edit each file (per-module
// permissions), so a denied save just reports the server's message and keeps
// the editor open.
export function ImageEditingProvider({ children }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const value = useMemo(() => {
    if (!token) return null;
    const run = (call, success, failure) => async (edited, source) => {
      try {
        await call(source.id, edited, token);
      } catch (err) {
        toast.error(err?.message || failure);
        throw err;
      }
      toast.success(success);
      // Lists and cards across modules hold the old thumbnail; refetch what is on screen.
      queryClient.invalidateQueries();
      window.dispatchEvent(new Event("runly:files-changed"));
    };
    return {
      saveCopy: run(runly.files.copyImage, "Copia guardada", "No se pudo guardar la copia"),
      replace: run(runly.files.replaceImage, "Imagen reemplazada", "No se pudo reemplazar la imagen"),
    };
  }, [token, queryClient]);

  return <ViewerImageEditingContext.Provider value={value}>{children}</ViewerImageEditingContext.Provider>;
}
