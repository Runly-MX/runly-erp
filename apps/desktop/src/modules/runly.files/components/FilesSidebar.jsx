import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger, cn } from "@runly/ui";
import {
  Building2,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSymlink,
  FolderTree,
  Mail,
  Pencil,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";
import { ROOT_FOLDER, childrenOf, folderPath, moduleLabel } from "../lib/folders";
import { useItemDropTarget } from "../lib/dnd";

export const FILES_WORKSPACES = ["mine", "folders", "shared", "modules", "invitations", "all"];

const MAX_RECORDS = 150;
const LINE = "bg-[hsl(var(--border))]";

// One indent column of the guide lines (same drawing as the inventory area tree):
// the last column of a nested row is its elbow, the others continue the parent line.
function GuideCell({ continues, elbow, isLast }) {
  return (
    <span aria-hidden="true" className="relative w-5 shrink-0 self-stretch">
      {elbow ? (
        <>
          <span className={cn("absolute left-1/2 top-0 w-px", LINE, isLast ? "h-1/2" : "h-full")} />
          <span className={cn("absolute left-1/2 right-0 top-1/2 h-px", LINE)} />
        </>
      ) : continues ? (
        <span className={cn("absolute inset-y-0 left-1/2 w-px", LINE)} />
      ) : null}
    </span>
  );
}

// `guides`: one boolean per ancestor level (does that level's line continue below?).
function Row({ active, guides = [], isLast, icon: Icon, label, count, expandable, expanded, onToggle, onClick, title, onDropItems, dropId, onSpring }) {
  const drop = useItemDropTarget(onDropItems, onSpring);
  return (
    <div className="flex items-stretch">
      {guides.map((continues, column) => (
        <GuideCell key={column} continues={continues} elbow={column === guides.length - 1} isLast={isLast} />
      ))}
      <div
        {...drop.props}
        data-drop-id={onDropItems ? dropId : undefined}
        className={cn(
          "relative my-px flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-md pr-2 text-sm transition-colors duration-150",
          drop.isOver && "bg-[var(--brand-primary)]/20 ring-1 ring-[var(--brand-primary)]",
          "[&[data-drop-hover=true]]:bg-[var(--brand-primary)]/20",
          active
            ? "bg-[var(--brand-primary)]/12 font-medium text-[var(--brand-primary)]"
            : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/60",
        )}
      >
        {active && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[var(--brand-primary)]" />}
        {expandable ? (
          <button
            type="button"
            aria-label={expanded ? "Contraer" : "Expandir"}
            onClick={onToggle}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform duration-150", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-2 shrink-0" />
        )}
        <button
          type="button"
          onClick={onClick}
          title={title ?? label}
          aria-current={active ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[var(--brand-primary)]" : "text-[hsl(var(--muted-foreground))]")} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {count > 0 && (
            <span className="ml-1 shrink-0 rounded-md bg-[hsl(var(--muted))]/70 px-1.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
              {count}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// Record folders of one module (a project, an employee, a vehicle...). Shares
// its cache with ModuleRecordsBar; large modules show the first MAX_RECORDS and
// leave the rest to the folder search in the main area.
function ModuleRecordRows({ moduleKey, record, guides, onSelect, onOpenModule }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const query = useQuery({
    queryKey: ["files-records", session?.user?.id, moduleKey],
    queryFn: () => runly.files.folders.records(moduleKey, token),
    enabled: Boolean(token && moduleKey),
    staleTime: 30_000,
  });
  const groups = query.data?.data ?? [];
  if (query.isLoading) {
    return <Row guides={[...guides, false]} isLast icon={Folder} label="Cargando..." onClick={() => {}} />;
  }
  const shown = groups.slice(0, MAX_RECORDS);
  const more = groups.length - shown.length;
  return (
    <>
      {shown.map((g, index) => (
        <Row
          key={g.record}
          guides={[...guides, false]}
          isLast={index === shown.length - 1 && more <= 0}
          icon={Folder}
          label={g.label}
          count={g.count}
          active={record === g.record}
          onClick={() => onSelect(g.record)}
        />
      ))}
      {more > 0 && (
        <Row guides={[...guides, false]} isLast icon={FolderTree} label={`${more} carpetas más`} onClick={onOpenModule} />
      )}
    </>
  );
}

// Left tree of the explorer: Recientes (default, by modification), Mis
// carpetas (user folders, nested), Compartidos conmigo, per-module folders
// (virtual: where each module's attachments live, with one folder per record)
// and invitations.
// `folderActions` ({ canCreate, canManage(folder), open(dialog) }) adds the
// right-click menu on user folders; the dialogs live in FilesFolderManager.
export function FilesSidebar({ workspace, folder, moduleKey, record, folders, modules, isCompanyAdmin, folderActions, onSelect, onDropItems }) {
  const [open, setOpen] = useState(() => new Set(["folders", "modules"]));
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const expand = (key) => setOpen((prev) => (prev.has(key) ? prev : new Set([...prev, key])));

  // Reveal the active folder by opening its ancestors.
  useEffect(() => {
    if (workspace !== "folders" || !folder || folder === ROOT_FOLDER) return;
    const ancestors = folderPath(folders, folder).slice(0, -1).map((f) => f.id);
    if (ancestors.length) setOpen((prev) => new Set([...prev, "folders", ...ancestors]));
  }, [workspace, folder, folders]);

  // Reveal the active module's record folders.
  useEffect(() => {
    if (workspace === "modules" && moduleKey)
      setOpen((prev) => (prev.has(`m:${moduleKey}`) ? prev : new Set([...prev, "modules", `m:${moduleKey}`])));
  }, [workspace, moduleKey]);

  // `guides` are the ancestor columns; the child's own column is the elbow.
  function renderFolders(parentId, guides) {
    const list = childrenOf(folders, parentId);
    return list.map((f, index) => {
      const kids = childrenOf(folders, f.id);
      const isOpen = open.has(f.id);
      const last = index === list.length - 1;
      const row = (
        <Row
          guides={[...guides, true]}
          isLast={last}
          icon={f.scope === "COMPANY" ? Users : f.memberCount ? Share2 : isOpen && kids.length ? FolderOpen : Folder}
          label={f.name}
          active={workspace === "folders" && folder === f.id}
          expandable={kids.length > 0}
          expanded={isOpen}
          onToggle={() => toggle(f.id)}
          onClick={() => onSelect({ workspace: "folders", folder: f.id })}
          dropId={f.id}
          onSpring={kids.length && !isOpen ? () => expand(f.id) : undefined}
          onDropItems={onDropItems && ((payload) => onDropItems(payload, f.id))}
        />
      );
      return (
        <div key={f.id}>
          {folderActions ? (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div>{row}</div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => onSelect({ workspace: "folders", folder: f.id })}>
                  <FolderOpen />
                  Abrir
                </ContextMenuItem>
                {folderActions.canCreate && (
                  <ContextMenuItem onSelect={() => folderActions.open({ type: "create", parentId: f.id })}>
                    <FolderPlus />
                    Nueva subcarpeta
                  </ContextMenuItem>
                )}
                {folderActions.canManage(f) && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => folderActions.open({ type: "share", folder: f })}>
                      <Share2 />
                      Compartir
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => folderActions.open({ type: "rename", folder: f })}>
                      <Pencil />
                      Renombrar
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => folderActions.open({ type: "move", folder: f })}>
                      <FolderSymlink />
                      Mover a...
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => folderActions.open({ type: "delete", folder: f })}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 />
                      Eliminar
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          ) : (
            row
          )}
          {isOpen && renderFolders(f.id, [...guides, !last])}
        </div>
      );
    });
  }

  return (
    <nav aria-label="Carpetas" className="grid content-start" onContextMenu={(e) => e.preventDefault()}>
      <Row icon={Clock} label="Recientes" active={workspace === "mine"} onClick={() => onSelect({ workspace: "mine" })} />
      <Row icon={Share2} label="Compartidos conmigo" active={workspace === "shared"} onClick={() => onSelect({ workspace: "shared" })} />
      <Row icon={Mail} label="Invitaciones" active={workspace === "invitations"} onClick={() => onSelect({ workspace: "invitations" })} />
      {isCompanyAdmin && <Row icon={Users} label="Todos" active={workspace === "all"} onClick={() => onSelect({ workspace: "all" })} />}
      <div role="separator" className="mx-1 my-1.5 h-px bg-[hsl(var(--border))]" />
      <Row
        icon={FolderTree}
        label="Mis carpetas"
        active={workspace === "folders" && folder === ROOT_FOLDER}
        expandable={folders.length > 0}
        expanded={open.has("folders")}
        onToggle={() => toggle("folders")}
        onClick={() => onSelect({ workspace: "folders", folder: ROOT_FOLDER })}
        dropId={ROOT_FOLDER}
        onSpring={folders.length && !open.has("folders") ? () => expand("folders") : undefined}
        onDropItems={onDropItems && ((payload) => onDropItems(payload, null))}
      />
      {open.has("folders") && renderFolders(null, [])}
      <Row
        icon={Building2}
        label="Del sistema"
        title="Carpetas que generan los módulos (Proyectos, Inventario...). Se consultan aquí; su contenido lo administra cada módulo."
        active={workspace === "modules" && !moduleKey}
        expandable={modules.length > 0}
        expanded={open.has("modules")}
        onToggle={() => toggle("modules")}
        onClick={() => onSelect({ workspace: "modules" })}
      />
      {open.has("modules") &&
        modules.map((m, index) => {
          const isOpen = open.has(`m:${m.moduleKey}`);
          const last = index === modules.length - 1;
          const inModule = workspace === "modules" && moduleKey === m.moduleKey;
          const openModule = () => onSelect({ workspace: "modules", moduleKey: m.moduleKey });
          return (
            <div key={m.moduleKey}>
              <Row
                guides={[true]}
                isLast={last}
                icon={isOpen ? FolderOpen : Folder}
                label={moduleLabel(m.moduleKey)}
                count={m.count}
                active={inModule && !record}
                expandable
                expanded={isOpen}
                onToggle={() => toggle(`m:${m.moduleKey}`)}
                onClick={openModule}
              />
              {isOpen && (
                <ModuleRecordRows
                  moduleKey={m.moduleKey}
                  record={inModule ? record : null}
                  guides={[!last]}
                  onOpenModule={openModule}
                  onSelect={(next) => onSelect({ workspace: "modules", moduleKey: m.moduleKey, record: next })}
                />
              )}
            </div>
          );
        })}
    </nav>
  );
}
