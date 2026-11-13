import { Download, FolderOpen, FolderSymlink, Info, Link2, Pencil, Power, Trash2, Users } from "lucide-react";

// Right-click / row menu entries of the explorer list. `group` is the current
// selection when the item is part of it, so multi-selection gets bulk actions.
export function buildItemMenu(item, group, c) {
  if (group.length > 1) {
    const movableIds = group.filter((i) => i.type === "file" && c.canMoveFile(i.data)).map((i) => i.id);
    const movableFolders = group.filter((i) => i.type === "folder" && c.folderActions.canManage(i.data)).map((i) => i.id);
    return [
      ...(movableIds.length || movableFolders.length
        ? [{ label: `Mover ${movableIds.length + movableFolders.length} a carpeta...`, icon: FolderSymlink, onClick: () => c.moveItems({ fileIds: movableIds, folderIds: movableFolders }) }]
        : []),
      ...(group.some((i) => i.type === "file") ? [{ label: "Descargar como ZIP", icon: Download, onClick: () => c.handleBulkZip(group.filter((i) => i.type === "file").map((i) => i.id)) }] : []),
    ];
  }
  const f = item.data;
  if (item.type === "folder") {
    const manage = c.folderActions.canManage(f);
    return [
      { label: "Abrir", icon: FolderOpen, onClick: () => c.openItem(item) },
      ...(manage ? [
        { label: "Compartir", icon: Users, onClick: () => c.setFolderDialog({ type: "share", folder: f }) },
        { label: "Renombrar", icon: Pencil, onClick: () => c.renameItem(item) },
        { label: "Mover a...", icon: FolderSymlink, onClick: () => c.setFolderDialog({ type: "move", folder: f }) },
      ] : []),
      { label: "Propiedades", icon: Info, onClick: () => c.setFolderDialog({ type: "properties", folder: f }) },
      ...(manage ? [{ label: "Eliminar", icon: Trash2, variant: "destructive", onClick: () => c.deleteItem(item) }] : []),
    ];
  }
  const manageable = f.accessScope !== "RESTRICTED" || c.isAdmin || f.uploadedById === c.profileId;
  return [
    { label: "Abrir", icon: FolderOpen, onClick: () => c.openViewer(f) },
    { label: "Descargar", icon: Download, onClick: () => c.downloadFile(f) },
    { label: "Copiar enlace", icon: Link2, onClick: () => c.copyLink(f) },
    { label: "Compartir y permisos", icon: Users, onClick: () => c.setShareFile(f) },
    ...(c.canMoveFile(f) ? [{ label: "Mover a carpeta...", icon: FolderSymlink, onClick: () => c.moveItems({ fileIds: [f.id] }) }] : []),
    ...(c.hasPermission("files.assets.update") && manageable ? [
      { label: "Renombrar", icon: Pencil, onClick: () => c.renameItem(item) },
      { label: f.enabled ? "Deshabilitar" : "Habilitar", icon: Power, onClick: () => c.setToggleTarget({ id: f.id, enabled: !f.enabled, name: f.originalName }) },
    ] : []),
    { label: "Propiedades", icon: Info, onClick: () => c.openDetail(f, true) },
    ...(c.hasPermission("files.assets.delete") && manageable ? [{ label: "Eliminar", icon: Trash2, variant: "destructive", onClick: () => c.deleteItem(item) }] : []),
  ];
}
