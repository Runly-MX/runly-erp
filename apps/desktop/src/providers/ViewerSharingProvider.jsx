import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PublicLinksPanel,
  ViewerSharingContext,
  viewerShareLink,
} from "@runly/ui";
import { Link2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";
import { LINK_MODES, publicFilePath } from "../modules/runly.files/components/FileSharingDialog";

const unwrap = (response) => response?.data ?? response;

function FileLinkDialog({ file, token, onClose }) {
  const linksApi = useMemo(() => {
    const withPath = (link) => ({ ...link, path: publicFilePath(link.token) });
    return {
      list: async () => (unwrap(await runly.files.listLinks(file.id, token)) ?? []).map(withPath),
      create: async ({ mode, label, expiresAt, maxUses }) =>
        withPath(unwrap(await runly.files.createLink(file.id, { mode, label, expiresAt, maxUses }, token))),
      revoke: (linkId) => runly.files.revokeLink(file.id, linkId, token),
    };
  }, [file.id, token]);

  async function copyPrivate() {
    try {
      // In Tauri there is no web origin, so the API builds the link.
      const url = viewerShareLink({ file }) || (await runly.files.getAccess(file.id, token))?.data?.shareUrl;
      if (!url) return toast.error("Configura la URL web de Runly en el servidor para compartir enlaces.");
      await navigator.clipboard.writeText(url);
      toast.success("Enlace de Runly copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent scrollable className="sm:max-w-xl max-h-[85dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Compartir enlace</DialogTitle>
          <DialogDescription className="truncate">{file.originalName ?? file.name}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Enlace privado de Runly</h3>
            <p className="text-sm text-muted-foreground">
              Solo abre para personas con sesión en Runly y acceso al archivo. No caduca.
            </p>
            <Button type="button" variant="outline" onClick={copyPrivate}>
              <Link2 className="h-4 w-4" />Copiar enlace privado
            </Button>
          </section>
          <section className="space-y-2 border-t pt-4">
            <PublicLinksPanel title="Enlaces públicos" api={linksApi} modes={LINK_MODES} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Makes AdvancedFileViewer's "Compartir enlace" offer a private Runly link or
// public links (with expiry / use limit / QR) for any FileAsset.
export function ViewerSharingProvider({ children }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [file, setFile] = useState(null);
  const value = useMemo(() => (token ? { shareLink: setFile } : null), [token]);
  return (
    <ViewerSharingContext.Provider value={value}>
      {children}
      {file && token ? <FileLinkDialog file={file} token={token} onClose={() => setFile(null)} /> : null}
    </ViewerSharingContext.Provider>
  );
}
