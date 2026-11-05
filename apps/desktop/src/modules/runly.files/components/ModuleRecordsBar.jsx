import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, SearchInput, Skeleton, cn } from "@runly/ui";
import { ChevronRight, Folder } from "lucide-react";
import { runly } from "../../../lib/runly";
import { moduleLabel } from "../lib/folders";

const MAX_CARDS = 60;

// Breadcrumb + one folder per record (project, employee, vehicle...) while
// browsing a module folder. The module root lists every attachment of the
// module; opening a record folder narrows the list to that record.
export function ModuleRecordsBar({ token, userId, moduleKey, record, onOpen }) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["files-records", userId, moduleKey],
    queryFn: () => runly.files.folders.records(moduleKey, token),
    enabled: Boolean(token && moduleKey),
    staleTime: 30_000,
  });
  const groups = useMemo(() => query.data?.data ?? [], [query.data]);
  const current = groups.find((g) => g.record === record);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? groups.filter((g) => g.label.toLowerCase().includes(q)) : groups;
  }, [groups, search]);

  return (
    <section aria-label="Carpetas del módulo" className="grid gap-3">
      <nav aria-label="Ruta" className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
        <Button variant="ghost" size="sm" className={cn("h-7 px-2", !record && "font-semibold")} onClick={() => onOpen("")}>
          {moduleLabel(moduleKey)}
        </Button>
        {record && (
          <span className="flex shrink-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
            <span className="max-w-64 truncate px-2 font-semibold">{current?.label ?? "Carpeta"}</span>
          </span>
        )}
      </nav>
      {!record && query.isLoading && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      )}
      {!record && groups.length > 0 && (
        <>
          {groups.length > 12 && (
            <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar carpeta..." aria-label="Buscar carpeta" className="sm:max-w-xs" />
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
            {visible.slice(0, MAX_CARDS).map((g) => (
              <button
                key={g.record}
                type="button"
                onClick={() => onOpen(g.record)}
                title={g.label}
                className="flex min-w-0 items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left transition-colors hover:bg-[hsl(var(--muted))]/50"
              >
                <Folder className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {g.count} {g.count === 1 ? "archivo" : "archivos"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {visible.length > MAX_CARDS && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Se muestran {MAX_CARDS} de {visible.length} carpetas. Usa la búsqueda para encontrar las demás.
            </p>
          )}
        </>
      )}
    </section>
  );
}
