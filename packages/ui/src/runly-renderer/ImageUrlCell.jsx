import { useState } from "react";
import { ImageViewer } from "../components/ImageViewer.jsx";

// Plain `type: "image"` cell (a ready URL): a thumbnail that opens the full
// image. A button, so the row's double-click-to-open gesture ignores it.
export function ImageUrlCell({ src, alt = "", className = "h-8 w-8 rounded-lg object-cover", buttonClassName = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Ver imagen"
        onClick={() => setOpen(true)}
        className={`block cursor-zoom-in ${buttonClassName}`}
      >
        <img src={src} alt={alt} className={className} />
      </button>
      <ImageViewer src={src} alt={alt || "Imagen"} open={open} onClose={() => setOpen(false)} allowZoom />
    </>
  );
}
