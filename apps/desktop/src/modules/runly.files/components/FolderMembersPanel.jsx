import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, PersonOption, SearchInput } from "@runly/ui";
import { UserPlus, X } from "lucide-react";
import { UserAvatar, UserPickerItem, UserListSkeleton } from "../../runly.chat/components/UserPicker";
import { runly } from "../../../lib/runly";
import { filesError } from "../lib/files-error";

const unwrap = (response) => response?.data ?? response;

// People a folder is shared with by name. They see the folder, its
// subfolders and every document inside them, and can add files to it.
export function FolderMembersPanel({ folder, token }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const membersKey = ["files-folder-members", folder.id];
  const members = useQuery({ queryKey: membersKey, queryFn: async () => unwrap(await runly.files.folders.members(folder.id, token)) ?? [] });
  const candidates = useQuery({
    queryKey: ["files-folder-candidates", folder.id, search],
    queryFn: async () => unwrap(await runly.files.folders.memberCandidates(folder.id, search, token)) ?? [],
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey }),
      queryClient.invalidateQueries({ queryKey: ["files-folder-candidates", folder.id] }),
      queryClient.invalidateQueries({ queryKey: ["files-folders"] }),
    ]);
  const add = useMutation({
    mutationFn: () => runly.files.folders.addMembers(folder.id, selected.map((u) => u.id), token),
    onSuccess: () => setSelected([]),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (userId) => runly.files.folders.removeMember(folder.id, userId, token), onSettled: refresh });
  const toggle = (user) => setSelected((prev) => (prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]));
  const options = candidates.data ?? [];

  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor="folder-member-search" className="text-sm font-medium">
          Compartir con personas de la empresa
        </label>
        <SearchInput id="folder-member-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre o correo..." className="mt-1.5" />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--muted))] py-1 pl-1 pr-2 text-xs">
              <UserAvatar user={u} size="sm" />
              <span className="max-w-36 truncate">{u.displayName}</span>
              <button type="button" onClick={() => toggle(u)} aria-label={`Quitar a ${u.displayName}`} className="rounded-full p-0.5 hover:bg-[hsl(var(--border))]">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="max-h-48 overflow-y-auto rounded-md border p-1">
        {candidates.isError ? (
          <p role="alert" className="px-3 py-4 text-sm text-destructive">
            No se pudieron cargar las personas. Vuelve a buscar.
          </p>
        ) : candidates.isLoading ? (
          <UserListSkeleton />
        ) : options.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">Sin personas disponibles</p>
        ) : (
          options.map((u) => <UserPickerItem key={u.id} user={u} selected={selected.some((s) => s.id === u.id)} onToggle={toggle} />)
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => add.mutate()} disabled={!selected.length || add.isPending}>
          <UserPlus className="h-4 w-4" />
          {add.isPending ? "Compartiendo..." : `Compartir${selected.length ? ` (${selected.length})` : ""}`}
        </Button>
      </div>
      {(add.isError || remove.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {filesError(add.error ?? remove.error)}
        </p>
      )}
      {members.isLoading ? (
        <UserListSkeleton />
      ) : (members.data ?? []).length ? (
        <ul className="grid gap-2">
          {members.data.map((m) => (
            <li key={m.userId} className="border-t pt-2">
              <PersonOption
                user={m.user ?? { displayName: "Usuario" }}
                className="px-0 py-0"
                trailing={
                  <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(m.userId)}>
                    Quitar
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState variant="compact" title="Todavía no compartiste esta carpeta con nadie." />
      )}
    </div>
  );
}
