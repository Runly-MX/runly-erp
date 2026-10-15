import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PublicLinksPanel,
  SelectField,
  cn,
} from "@runly/ui";
import { ChevronRight, Folder, FolderTree, Users } from "lucide-react";
import { runly } from "../../../lib/runly";
import { ROOT_FOLDER, childrenOf, descendantIds, publicFolderPath } from "../lib/folders";

const SCOPES = [
  { value: "PRIVATE", label: "Privada: solo tú (y administradores)" },
  { value: "COMPANY", label: "Toda la empresa" },
];
const LINK_MODES = [
  { value: "view", label: "Solo ver" },
  { value: "download", label: "Ver y descargar" },
];

// Create / rename. `folder` is the folder being renamed (null = create).
export function FolderNameDialog({ open, folder, parentShared, pending, onSubmit, onOpenChange }) {
  const [name, setName] = useState(folder?.name ?? "");
  const [scope, setScope] = useState(folder?.scope ?? "PRIVATE");
  const trimmed = name.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onSubmit({ name: trimmed, scope });
          }}
        >
          <DialogHeader>
            <DialogTitle>{folder ? "Renombrar carpeta" : "Nueva carpeta"}</DialogTitle>
            <DialogDescription>
              {folder ? "Cambia el nombre de la carpeta." : "Organiza tus archivos en carpetas y subcarpetas."}
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus value={name} maxLength={120} placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta" onChange={(event) => setName(event.target.value)} />
          {!folder && (
            <SelectField
              id="folder-scope"
              label="Quién la ve"
              value={parentShared ? "COMPANY" : scope}
              options={SCOPES}
              disabled={parentShared}
              onChange={setScope}
            />
          )}
          {!folder && parentShared && <p className="-mt-2 text-xs text-[hsl(var(--muted-foreground))]">Está dentro de una carpeta compartida con la empresa.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!trimmed || pending}>
              {folder ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PickerNode({ folders, parentId, depth, selected, blocked, onPick }) {
  return childrenOf(folders, parentId).map((f) => {
    const disabled = blocked.has(f.id);
    return (
      <div key={f.id}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(f.id)}
          style={{ paddingLeft: 8 + depth * 16 }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors disabled:opacity-40",
            selected === f.id ? "bg-[hsl(var(--muted))] font-medium" : "hover:bg-[hsl(var(--muted))]/60",
          )}
        >
          {depth > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" />}
          {f.scope === "COMPANY" ? <Users className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
          <span className="truncate">{f.name}</span>
        </button>
        <PickerNode folders={folders} parentId={f.id} depth={depth + 1} selected={selected} blocked={blocked} onPick={onPick} />
      </div>
    );
  });
}

// Destination picker for moving files or a folder. `moving` (a folder id)
// blocks that folder and everything inside it.
export function FolderPickerDialog({ open, title, description, folders, moving = null, current = null, pending, onSubmit, onOpenChange }) {
  const [selected, setSelected] = useState(current ?? ROOT_FOLDER);
  const blocked = useMemo(() => (moving ? descendantIds(folders, moving) : new Set()), [folders, moving]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border border-[hsl(var(--border))] p-1">
          <button
            type="button"
            onClick={() => setSelected(ROOT_FOLDER)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              selected === ROOT_FOLDER ? "bg-[hsl(var(--muted))] font-medium" : "hover:bg-[hsl(var(--muted))]/60",
            )}
          >
            <FolderTree className="h-4 w-4 shrink-0" />
            Mis carpetas (raíz)
          </button>
          <PickerNode folders={folders} parentId={null} depth={1} selected={selected} blocked={blocked} onPick={setSelected} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={pending || blocked.has(selected)} onClick={() => onSubmit(selected === ROOT_FOLDER ? null : selected)}>
            Mover aquí
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Who sees the folder + its public links (anyone with a link browses the
// folder, its subfolders and their files without logging in).
export function FolderShareDialog({ folder, token, pending, onChangeScope, onOpenChange }) {
  const linksApi = useMemo(() => {
    const unwrap = (response) => response?.data ?? response;
    const withPath = (link) => ({ ...link, path: publicFolderPath(link.token) });
    return {
      list: async () => (unwrap(await runly.files.folders.listLinks(folder.id, token)) ?? []).map(withPath),
      create: async ({ mode, label, expiresAt, maxUses }) => withPath(unwrap(await runly.files.folders.createLink(folder.id, { mode, label, expiresAt, maxUses }, token))),
      revoke: (linkId) => runly.files.folders.revokeLink(folder.id, linkId, token),
    };
  }, [folder.id, token]);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Compartir «{folder.name}»</DialogTitle>
          <DialogDescription>Define quién ve la carpeta dentro de Runly y crea enlaces para personas externas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <SelectField id="folder-share-scope" label="Quién la ve en Runly" value={folder.scope} options={SCOPES} disabled={pending} onChange={onChangeScope} />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Al compartirla con la empresa, también se comparten las subcarpetas. Los archivos que muevas a una carpeta compartida pasan a ser visibles para la empresa.
            </p>
          </div>
          <div className="border-t pt-4">
            <PublicLinksPanel title="Enlaces públicos" api={linksApi} modes={LINK_MODES} />
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
              Quien tenga el enlace ve los archivos de esta carpeta y de sus subcarpetas, aunque no tenga cuenta en Runly.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
