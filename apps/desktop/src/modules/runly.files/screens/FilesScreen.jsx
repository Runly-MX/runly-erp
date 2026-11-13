import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  useOfficeActions,
} from "@runly/ui";
import { getOfficeFormat } from "@runly/core";
import { FolderOpen, FolderPlus, Loader2, SearchX, Upload } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";
import { useFilesExplorer } from "../hooks/useFilesExplorer";
import { FilesToolbar } from "../components/FilesToolbar";
import { FilesExplorer } from "../components/FilesExplorer";
import { FilesPreviewPane } from "../components/FilesPreviewPane";
import { useFilesViewPrefs } from "../hooks/useFilesViewPrefs";
import { FilesLoadMore } from "../components/FilesLoadMore";
import { FilesWorkspaceHeader } from "../components/FilesWorkspaceHeader";
import { CreateDocumentDialog } from "../components/CreateDocumentDialog";
import { FileSharingDialog } from "../components/FileSharingDialog";
import { FileInvitations } from "../components/FileInvitations";
import { FilesSelectionBar } from "../components/FilesSelectionBar";
import { AdvancedFileViewer, getFileKind } from "@runly/ui";
import { FileDetailPanel } from "../components/FileDetailPanel";
import { FileRenameModal } from "../components/FileRenameModal";
import { FilesUploadDialog } from "../components/FilesUploadDialog";
import { FILES_WORKSPACES } from "../components/FilesSidebar";
import { ModuleRecordsBar } from "../components/ModuleRecordsBar";
import { FilesNavigation } from "../components/FilesNavigation";
import { FilesFolderManager } from "../components/FilesFolderManager";
import { FilesUploadQueue } from "../components/FilesUploadQueue";
import { buildItemMenu } from "../lib/buildItemMenu";
import { useFilesUpload } from "../hooks/useFilesUpload";
import { useFilesFolders } from "../hooks/useFilesFolders";
import { useAreaTreeDock } from "../../runly.inventory/hooks/useAreaTreeDock.js";
import { ROOT_FOLDER, childrenOf, descendantIds, folderPath, moduleLabel } from "../lib/folders";

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

