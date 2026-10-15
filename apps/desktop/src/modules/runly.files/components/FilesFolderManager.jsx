import { useState } from "react";
import { ConfirmDialog } from "@runly/ui";
import { Trash2 } from "lucide-react";
import { FolderExplorerBar } from "./FolderExplorerBar";
import { FolderNameDialog, FolderPickerDialog, FolderShareDialog } from "./FolderDialogs";
import { ROOT_FOLDER } from "../lib/folders";

// Folder browsing UI for "Mis carpetas" plus every folder/file-move dialog.
// `moveFileIds` is set by the screen when files are sent to a folder.
export function FilesFolderManager({
  api,
  token,
  folder,
  showBar,
  canCreate,
  canUpdate,
  canDelete,
  profileId,
  isCompanyAdmin,
  moveFileIds,
  onMoveFilesClose,
  onOpen,
}) {
  const [dialog, setDialog] = useState(null);
  const { folders } = api;
  const current = folder && folder !== ROOT_FOLDER ? folders.find((f) => f.id === folder) : null;
  const manageable = (f) => Boolean(isCompanyAdmin || f.createdById === profileId);
  const close = () => setDialog(null);

  return (
    <>
      {showBar && (
        <FolderExplorerBar
          folders={folders}
          folder={folder}
          canCreate={canCreate}
          canManage={(f) => manageable(f) && (canUpdate || canDelete)}
          onOpen={onOpen}
          onCreate={() => setDialog({ type: "create" })}
          onRename={(f) => setDialog({ type: "rename", folder: f })}
          onMove={(f) => setDialog({ type: "move", folder: f })}
          onShare={(f) => setDialog({ type: "share", folderId: f.id })}
          onDelete={(f) => setDialog({ type: "delete", folder: f })}
        />
      )}

      {dialog?.type === "create" && (
        <FolderNameDialog
          open
          parentShared={current?.scope === "COMPANY"}
          onOpenChange={(open) => !open && close()}
          onSubmit={async ({ name, scope }) => {
            const created = await api.createFolder({ name, scope, parentId: current?.id ?? null });
            if (created) close();
          }}
        />
      )}
      {dialog?.type === "rename" && (
        <FolderNameDialog
          open
          folder={dialog.folder}
          onOpenChange={(open) => !open && close()}
          onSubmit={async ({ name }) => {
            if (await api.updateFolder(dialog.folder.id, { name })) close();
          }}
        />
      )}
      {dialog?.type === "move" && (
        <FolderPickerDialog
          open
          title={`Mover «${dialog.folder.name}»`}
          description="Elige la carpeta de destino."
          folders={folders}
          moving={dialog.folder.id}
          current={dialog.folder.parentId}
          onOpenChange={(open) => !open && close()}
          onSubmit={async (parentId) => {
            if (await api.updateFolder(dialog.folder.id, { parentId })) close();
          }}
        />
      )}
      {moveFileIds?.length > 0 && (
        <FolderPickerDialog
          open
          title={moveFileIds.length === 1 ? "Mover archivo" : `Mover ${moveFileIds.length} archivos`}
          description="Solo se pueden mover documentos de Archivos que hayas subido tú."
          folders={folders}
          current={current?.id ?? null}
          onOpenChange={(open) => !open && onMoveFilesClose(false)}
          onSubmit={async (folderId) => {
            if (await api.moveFiles(moveFileIds, folderId)) onMoveFilesClose(true);
          }}
        />
      )}
      {dialog?.type === "share" && folders.some((f) => f.id === dialog.folderId) && (
        <FolderShareDialog
          folder={folders.find((f) => f.id === dialog.folderId)}
          token={token}
          onOpenChange={(open) => !open && close()}
          onChangeScope={(scope) => api.updateFolder(dialog.folderId, { scope })}
        />
      )}
      <ConfirmDialog
        open={dialog?.type === "delete"}
        onOpenChange={(open) => !open && close()}
        title="¿Eliminar carpeta?"
        icon={Trash2}
        description="Los archivos y subcarpetas que contiene no se borran: pasan a la carpeta superior. Sus enlaces públicos dejan de funcionar."
        detail={dialog?.folder?.name}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const target = dialog.folder;
          if (await api.removeFolder(target.id)) {
            close();
            if (folder === target.id) onOpen(target.parentId ?? ROOT_FOLDER);
          }
        }}
      />
    </>
  );
}
