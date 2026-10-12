// apps/desktop/src/modules/runly.chat/components/DropZoneOverlay.jsx
// Shared drag-and-drop visual feedback — a blurred backdrop with a bouncing
// upload icon — used by every drop zone in this module (ChatWindow's message
// area, MiniChatWindow, and MessageComposer's own standalone zone in
// ThreadPanel/ExternalInboxScreen) so the effect looks and feels the same
// everywhere. `pointer-events-none` lets the drag/drop events pass through to
// the actual drop-zone element underneath instead of landing on this overlay.
import { UploadCloud } from "lucide-react";

export function DropZoneOverlay({ compact = false, rounded = "rounded-lg" }) {
  return (
    <div
      className={[
        "absolute inset-0 z-30 flex flex-col items-center justify-center gap-2",
        "bg-[hsl(var(--background)/0.75)] backdrop-blur-md",
        "border-2 border-dashed border-[var(--brand-primary)]/50",
        "pointer-events-none",
        rounded,
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center justify-center rounded-full bg-[var(--brand-primary)]/15 animate-bounce",
          compact ? "h-8 w-8" : "h-14 w-14",
        ].join(" ")}
      >
        <UploadCloud className={compact ? "h-4 w-4 text-[var(--brand-primary)]" : "h-7 w-7 text-[var(--brand-primary)]"} />
      </div>
      <p className={["font-medium text-[var(--brand-primary)]", compact ? "text-xs" : "text-sm"].join(" ")}>
        Suelta los archivos aqui
      </p>
    </div>
  );
}
