import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { runly } from "../../../lib/runly";

// Upload queue (with per-file progress) plus the window-level drop zone for
// files dragged in from the OS.
export function useFilesUpload({ token, canUploadFiles, shareWithCompany, currentFolder }) {
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);

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
          await runly.files.upload(formData, token, {
            onProgress: (progress) =>
              setUploadQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, progress } : q))),
          });
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
      let droppedFiles = Array.from(e.dataTransfer?.files || []);
      // iOS drags from Photos can expose files only through dataTransfer.items.
      if (!droppedFiles.length)
        droppedFiles = Array.from(e.dataTransfer?.items || [])
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter(Boolean);
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

  return { uploadQueue, setUploadQueue, isDragOver, handleUploadFiles };
}