const PAGE_SIZE = 50; // rows per request; further pages load while scrolling

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
    workspace: inFolders ? "" : workspace,
    folderId: folder ?? "",
    q: searchParams.get("q") || "",
    kind: searchParams.get("kind") || "",
    moduleKey: searchParams.get("moduleKey") || "",
    record: workspace === "modules" ? searchParams.get("record") || "" : "",
    enabled: searchParams.get("enabled") || "",
    sortBy: searchParams.get("sortBy") || "updatedAt",
    sortDir: searchParams.get("sortDir") || "desc",
  };
  function changeQuery(changes) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === "" || value == null) next.delete(key);
          else next.set(key, String(value));
        }
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }
  const dock = useAreaTreeDock("runly.files.folderTree");
  const { viewMode, changeView, tileSize, setTileSize, previewOpen, setPreviewOpen } = useFilesViewPrefs();
  const [moveFileIds, setMoveFileIds] = useState(null);
  const [moveFolderIds, setMoveFolderIds] = useState([]);
  const [folderSelIds, setFolderSelIds] = useState([]);
  const moveItems = ({ fileIds = [], folderIds = [] }) => {
    setMoveFileIds(fileIds);
    setMoveFolderIds(folderIds);
  };
  const folderApi = useFilesFolders({ token, userId: session?.user?.id, enabled: canReadFiles });
  const currentFolder = inFolders && folder !== ROOT_FOLDER ? folderApi.folders.find((f) => f.id === folder) : null;
  const dropTarget = inFolders ? (currentFolder ? `«${currentFolder.name}»` : "Mis carpetas") : "Mis archivos";
  const [folderDialog, setFolderDialog] = useState(null);
  const folderActions = {
    canCreate: canUploadFiles,
    canManage: (f) =>
      Boolean(userProfile?.isAdmin || f.createdById === userProfile?.id) &&
      (hasPermission("files.assets.update") || hasPermission("files.assets.delete")),
    open: setFolderDialog,
  };
  const selectView = ({ workspace: next, folder: nextFolder = "", moduleKey = "", record = "" }) =>
    changeQuery({ workspace: next, folder: nextFolder, moduleKey, record, q: "", kind: "", enabled: "" });
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

  function getApiErrorMessage(error, fallback) {
    try {
      return JSON.parse(error?.message || "{}").error || fallback;
    } catch {
      return fallback;
    }
  }

  const filesQuery = useInfiniteQuery({
    queryKey: ["files-list", session?.user?.id, queryParams],
    queryFn: ({ pageParam }) => runly.files.list({ ...queryParams, page: pageParam, pageSize: PAGE_SIZE }, token),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last?.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled: Boolean(token) && canReadFiles && workspace !== "invitations",
    // Kept fresh by the files.changed push (RealtimeProvider), not by polling.
  });
  // Pages can shift while others upload; keep each file once.
  const files = useMemo(() => {
    const seen = new Set();
    return (filesQuery.data?.pages ?? [])
      .flatMap((p) => p?.data ?? [])
      .filter((f) => !seen.has(f.id) && seen.add(f.id));
  }, [filesQuery.data]);
  const total = filesQuery.data?.pages?.[0]?.pagination?.total ?? 0;
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
  const lastToggled = useRef(null);
  explorer.rangeSelect = (id) => {
    const ids = files.map((file) => file.id);
    const from = ids.indexOf(lastToggled.current);
    const to = ids.indexOf(id);
    if (from < 0 || to < 0) return explorer.toggleSelect(id);
    const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
    if (range.length > 50) toast.info("Puedes seleccionar hasta 50 archivos por descarga.");
    resetSelection(Array.from(new Set([...explorer.selectedIds, ...range])).slice(0, 50));
    lastToggled.current = id;
  };
  explorer.toggleSelect = (id) => {
    lastToggled.current = id;
    if (!explorer.selectedSet.has(id) && explorer.selectedCount >= 50) {
      toast.info("Puedes seleccionar hasta 50 archivos por descarga.");
      return;
    }
    explorerState.toggleSelect(id);
  };
  const queryIdentity = searchParams.toString();
  useEffect(() => {
    resetSelection([]);
    setFolderSelIds([]);
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

  const { uploadQueue, setUploadQueue, isDragOver, handleUploadFiles } = useFilesUpload({
    token,
    canUploadFiles,
    shareWithCompany,
    currentFolder,
  });

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
    mutationFn: ({ mode, fileIds }) =>
      runly.files.bulkDownload(
        {
          fileIds: fileIds ?? explorer.selectedIds,
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

  // Image editor "Reemplazar original": the server keeps the previous content
  // as a version; drop the cached signed URL so the viewer loads the new one.
  const handleReplaceEditedImage = useCallback(
    async (edited, source) => {
      try {
        await runly.files.replaceImage(source.id, edited, token);
        signedUrlCacheRef.current.delete(source.id);
        await queryClient.invalidateQueries({ queryKey: ["files-list"] });
        toast.success("Imagen reemplazada");
      } catch (err) {
        toast.error(err?.message ?? "No se pudo reemplazar la imagen");
        throw err;
      }
    },
    [token, queryClient],
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

  // `ids` lets menus zip a selection that lives outside `explorer` (the gallery keeps its own).
  async function handleBulkZip(ids) {
    try {
      const response = await toast.promise(
        bulkDownloadMutation.mutateAsync({ mode: "zip", fileIds: Array.isArray(ids) ? ids : undefined }),
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

  const officeAvailable = Boolean(office?.enabled && office?.available !== false);
  const canCreateDocs = canUploadFiles && hasPermission("files.assets.update");
  // Where uploads and new documents/folders land: the open folder, else the root.
  const destination = inFolders
    ? currentFolder
      ? ["Mis carpetas", ...folderPath(folderApi.folders, currentFolder.id).map((f) => f.name)].join(" / ")
      : "Mis carpetas"
    : "Mis archivos";

  // What the preview pane shows: the selected files and folders, as explorer items.
  const previewSelection = [
    ...folderApi.folders.filter((f) => folderSelIds.includes(f.id)).map((data) => ({ id: data.id, type: "folder", data })),
    ...explorer.filteredFiles.filter((f) => explorer.selectedSet.has(f.id)).map((data) => ({ id: data.id, type: "file", data })),
  ];

  // Lazy thumbnails for every tile/row (the explorer batches the ids it needs).
  const resolveThumbs = useCallback(
    async (ids, variant) => {
      if (!token) return {};
      try {
        return (await runly.files.batchSignedUrls(ids, token, { variant }))?.data ?? {};
      } catch {
        return {};
      }
    },
    [token],
  );
  const backgroundMenu = [
    ...(canUploadFiles ? [{ label: "Subir archivos aquí", icon: Upload, onClick: () => setShowUpload(true) }] : []),
    ...(folderActions.canCreate ? [{ label: "Nueva carpeta", icon: FolderPlus, onClick: () => setFolderDialog({ type: "create" }) }] : []),
  ];

  // Subfolders sit in the explorer with the files, in every view.
  const subfolders =
    inFolders && !queryParams.q
      ? childrenOf(folderApi.folders, folder === ROOT_FOLDER ? null : folder)
      : [];
  const canMoveFile = (file) =>
    hasPermission("files.assets.update") &&
    file.entityType === "AtlasFile" &&
    Boolean(userProfile?.isAdmin || file.uploadedById === userProfile?.id);

  async function dropItems({ fileIds = [], folderIds = [] }, targetId) {
    const target = targetId === ROOT_FOLDER ? null : targetId;
    const validFolders = folderIds.filter(
      (id) => id !== target && !(target && descendantIds(folderApi.folders, id).has(target)),
    );
    if (fileIds.length) await folderApi.moveFiles(fileIds, target);
    for (const id of validFolders) await folderApi.updateFolder(id, { parentId: target });
    resetSelection([]);
    setFolderSelIds([]);
  }

  function openItem(item) {
    if (item.type === "folder") selectView({ workspace: "folders", folder: item.id });
    else openViewer(item.data);
  }
  function renameItem(item) {
    if (item.type === "folder") {
      if (folderActions.canManage(item.data)) setFolderDialog({ type: "rename", folder: item.data });
    } else if (hasPermission("files.assets.update")) {
      setRenameTarget(item.data);
      setRenameValue(item.data.originalName || "");
    }
  }
  function deleteItem(item) {
    if (item.type === "folder") {
      if (folderActions.canManage(item.data)) setFolderDialog({ type: "delete", folder: item.data });
    } else if (hasPermission("files.assets.delete")) setDeleteTarget(item.data);
  }
  const buildMenu = (item, group) =>
    buildItemMenu(item, group, {
      hasPermission, folderActions, isAdmin: userProfile?.isAdmin, profileId: userProfile?.id, canMoveFile,
      openItem, renameItem, deleteItem, openViewer, downloadFile, copyLink, openDetail, handleBulkZip,
      moveItems, setFolderDialog, setShareFile, setToggleTarget,
    });

  return (
    <div className="files-workspace flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 space-y-6">
        <FilesWorkspaceHeader
          dock={dock}
          destination={destination}
          onCreate={setNewFormat}
          onUpload={() => setShowUpload(true)}
          onNewFolder={() => setFolderDialog({ type: "create" })}
          canCreate={canCreateDocs}
          canUpload={canUploadFiles}
          canCreateFolder={folderActions.canCreate}
          officeAvailable={officeAvailable}
        />
        <FilesUploadDialog
          open={showUpload}
          onOpenChange={setShowUpload}
          onUploadMany={handleUploadFiles}
          disabled={!canUploadFiles}
          shareWithCompany={shareWithCompany}
          onShareWithCompanyChange={setShareWithCompany}
        />
        <div ref={dock.containerRef} className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-0">
          <FilesNavigation
            dock={dock}
            workspace={workspace}
            folder={folder}
            moduleKey={queryParams.moduleKey}
            record={queryParams.record}
            folders={folderApi.folders}
            modules={folderApi.modules}
            isCompanyAdmin={Boolean(userProfile?.isAdmin)}
            folderActions={folderActions}
            onSelect={selectView}
            onDropItems={dropItems}
          />
          <div className="min-w-0 flex-1 space-y-6">
        {routeQuery.isError && (
          <ErrorState
            title="No se pudo abrir el archivo enlazado"
            description="Comprueba que tengas acceso y que el archivo siga disponible."
            onRetry={() => routeQuery.refetch()}
          />
        )}
        <FilesFolderManager
          api={folderApi}
          token={token}
          folder={folder}
          showBar={inFolders}
          canCreate={folderActions.canCreate}
          canManage={folderActions.canManage}
          dialog={folderDialog}
          setDialog={setFolderDialog}
          moveFileIds={moveFileIds}
          moveFolderIds={moveFolderIds}
          onMoveItems={(target) => dropItems({ fileIds: moveFileIds ?? [], folderIds: moveFolderIds }, target)}
          onMoveFilesClose={(moved) => {
            moveItems({});
            if (moved) {
              resetSelection([]);
              setFolderSelIds([]);
            }
          }}
          onOpen={(id) => selectView({ workspace: "folders", folder: id })}
          onDropItems={dropItems}
          hideSubfolders
        />
        {workspace === "invitations" ? (
          <FileInvitations
            token={token}
            userId={session?.user?.id}
            onOpen={openViewer}
          />
        ) : (
          <>
            {workspace === "modules" && queryParams.moduleKey && (
              <ModuleRecordsBar
                token={token}
                userId={session?.user?.id}
                moduleKey={queryParams.moduleKey}
                record={queryParams.record}
                onOpen={(record) => selectView({ workspace: "modules", moduleKey: queryParams.moduleKey, record })}
              />
            )}
            <FilesToolbar
              search={explorer.search}
              onSearchChange={explorer.setSearch}
              filters={explorer.filters}
              onFiltersChange={explorer.setFilters}
              viewMode={viewMode}
              onViewModeChange={changeView}
              tileSize={tileSize}
              onTileSizeChange={setTileSize}
              previewOpen={previewOpen}
              onPreviewToggle={() => setPreviewOpen(!previewOpen)}
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
            ) : explorer.filteredFiles.length === 0 && subfolders.length === 0 && inFolders && !queryParams.q ? (
              <EmptyState
                icon={FolderOpen}
                title={currentFolder ? "Esta carpeta está vacía" : "No hay archivos sueltos aquí"}
                description="Sube archivos o arrástralos a esta pantalla; también puedes mover archivos existentes desde su menú."
                action={canUploadFiles ? (
                  <Button onClick={() => setShowUpload(true)}>
                    <Upload className="h-4 w-4" />
                    Subir archivos aquí
                  </Button>
                ) : undefined}
              />
            ) : explorer.filteredFiles.length === 0 && subfolders.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Sin resultados"
                description="No hay archivos que coincidan con los filtros actuales."
              />
            ) : (
              <FilesExplorer
                view={viewMode}
                tileSize={tileSize}
                folders={subfolders}
                files={explorer.filteredFiles}
                selectedFileIds={explorer.selectedIds}
                onSelectFiles={resetSelection}
                selectedFolderIds={folderSelIds}
                onSelectFolders={setFolderSelIds}
                resolveThumbs={resolveThumbs}
                sort={explorer.sort}
                onSortChange={explorer.setSort}
                canMoveFile={canMoveFile}
                canManageFolder={folderActions.canManage}
                buildMenu={buildMenu}
                backgroundMenu={backgroundMenu}
                onOpen={openItem}
                onRename={renameItem}
                onDelete={deleteItem}
                onDropItems={dropItems}
                onSpringOpen={(id) => selectView({ workspace: "folders", folder: id })}
              />
            )}
            {filesQuery.hasNextPage && (
              <FilesLoadMore onLoadMore={() => filesQuery.fetchNextPage()} loading={filesQuery.isFetchingNextPage} />
            )}
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
              {files.length < total ? `${files.length} de ${total} archivos` : `${total} ${total === 1 ? "archivo" : "archivos"}`}
            </p>
          </>
        )}
          </div>
          {previewOpen && workspace !== "invitations" && (
            <div className="hidden xl:ml-4 xl:block xl:self-stretch">
              <FilesPreviewPane
                selection={previewSelection}
                folders={folderApi.folders}
                resolveUrl={resolveSignedUrl}
                onOpen={openItem}
                onDownload={downloadFile}
                onShare={setShareFile}
                onDetails={(file) => openDetail(file, true)}
                onClose={() => setPreviewOpen(false)}
              />
            </div>
          )}
        </div>
        {newFormat && (
          <CreateDocumentDialog
            key={newFormat}
            format={newFormat}
            folder={currentFolder ? { id: currentFolder.id } : null}
            destination={destination}
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

      {(
        <FilesSelectionBar
          count={explorer.selectedCount + folderSelIds.length}
          hasFiles={explorer.selectedCount > 0}
          loading={bulkDownloadMutation.isPending}
          onClear={() => {
            explorer.clearSelection();
            setFolderSelIds([]);
          }}
          onDownload={handleBulkDirect}
          onZip={handleBulkZip}
          onMove={hasPermission("files.assets.update") ? () => moveItems({ fileIds: explorer.selectedIds, folderIds: folderSelIds.filter((id) => folderApi.folders.some((f) => f.id === id && folderActions.canManage(f))) }) : null}
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
        onSaveEditedImage={canUploadFiles ? (edited) => handleUploadFiles([edited]) : null}
        onReplaceEditedImage={hasPermission("files.assets.update") ? handleReplaceEditedImage : null}
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
