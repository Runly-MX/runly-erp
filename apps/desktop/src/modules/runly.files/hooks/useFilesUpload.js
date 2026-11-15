import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runly } from "../../../lib/runly";
import { ROOT_FOLDER } from "../lib/folders";

const STORAGE_KEY = "runly-files-uploads";
const UI_KEY = "runly-files-uploads-ui";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_KEPT = 60;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
};

// A reload kills in-flight transfers (the File objects are gone): what was still
// pending shows up as interrupted so the list stays an honest history.
function restoreQueue() {
  const saved = readJson(STORAGE_KEY, []);
  return (Array.isArray(saved) ? saved : []).map((item) =>
    item.status === "pending" || item.status === "uploading"
      ? { ...item, status: "error", progress: null, error: "Interrumpida al recargar la página. Vuelve a subirla." }
      : item,
  );
}

const isFileDrag = (e) =>
  Boolean(e.dataTransfer?.types?.includes("Files")) || Array.from(e.dataTransfer?.items ?? []).some((item) => item.kind === "file");

// Upload queue (per-file progress, cancel, retry, persisted history) plus the
// window-level drop zone for files dragged in from the OS or the phone's gallery.
// A file dropped on a folder tile / breadcrumb / sidebar row ([data-drop-id])
// goes into that folder; anywhere else it goes into the current one.
export function useFilesUpload({ token, canUploadFiles, shareWithCompany, currentFolder }) {
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadQueue, setQueue] = useState(restoreQueue);
  const [ui, setUi] = useState(() => ({ open: true, collapsed: false, ...readJson(UI_KEY, {}) }));
  const runtime = useRef(new Map()); // id -> { file, folderId, share, abort }
  const running = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    writeJson(STORAGE_KEY, uploadQueue.slice(-MAX_KEPT).map(({ _file, ...item }) => item));
  }, [uploadQueue]);
  useEffect(() => writeJson(UI_KEY, { collapsed: ui.collapsed }), [ui.collapsed]);

  const patch = useCallback((id, changes) => setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...changes } : q))), []);

  const busy = uploadQueue.some((q) => q.status === "pending" || q.status === "uploading");
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = [...runtime.current.entries()].find(([, r]) => r.state === "pending");
        if (!next) break;
        const [id, job] = next;
        job.state = "uploading";
        const controller = new AbortController();
        job.abort = () => controller.abort();
        patch(id, { status: "uploading", progress: 0 });
        try {
          const formData = new FormData();
          formData.append("file", job.file);
          formData.append("moduleKey", "runly.files");
          formData.append("entityType", "AtlasFile");
          if (job.share) formData.append("shareWithCompany", "true");
          if (job.folderId) formData.append("folderId", job.folderId);
          await runly.files.upload(formData, tokenRef.current, {
            signal: controller.signal,
            onProgress: (progress) => patch(id, { progress }),
          });
          patch(id, { status: "done", progress: 1 });
          runtime.current.delete(id);
          queryClient.invalidateQueries({ queryKey: ["files-list"] });
        } catch (err) {
          if (err?.name === "AbortError") patch(id, { status: "canceled", progress: null });
          else patch(id, { status: "error", progress: null, error: err?.message || "Error al subir" });
          job.state = "failed";
        }
      }
    } finally {
      running.current = false;
      queryClient.invalidateQueries({ queryKey: ["files-list"] });
      queryClient.invalidateQueries({ queryKey: ["files-folders"] });
    }
  }, [patch, queryClient]);

  // folderId: undefined = the folder being browsed, null = no folder.
  const handleUploadFiles = useCallback(
    (filesToUpload, folderId) => {
      if (!tokenRef.current || !canUploadFiles || !filesToUpload?.length) return;
      const target = folderId === undefined ? (currentFolder?.id ?? null) : folderId;
      const items = Array.from(filesToUpload).map((file, i) => {
        const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
        const tooBig = file.size > MAX_BYTES;
        if (!tooBig) runtime.current.set(id, { file, folderId: target, share: shareWithCompany, state: "pending" });
        return {
          id,
          name: file.name,
          size: file.size,
          mime: file.type,
          status: tooBig ? "error" : "pending",
          error: tooBig ? "Supera el máximo de 10 MB." : undefined,
        };
      });
      setQueue((prev) => [...prev, ...items]);
      setUi((prev) => ({ ...prev, open: true }));
      pump();
    },
    [canUploadFiles, currentFolder, shareWithCompany, pump],
  );

  // Cancels a transfer or drops a finished / failed entry from the list.
  const removeItem = useCallback((id) => {
    const job = runtime.current.get(id);
    if (job?.state === "uploading") {
      job.abort?.(); // the catch above marks it canceled
      return;
    }
    runtime.current.delete(id);
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const retryItem = useCallback(
    (id) => {
      const job = runtime.current.get(id);
      if (!job) return;
      job.state = "pending";
      patch(id, { status: "pending", progress: null, error: undefined });
      pump();
    },
    [patch, pump],
  );

  const clearFinished = useCallback(() => {
    setQueue((prev) => prev.filter((q) => q.status === "pending" || q.status === "uploading"));
  }, []);

  const cancelAll = useCallback(() => {
    for (const [id, job] of runtime.current) {
      if (job.state === "uploading") job.abort?.();
      else if (job.state === "pending") {
        runtime.current.delete(id);
        patch(id, { status: "canceled" });
      }
    }
  }, [patch]);

  useEffect(() => {
    if (!token) return undefined;
    let counter = 0;
    let hover = null;
    const mark = (el) => {
      if (el === hover) return;
      hover?.removeAttribute("data-drop-hover");
      el?.setAttribute("data-drop-hover", "true");
      hover = el;
    };

    function onDragEnter(e) {
      if (!isFileDrag(e)) return;
      counter++;
      setIsDragOver(true);
    }
    function onDragLeave() {
      counter = Math.max(0, counter - 1);
      if (counter === 0) {
        setIsDragOver(false);
        mark(null);
      }
    }
    function onDrop(e) {
      e.preventDefault();
      counter = 0;
      setIsDragOver(false);
      mark(null);
      // The upload dialog's own drop zone handles drops inside it.
      if (e.target?.closest?.("[role=dialog]")) return;
      const dropId = e.target?.closest?.("[data-drop-id]")?.dataset.dropId;
      let droppedFiles = Array.from(e.dataTransfer?.files || []);
      // iOS drags from Photos can expose files only through dataTransfer.items.
      if (!droppedFiles.length)
        droppedFiles = Array.from(e.dataTransfer?.items || [])
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter(Boolean);
      if (droppedFiles.length) handleUploadFiles(droppedFiles, dropId === undefined ? undefined : dropId === ROOT_FOLDER ? null : dropId);
    }
    function onDragOver(e) {
      e.preventDefault();
      if (isFileDrag(e)) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        mark(e.target?.closest?.("[data-drop-id]") ?? null);
      }
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
      mark(null);
    };
  }, [token, handleUploadFiles]);

  return {
    uploadQueue,
    isDragOver,
    handleUploadFiles,
    removeItem,
    retryItem,
    clearFinished,
    cancelAll,
    canRetry: (id) => runtime.current.has(id),
    panelOpen: ui.open,
    setPanelOpen: (open) => setUi((prev) => ({ ...prev, open })),
    collapsed: ui.collapsed,
    setCollapsed: (collapsed) => setUi((prev) => ({ ...prev, collapsed })),
  };
}
