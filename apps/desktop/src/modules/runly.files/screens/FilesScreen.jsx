import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageFooter,
  PageHeader,
  useIsMobile,
  useOfficeActions,
} from "@runly/ui";
import { getOfficeFormat } from "@runly/core";
import { FolderOpen, Loader2, SearchX } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";
import { useFilesExplorer } from "../hooks/useFilesExplorer";
import { FilesToolbar } from "../components/FilesToolbar";
import { FilesWorkspaceTable } from "../components/FilesWorkspaceTable";
import { FilesWorkspaceHeader } from "../components/FilesWorkspaceHeader";
import { CreateDocumentDialog } from "../components/CreateDocumentDialog";
import { FileSharingDialog } from "../components/FileSharingDialog";
import { FileInvitations } from "../components/FileInvitations";
import { FilesGalleryView } from "../components/FilesGalleryView";
import { FilesSelectionBar } from "../components/FilesSelectionBar";
import { AdvancedFileViewer, getFileKind } from "@runly/ui";
import { FileDetailPanel } from "../components/FileDetailPanel";
import { FileRenameModal } from "../components/FileRenameModal";
import { FilesUploadDialog } from "../components/FilesUploadDialog";
import { FILES_WORKSPACES } from "../components/FilesSidebar";
import { FilesNavigation } from "../components/FilesNavigation";
import { FilesFolderManager } from "../components/FilesFolderManager";
import { FilesUploadQueue } from "../components/FilesUploadQueue";
import { useFilesFolders } from "../hooks/useFilesFolders";
import { ROOT_FOLDER, moduleLabel } from "../lib/folders";

