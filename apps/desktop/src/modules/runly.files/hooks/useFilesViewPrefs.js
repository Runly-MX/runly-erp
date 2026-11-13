import { useState } from "react";
import { TILE_SIZES } from "../components/FilesToolbar";

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
// "table" / "gallery" values map to list / grid), tile size and the preview pane
// (open by default only on screens wide enough, >= 1600px).
export function useFilesViewPrefs() {
  const [stored, setStored] = useState(() => read("runly-view-mode-files", null));
  const [tileSize, setTileSizeState] = useState(() => {
    const saved = Number(read("runly-files-tile", 0));
    return TILE_SIZES.includes(saved) ? saved : TILE_SIZES[1];
  });
  const [previewOpen, setPreviewOpenState] = useState(() => read("runly-files-preview", typeof window !== "undefined" && window.innerWidth >= 1600 ? "on" : "off") === "on");
  return {
    viewMode: stored === "table" || stored === "list" ? "list" : stored === "mosaic" ? "mosaic" : "grid",
    changeView: (mode) => {
      setStored(mode);
      write("runly-view-mode-files", mode);
    },
    tileSize,
    setTileSize: (size) => {
      setTileSizeState(size);
      write("runly-files-tile", String(size));
    },
    previewOpen,
    setPreviewOpen: (open) => {
      setPreviewOpenState(open);
      write("runly-files-preview", open ? "on" : "off");
    },
  };
}
