import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, FileVisual, Skeleton, formatBytes } from "@runly/ui";
import { ChevronRight, Download, ExternalLink, Folder, FolderOpen, LinkIcon } from "lucide-react";
import { getApiUrl } from "../../../lib/runtimeConfig.js";

const UNAVAILABLE = {
  revocado: "El propietario revocó este enlace.",
  vencido: "Este enlace ya venció.",
  agotado: "Este enlace alcanzó su número máximo de usos.",
  no_disponible: "Esta carpeta ya no está disponible.",
};

async function publicFetch(path) {
  const response = await fetch(`${getApiUrl()}${path}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error ?? "Enlace no disponible");
    error.reason = json.reason ?? null;
    throw error;
  }
  return json.data;
}

// Anonymous browse/download page for a runly.files folder public link. Only
// opening the link counts as a use; moving between subfolders does not.
export default function PublicFolderScreen() {
  const { token } = useParams();
  const [folderId, setFolderId] = useState(null);
  const query = useQuery({
    queryKey: ["public-folder", token, folderId],
    queryFn: () => publicFetch(`/public/folders/${encodeURIComponent(token)}${folderId ? `?folder=${encodeURIComponent(folderId)}` : ""}`),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    placeholderData: (previous) => previous,
  });
  const data = query.data;

  if (query.isError && !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState
          icon={LinkIcon}
          title="Este enlace ya no está disponible"
          description={UNAVAILABLE[query.error.reason] ?? "Este enlace no existe o ya no está activo. Pide uno nuevo a quien te lo compartió."}
        />
      </div>
    );
  }

  const empty = data && !data.folders.length && !data.files.length;
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-5 p-4 md:p-8">
      <header className="flex items-center gap-3">
        {data?.company?.logoUrl ? <img src={data.company.logoUrl} alt={data.company.name} className="h-8 w-8 shrink-0 rounded-md object-contain" /> : null}
        <div className="min-w-0 flex-1">
          {data ? (
            <>
              <h1 className="truncate text-base font-semibold">{data.breadcrumbs[0]?.name ?? data.name}</h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{data.company?.name ? `Carpeta compartida por ${data.company.name}` : "Carpeta compartida"}</p>
            </>
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
        </div>
      </header>

      {data && data.breadcrumbs.length > 1 && (
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-sm">
          {data.breadcrumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />}
              <Button variant="ghost" size="sm" className="h-7 px-2" disabled={index === data.breadcrumbs.length - 1} onClick={() => setFolderId(crumb.isRoot ? data.breadcrumbs[0].id : crumb.id)}>
                {crumb.name}
              </Button>
            </span>
          ))}
        </nav>
      )}

      {!data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : empty ? (
        <EmptyState icon={FolderOpen} title="Esta carpeta está vacía" description="Todavía no hay archivos aquí." />
      ) : (
        <div className="grid gap-4">
          {data.folders.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
              {data.folders.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFolderId(item.id)}
                  className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left transition-colors hover:bg-[hsl(var(--muted))]/50"
                >
                  <Folder className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                </button>
              ))}
            </div>
          )}
          {data.files.length > 0 && (
            <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              {data.files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 p-3">
                  <FileVisual
                    file={{ mimeType: file.mimeType, originalName: file.name }}
                    previewUrl={file.previewUrl}
                    className="h-10 w-10 shrink-0 rounded-md object-cover bg-[hsl(var(--muted))]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatBytes(file.sizeBytes)}</p>
                  </div>
                  {file.previewUrl && (
                    <Button asChild variant="ghost" size="icon" title="Abrir">
                      <a href={file.previewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${file.name}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {file.downloadUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={file.downloadUrl} rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                        Descargar
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
