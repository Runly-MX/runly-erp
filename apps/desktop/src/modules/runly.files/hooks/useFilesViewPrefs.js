import { useState } from "react";
import { useGridZoom } from "@runly/ui";

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
};

// Per-browser view preferences of the explorer: list | grid | mosaic (the old
// "table" / "gallery" values map to list / grid), grid columns (pinch zoom) and the preview pane
// (open by default only on screens wide enough, >= 1600px).
export function useFilesViewPrefs() {
  const [stored, setStored] = useState(() => read("runly-view-mode-files", null));
  const [previewOpen, setPreviewOpenState] = useState(() => read("runly-files-preview", typeof window !== "undefined" && window.innerWidth >= 1600 ? "on" : "off") === "on");
  const viewMode = stored === "table" || stored === "list" ? "list" : stored === "mosaic" ? "mosaic" : "grid";
  const zoom = useGridZoom({
    enabled: viewMode !== "list",
    initial: read("runly-files-columns", ""),
    onPersist: (value) => write("runly-files-columns", String(value)),
  });
  return {
    viewMode,
    zoom,
    changeView: (mode) => {
      setStored(mode);
      write("runly-view-mode-files", mode);
    },
    previewOpen,
    setPreviewOpen: (open) => {
      setPreviewOpenState(open);
      write("runly-files-preview", open ? "on" : "off");
    },
  };
}