function useFileIdFromPath(pathname) {
  return useMemo(() => {
    const match = pathname.match(/\/app\/m\/runly\.files\/files\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }, [pathname]);
}

const PAGE_SIZES = [20, 50, 100];

export default function FilesScreen() {
  const office = useOfficeActions();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const routeFileId = useFileIdFromPath(location.pathname);
  const permissions = userProfile?.permissions ?? [];
  const hasPermission = (key) =>
    Boolean(userProfile?.isAdmin || permissions.includes(key));
  const canReadFiles = hasPermission("files.assets.read");
  const canUploadFiles = hasPermission("files.assets.create");

  const isAdmin = Boolean(
    hasPermission("files.assets.update") ||
    hasPermission("files.assets.delete"),
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [showUpload, setShowUpload] = useState(false);
  const [shareWithCompany, setShareWithCompany] = useState(false);
  const [newFormat, setNewFormat] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(searchParams.get("page"), 10) || 1),
  );
  const pageSize = PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 20;
  const requestedWorkspace = searchParams.get("workspace");
  const workspace =
    FILES_WORKSPACES.includes(requestedWorkspace) &&
    (requestedWorkspace !== "all" || userProfile?.isAdmin)
      ? requestedWorkspace
      : "mine";
  // "folders" is client-side only: the API lists by folderId and applies its
  // own read visibility, so it gets no workspace filter.
  const inFolders = workspace === "folders";
  const folder = inFolders ? searchParams.get("folder") || ROOT_FOLDER : null;
  const queryParams = {
    page,
    pageSize,
    workspace: inFolders ? "" : workspace,
    folderId: folder ?? "",
    q: searchParams.get("q") || "",
    kind: searchParams.get("kind") || "",
    moduleKey: searchParams.get("moduleKey") || "",
    enabled: searchParams.get("enabled") || "",
    sortBy: searchParams.get("sortBy") || "updatedAt",
    sortDir: searchParams.get("sortDir") || "desc",
  };
  function changeQuery(changes, resetPage = true) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === "" || value == null) next.delete(key);
          else next.set(key, String(value));
        }
        if (resetPage) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }
  const isMobile = useIsMobile();
  // Two modes: table, and the shared MediaGallery ("gallery"). Phones default
  // to the gallery; the old cards/grid choices fold into it.
  const [storedView, setStoredView] = useState(() => {
    try {
      return localStorage.getItem("runly-view-mode-files");
    } catch {
      return null;
    }
  });
  const viewMode = storedView === "table" ? "table" : storedView ? "gallery" : isMobile ? "gallery" : "table";
  const [moveFileIds, setMoveFileIds] = useState(null);
  const folderApi = useFilesFolders({ token, userId: session?.user?.id, enabled: canReadFiles });
  const currentFolder = inFolders && folder !== ROOT_FOLDER ? folderApi.folders.find((f) => f.id === folder) : null;
  const dropTarget = inFolders ? (currentFolder ? `«${currentFolder.name}»` : "Mis carpetas") : "Mis archivos";
  const selectView = ({ workspace: next, folder: nextFolder = "", moduleKey = "" }) =>
    changeQuery({ workspace: next, folder: nextFolder, moduleKey, q: "", kind: "", enabled: "" });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFile, setDetailFile] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewMap, setPreviewMap] = useState(() => new Map());
  const signedUrlCacheRef = useRef(new Map());
  // Grid/card/table thumbnails: resized "preview" URLs, kept apart from the
  // full-resolution cache that opening/downloading a file uses.
  const thumbUrlCacheRef = useRef(new Map());
  const previewFetchPendingRef = useRef(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);

  function getApiErrorMessage(error, fallback) {
    try {
      return JSON.parse(error?.message || "{}").error || fallback;
    } catch {
      return fallback;
    }
  }

  const filesQuery = useQuery({
    queryKey: ["files-list", session?.user?.id, queryParams],
    queryFn: () => runly.files.list(queryParams, token),
    enabled: Boolean(token) && canReadFiles && workspace !== "invitations",
  });
  const files = useMemo(() => filesQuery.data?.data ?? [], [filesQuery.data]);
  const pagination = filesQuery.data?.pagination;
  useEffect(() => {
    if (pagination && page > pagination.totalPages)
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("page", String(Math.max(1, pagination.totalPages)));
          return next;
        },
        { replace: true },
      );
  }, [pagination, page, setSearchParams]);
  const moduleOptions = [
    "files",
    "company",
    "contacts",
    "hr",
    "projects",
    "inventory",
    "fleet",
    "growth",
  ].map((key) => ({
    value: `atlas.${key}`,
    label: {
      files: "Archivos",
      company: "Empresa",
      contacts: "Contactos",
      hr: "Personal",
      projects: "Proyectos",
      inventory: "Inventario",
      fleet: "Flota",
      growth: "Ventas",
    }[key],
  }));
  const explorerState = useFilesExplorer(files, { server: true });
  const explorer = {
    ...explorerState,
    search: queryParams.q,
    filters: {
      enabled: queryParams.enabled,
      kind: queryParams.kind,
      moduleKey: queryParams.moduleKey,
    },
    sort: { by: queryParams.sortBy, dir: queryParams.sortDir },
    setSearch: (q) => changeQuery({ q }),
    setFilters: (filters) =>
      changeQuery({ enabled: "", kind: "", moduleKey: "", ...filters }),
    setSort: (sort) => changeQuery({ sortBy: sort.by, sortDir: sort.dir }),
  };
  const resetSelection = explorerState.setSelectedIds;
  explorer.selectVisible = () => {
    resetSelection(files.slice(0, 50).map((file) => file.id));
    if (files.length > 50)
      toast.info("Se seleccionaron los primeros 50 archivos de esta página.");
  };
  explorer.toggleSelect = (id) => {
    if (!explorer.selectedSet.has(id) && explorer.selectedCount >= 50) {
      toast.info("Puedes seleccionar hasta 50 archivos por descarga.");
      return;
    }
    explorerState.toggleSelect(id);
  };
  const queryIdentity = searchParams.toString();
  useEffect(() => {
    resetSelection([]);
  }, [queryIdentity, resetSelection]);
  const routeQuery = useQuery({
    queryKey: ["file-detail", session?.user?.id, routeFileId],
    queryFn: () => runly.files.get(routeFileId, token),
    enabled: Boolean(routeFileId && token && canReadFiles),
    staleTime: 0,
    gcTime: 0,
  });
  const setEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }) => runly.files.setEnabled(id, enabled, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["files-list"] });
      setToggleTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => runly.files.delete(id, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["files-list"] });
      setDeleteTarget(null);
    },
  });

  const handleUploadFiles = useCallback(
    async (filesToUpload) => {
      if (!token || !canUploadFiles || !filesToUpload?.length) return;
      const files = Array.from(filesToUpload);
      const newItems = files.map((file, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        status: "pending",
        _file: file,
      }));
      setUploadQueue((prev) => [...prev, ...newItems]);

      for (const item of newItems) {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "uploading" } : q,
          ),
        );
        try {
          const formData = new FormData();
          formData.append("file", item._file);
          formData.append("moduleKey", "runly.files");
          formData.append("entityType", "AtlasFile");
          if (shareWithCompany) formData.append("shareWithCompany", "true");
          if (currentFolder) formData.append("folderId", currentFolder.id);
          await runly.files.upload(formData, token);
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q)),
          );
        } catch {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "error" } : q)),
          );
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["files-list"] });
      queryClient.invalidateQueries({ queryKey: ["files-folders"] });

      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((q) => q.status === "error"));
      }, 3500);
    },
    [token, queryClient, canUploadFiles, shareWithCompany, currentFolder],
  );

  useEffect(() => {
    if (!token) return;
    let counter = 0;

    function onDragEnter(e) {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      counter++;
      setIsDragOver(true);
    }

    function onDragLeave() {
      counter = Math.max(0, counter - 1);
      if (counter === 0) setIsDragOver(false);
    }

    function onDrop(e) {
      e.preventDefault();
      counter = 0;
      setIsDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      if (droppedFiles.length) handleUploadFiles(droppedFiles);
    }

    function onDragOver(e) {
      e.preventDefault();
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, [token, handleUploadFiles]);

  const renameMutation = useMutation({
    mutationFn: ({ id, originalName }) =>
      runly.files.rename(id, { originalName }, token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["files-list"] });
      setRenameTarget(null);
      setRenameValue("");
    },
  });

  const bulkDownloadMutation = useMutation({
    mutationFn: ({ mode }) =>
      runly.files.bulkDownload(
        {
          fileIds: explorer.selectedIds,
          mode,
        },
        token,
      ),
  });

  const resolveSignedUrl = useCallback(
    async (file) => {
      if (!file?.id || !token) return null;
      const cached = signedUrlCacheRef.current.get(file.id);
      if (cached) return cached;
      const response = await runly.files.getSignedUrl(file.id, token);
      const url = response?.data?.signedUrl;
      if (url) {
        signedUrlCacheRef.current.set(file.id, url);
      }
      return url || null;
    },
    [token],
  );

  useEffect(() => {
    if (!explorer.filteredFiles.length || !token) return;

    const imageFiles = explorer.filteredFiles
      .filter((file) => getFileKind(file.mimeType) === "image")
      .slice(0, 24);

    // Apply cached URLs immediately without a network request.
    for (const file of imageFiles) {
      if (!file?.id) continue;
      const cached = thumbUrlCacheRef.current.get(file.id);
      if (cached) {
        setPreviewMap((prev) => {
          if (prev.get(file.id) === cached) return prev;
          const next = new Map(prev);
          next.set(file.id, cached);
          return next;
        });
      }
    }

    const uncachedIds = imageFiles
      .filter(
        (f) =>
          f?.id &&
          !thumbUrlCacheRef.current.has(f.id) &&
          !previewFetchPendingRef.current.has(f.id),
      )
      .map((f) => f.id);

    if (uncachedIds.length === 0) return;

    for (const id of uncachedIds) previewFetchPendingRef.current.add(id);

    runly.files
      .batchSignedUrls(uncachedIds, token, { variant: "preview" })
      .then((response) => {
        const urlMap = response?.data ?? {};
        setPreviewMap((prev) => {
          const next = new Map(prev);
          for (const [id, url] of Object.entries(urlMap)) {
            if (url) {
              thumbUrlCacheRef.current.set(id, url);
              next.set(id, url);
            }
          }
          return next;
        });
      })
      .catch(() => {
        // Ignore thumbnail prefetch failures.
      })
      .finally(() => {
        for (const id of uncachedIds) previewFetchPendingRef.current.delete(id);
      });
  }, [explorer.filteredFiles, token]);

  // AdvancedFileViewer's filmstrip uses thumbnailUrl directly (no +/-3-file
  // window limit) — reuse the previewMap this screen already resolves for
  // its own grid/card/table thumbnails instead of leaving the viewer to
  // re-fetch each one through its own narrower window.
  const viewerFiles = useMemo(
    () =>
      explorer.filteredFiles.map((file) => ({
        ...file,
        thumbnailUrl: previewMap.get(file.id) ?? null,
      })),
    [explorer.filteredFiles, previewMap],
  );

  useEffect(() => {
    if (routeQuery.data?.data) {
      setDetailFile(routeQuery.data.data);
      setDetailOpen(true);
    }
  }, [routeQuery.data]);

  // The gallery owns its viewer; Office documents still open in the editor.
  function openGalleryFile(file) {
    if (office?.enabled && file.enabled !== false && getOfficeFormat(file)) {
      office.open(file.id);
      return true;
    }
    return false;
  }

  function openViewer(file) {
    if (office?.enabled && file.enabled !== false && getOfficeFormat(file)) {
      office.open(file.id);
      return;
    }
    if (!files.some((item) => item.id === file.id)) {
      openDetail(file);
      return;
    }
    explorer.openById(file.id);
    setViewerOpen(true);
  }

  async function downloadFile(file) {
    try {
      const url = await resolveSignedUrl(file);
      if (!url) throw new Error("missing url");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.originalName;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch {
      toast.error("No se pudo descargar el archivo");
    }
  }

  async function copyLink(file) {
    try {
      const native =
        window.location.protocol === "tauri:" ||
        window.location.hostname === "tauri.localhost";
      const url = native
        ? (await runly.files.getAccess(file.id, token))?.data?.shareUrl
        : new URL(
            `/app/m/runly.files/files/${encodeURIComponent(file.id)}`,
            window.location.origin,
          ).href;
      if (!url) {
        toast.error(
          "Configura la URL web de Runly en el servidor para compartir enlaces.",
        );
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Enlace de Runly copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function openDetail(file, pushRoute = true) {
    setDetailFile(file);
    setDetailOpen(true);
    if (pushRoute) {
      navigate(
        `/app/m/runly.files/files/${encodeURIComponent(file.id)}${location.search}`,
      );
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailFile(null);
    if (routeFileId) {
      navigate(`/app/m/runly.files/files${location.search}`, { replace: true });
    }
  }

  async function handleBulkDirect() {
    try {
      const response = await toast.promise(
        bulkDownloadMutation.mutateAsync({ mode: "direct" }),
        {
          loading: "Preparando enlaces de descarga...",
          success: "Descarga iniciada",
          error: (error) =>
            getApiErrorMessage(error, "No se pudo descargar la seleccion"),
        },
      );
      const filesData = response?.data?.files ?? [];
      if (!filesData.length) {
        toast.error("No se encontraron archivos para descargar");
        return;
      }
      filesData.forEach((item) => {
        if (!item?.signedUrl) return;
        const anchor = document.createElement("a");
        anchor.href = item.signedUrl;
        anchor.download = item.originalName;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      });
    } catch {
      // handled by toast.promise
    }
  }

  async function handleBulkZip() {
    try {
      const response = await toast.promise(
        bulkDownloadMutation.mutateAsync({ mode: "zip" }),
        {
          loading: "Construyendo ZIP...",
          success: "ZIP preparado",
          error: (error) =>
            getApiErrorMessage(error, "No se pudo preparar el ZIP"),
        },
      );
      const url = response?.data?.signedUrl;
      if (!url) {
        toast.error("No se pudo preparar el ZIP");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // handled by toast.promise
    }
  }

  if (!canReadFiles) {
    return (
      <div className="files-workspace flex flex-col min-h-full">
        <div className="flex-1 p-4 md:p-6 space-y-6">
          <PageHeader
            eyebrow="Runly Files"
            title="Explorador de archivos"
            description="Visualiza, organiza, renombra y descarga archivos por lote o individualmente."
          />
          <ErrorState message="No tienes permisos para ver los archivos." />
        </div>
      </div>
    );
  }

  return (
    <div className="files-workspace flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 space-y-6">
        <FilesWorkspaceHeader
          onCreate={setNewFormat}
          onUpload={() => setShowUpload(true)}
          canCreate={canUploadFiles && hasPermission("files.assets.update")}
          canUpload={canUploadFiles}
          officeAvailable={Boolean(
            office?.enabled && office?.available !== false,
          )}
        />
        <FilesUploadDialog
          open={showUpload}
          onOpenChange={setShowUpload}
          onUploadMany={handleUploadFiles}
          disabled={!canUploadFiles}
          shareWithCompany={shareWithCompany}
          onShareWithCompanyChange={setShareWithCompany}
        />
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <FilesNavigation
            workspace={workspace}
            folder={folder}
            moduleKey={queryParams.moduleKey}
            folders={folderApi.folders}
            modules={folderApi.modules}
            isCompanyAdmin={Boolean(userProfile?.isAdmin)}
            onSelect={selectView}
          />
          <div className="min-w-0 flex-1 space-y-6">
        {routeQuery.isError && (
          <ErrorState
            title="No se pudo abrir el archivo enlazado"
            description="Comprueba que tengas acceso y que el archivo siga disponible."
            onRetry={() => routeQuery.refetch()}
          />
        )}
        {workspace === "invitations" ? (
          <FileInvitations
            token={token}
            userId={session?.user?.id}
            onOpen={openViewer}
          />
        ) : (
          <>
            <FilesFolderManager
              api={folderApi}
              token={token}
              folder={folder}
              showBar={inFolders}
              canCreate={canUploadFiles}
              canUpdate={hasPermission("files.assets.update")}
              canDelete={hasPermission("files.assets.delete")}
              profileId={userProfile?.id}
              isCompanyAdmin={Boolean(userProfile?.isAdmin)}
              moveFileIds={moveFileIds}
              onMoveFilesClose={(moved) => {
                setMoveFileIds(null);
                if (moved) resetSelection([]);
              }}
              onOpen={(id) => selectView({ workspace: "folders", folder: id })}
            />
            <FilesToolbar
              search={explorer.search}
              onSearchChange={explorer.setSearch}
              filters={explorer.filters}
              onFiltersChange={explorer.setFilters}
              viewMode={viewMode}
              onViewModeChange={setStoredView}
              onSelectVisible={explorer.selectVisible}
              sort={explorer.sort}
              onSortChange={explorer.setSort}
              moduleOptions={moduleOptions}
            />

            {filesQuery.isLoading ? (
              <div className="h-40 rounded-xl border border-[hsl(var(--border))] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
              </div>
            ) : filesQuery.isError ? (
              <ErrorState
                title="No se pudieron cargar los archivos"
                message="Reintenta la carga para continuar."
                onRetry={() => filesQuery.refetch()}
              />
            ) : explorer.filteredFiles.length === 0 && inFolders && !queryParams.q ? (
              <EmptyState
                icon={FolderOpen}
                title={currentFolder ? "Esta carpeta está vacía" : "No hay archivos sueltos aquí"}
                description="Sube archivos o arrástralos a esta pantalla; también puedes mover archivos existentes desde su menú."
              />
            ) : explorer.filteredFiles.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Sin resultados"
                description="No hay archivos que coincidan con los filtros actuales."
              />
            ) : viewMode === "table" ? (
              <FilesWorkspaceTable
                files={explorer.filteredFiles}
                selectedSet={explorer.selectedSet}
                onToggleSelect={explorer.toggleSelect}
                onSelectVisible={explorer.selectVisible}
                onClearSelection={explorer.clearSelection}
                onShare={setShareFile}
                onPreview={openViewer}
                onDownload={downloadFile}
                onCopyLink={copyLink}
                onRename={(file) => {
                  setRenameTarget(file);
                  setRenameValue(file.originalName || "");
                }}
                onDetail={(file) => openDetail(file, true)}
                onToggleEnabled={(file) =>
                  setToggleTarget({
                    id: file.id,
                    enabled: !file.enabled,
                    name: file.originalName,
                  })
                }
                onDelete={(file) => setDeleteTarget(file)}
                onMove={hasPermission("files.assets.update") ? (file) => setMoveFileIds([file.id]) : null}
                canUpdate={hasPermission("files.assets.update")}
                canDelete={hasPermission("files.assets.delete")}
                profileId={userProfile?.id}
                isCompanyAdmin={userProfile?.isAdmin}
                isAdmin={isAdmin}
                previewMap={previewMap}
              />
            ) : (
              <FilesGalleryView
                files={explorer.filteredFiles}
                token={token}
                onOpenFile={openGalleryFile}
                onMove={hasPermission("files.assets.update") ? (ids) => setMoveFileIds(ids) : null}
              />
            )}
            <PageFooter
              total={pagination?.total ?? 0}
              pageIndex={page - 1}
              pageCount={pagination?.totalPages ?? 1}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZES}
              canPrevious={page > 1 && !filesQuery.isFetching}
              canNext={page < (pagination?.totalPages ?? 1) && !filesQuery.isFetching}
              onPrevious={() => changeQuery({ page: page - 1 }, false)}
              onNext={() => changeQuery({ page: page + 1 }, false)}
              onPageSizeChange={(size) => changeQuery({ pageSize: size })}
            />
          </>
        )}
          </div>
        </div>
        {newFormat && (
          <CreateDocumentDialog
            key={newFormat}
            format={newFormat}
            token={token}
            onClose={() => setNewFormat(null)}
            onCreated={(file) => {
              setNewFormat(null);
              openViewer(file);
            }}
          />
        )}
        {shareFile && (
          <FileSharingDialog
            key={shareFile.id}
            file={shareFile}
            token={token}
            userId={session?.user?.id}
            profileId={userProfile?.id}
            isCompanyAdmin={Boolean(userProfile?.isAdmin)}
            onClose={() => setShareFile(null)}
            onCopyLink={copyLink}
          />
        )}
      </div>

      {viewMode === "table" && (
        <FilesSelectionBar
          count={explorer.selectedCount}
          loading={bulkDownloadMutation.isPending}
          onClear={explorer.clearSelection}
          onDownload={handleBulkDirect}
          onZip={handleBulkZip}
          onMove={hasPermission("files.assets.update") ? () => setMoveFileIds(explorer.selectedIds) : null}
        />
      )}
      <FilesUploadQueue isDragOver={isDragOver} queue={uploadQueue} onClear={() => setUploadQueue([])} dropTarget={dropTarget} />

      <AdvancedFileViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        files={viewerFiles}
        activeIndex={explorer.activeIndex}
        onIndexChange={explorer.setActiveIndex}
        onResolveSignedUrl={resolveSignedUrl}
        onOpenInOffice={(f) => office?.enabled && office.open(f.id)}
        canOpenInOffice={(f) => f?.enabled !== false}
      />

      <FileDetailPanel
        onShare={(file) => {
          closeDetail();
          setShareFile(file);
        }}
        open={detailOpen}
        onOpenChange={(v) => {
          if (!v) {
            closeDetail();
            return;
          }
          setDetailOpen(true);
        }}
        file={detailFile}
        onGoOrigin={(path) => {
          closeDetail();
          navigate(path);
        }}
      />

      <FileRenameModal
        open={Boolean(renameTarget)}
        onOpenChange={(v) => !v && setRenameTarget(null)}
        file={renameTarget}
        previewUrl={
          renameTarget ? (previewMap.get(renameTarget.id) ?? null) : null
        }
        value={renameValue}
        onChange={setRenameValue}
        onSave={() =>
          toast.promise(
            renameMutation.mutateAsync({
              id: renameTarget.id,
              originalName: renameValue,
            }),
            {
              loading: "Guardando nombre...",
              success: "Nombre de archivo actualizado",
              error: (error) =>
                getApiErrorMessage(error, "No se pudo renombrar el archivo"),
            },
          )
        }
        isPending={renameMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="¿Eliminar archivo?"
        description="Esta acción es irreversible. El archivo se eliminará permanentemente del almacenamiento."
        detail={deleteTarget?.originalName}
        confirmLabel="Eliminar"
        onConfirm={() =>
          toast.promise(deleteMutation.mutateAsync(deleteTarget.id), {
            loading: "Eliminando archivo...",
            success: "Archivo eliminado",
            error: (error) =>
              getApiErrorMessage(error, "No se pudo eliminar el archivo"),
          })
        }
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onOpenChange={(v) => !v && setToggleTarget(null)}
        title={
          toggleTarget?.enabled
            ? "¿Habilitar archivo?"
            : "¿Deshabilitar archivo?"
        }
        description="El archivo cambiara de estado."
        detail={toggleTarget?.name}
        confirmLabel={toggleTarget?.enabled ? "Habilitar" : "Deshabilitar"}
        onConfirm={() =>
          toast.promise(
            setEnabledMutation.mutateAsync({
              id: toggleTarget.id,
              enabled: toggleTarget.enabled,
            }),
            {
              loading: "Actualizando estado del archivo...",
              success: "Estado de archivo actualizado",
              error: (error) =>
                getApiErrorMessage(
                  error,
                  "No se pudo actualizar el estado del archivo",
                ),
            },
          )
        }
        loading={setEnabledMutation.isPending}
      />

      <div className="px-6 pb-6">
        <Badge variant="outline">
          Limite descarga masiva: 50 archivos o 250 MB por solicitud
        </Badge>
      </div>
    </div>
  );
}
