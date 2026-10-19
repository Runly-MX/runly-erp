import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AvatarCropDialog, ViewerImageEditingContext } from "@runly/ui";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";

// Turns on the image editor ("Editar") in every AdvancedFileViewer that shows a
// FileAsset image. The API decides who may edit each file (per-module
// permissions), so a denied save just reports the server's message and keeps
// the editor open.
export function ImageEditingProvider({ children }) {
  const { session, refreshProfile } = useAuth();
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const token = session?.access_token;
  const queryClient = useQueryClient();

  // Any existing image can become the profile photo: it goes through the same
  // framing dialog and upload as a freshly picked photo.
  const setAsAvatar = useCallback(async (source, signedUrl) => {
    try {
      const blob = await (await fetch(signedUrl)).blob();
      setAvatarFile(new File([blob], source?.originalName || "foto", { type: blob.type || source?.mimeType || "image/jpeg" }));
    } catch {
      toast.error("No se pudo abrir la imagen");
    }
  }, []);

  async function confirmAvatar(file) {
    setAvatarBusy(true);
    try {
      await runly.profile.uploadAvatar(file, token);
      await refreshProfile(session);
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      setAvatarFile(null);
      toast.success("Foto de perfil actualizada");
    } catch {
      toast.error("No se pudo actualizar la foto de perfil");
    } finally {
      setAvatarBusy(false);
    }
  }

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
      setAsAvatar,
      saveCopy: run(runly.files.copyImage, "Copia guardada", "No se pudo guardar la copia"),
      replace: run(runly.files.replaceImage, "Imagen reemplazada", "No se pudo reemplazar la imagen"),
    };
  }, [token, queryClient, setAsAvatar]);

  return (
    <ViewerImageEditingContext.Provider value={value}>
      {children}
      <AvatarCropDialog open={Boolean(avatarFile)} onOpenChange={(next) => !next && setAvatarFile(null)} file={avatarFile} busy={avatarBusy} onConfirm={confirmAvatar} />
    </ViewerImageEditingContext.Provider>
  );
}
