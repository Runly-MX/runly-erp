import { useEffect, useState } from "react";
import { cn } from "@runly/ui";
import {
  Building2,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  FolderTree,
  Mail,
  Share2,
  Users,
} from "lucide-react";
import { ROOT_FOLDER, childrenOf, folderPath, moduleLabel } from "../lib/folders";

export const FILES_WORKSPACES = ["mine", "folders", "shared", "modules", "invitations", "all"];

function Row({ active, depth = 0, icon: Icon, label, count, expandable, expanded, onToggle, onClick, title }) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md pr-2 text-sm transition-colors",
        active
          ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
          : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]",
      )}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "Contraer" : "Expandir"}
          onClick={onToggle}
          className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onClick}
        title={title ?? label}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{count}</span>}
      </button>
    </div>
  );
}

// Left tree of the explorer: Recientes (default, by modification), Mis
// carpetas (user folders, nested), Compartidos conmigo, per-module folders
// (virtual: where each module's attachments live) and invitations.
export function FilesSidebar({ workspace, folder, moduleKey, folders, modules, isCompanyAdmin, onSelect }) {
  const [open, setOpen] = useState(() => new Set(["folders", "modules"]));
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Reveal the active folder by opening its ancestors.
  useEffect(() => {
    if (workspace !== "folders" || !folder || folder === ROOT_FOLDER) return;
    const ancestors = folderPath(folders, folder).slice(0, -1).map((f) => f.id);
    if (ancestors.length) setOpen((prev) => new Set([...prev, "folders", ...ancestors]));
  }, [workspace, folder, folders]);

  function renderFolders(parentId, depth) {
    return childrenOf(folders, parentId).map((f) => {
      const kids = childrenOf(folders, f.id);
      const isOpen = open.has(f.id);
      return (
        <div key={f.id}>
          <Row
            depth={depth}
            icon={f.scope === "COMPANY" ? Users : isOpen && kids.length ? FolderOpen : Folder}
            label={f.name}
            active={workspace === "folders" && folder === f.id}
            expandable={kids.length > 0}
            expanded={isOpen}
            onToggle={() => toggle(f.id)}
            onClick={() => onSelect({ workspace: "folders", folder: f.id })}
          />
          {isOpen && renderFolders(f.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <nav aria-label="Carpetas" className="grid content-start gap-0.5">
      <Row icon={Clock} label="Recientes" active={workspace === "mine"} onClick={() => onSelect({ workspace: "mine" })} />
      <Row
        icon={FolderTree}
        label="Mis carpetas"
        active={workspace === "folders" && folder === ROOT_FOLDER}
        expandable={folders.length > 0}
        expanded={open.has("folders")}
        onToggle={() => toggle("folders")}
        onClick={() => onSelect({ workspace: "folders", folder: ROOT_FOLDER })}
      />
      {open.has("folders") && renderFolders(null, 1)}
      <Row icon={Share2} label="Compartidos conmigo" active={workspace === "shared"} onClick={() => onSelect({ workspace: "shared" })} />
      <Row
        icon={Building2}
        label="Módulos"
        active={workspace === "modules" && !moduleKey}
        expandable={modules.length > 0}
        expanded={open.has("modules")}
        onToggle={() => toggle("modules")}
        onClick={() => onSelect({ workspace: "modules" })}
      />
      {open.has("modules") &&
        modules.map((m) => (
          <Row
            key={m.moduleKey}
            depth={1}
            icon={Folder}
            label={moduleLabel(m.moduleKey)}
            count={m.count}
            active={workspace === "modules" && moduleKey === m.moduleKey}
            onClick={() => onSelect({ workspace: "modules", moduleKey: m.moduleKey })}
          />
        ))}
      <Row icon={Mail} label="Invitaciones" active={workspace === "invitations"} onClick={() => onSelect({ workspace: "invitations" })} />
      {isCompanyAdmin && <Row icon={Users} label="Todos" active={workspace === "all"} onClick={() => onSelect({ workspace: "all" })} />}
    </nav>
  );
}
