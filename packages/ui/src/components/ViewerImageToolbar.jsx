import {
  FlipHorizontal2,
  FlipVertical2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { MAX_ZOOM, MIN_ZOOM } from "../hooks/useViewerImageTransform.js";
import { withShortcut } from "../hooks/useViewerShortcuts.js";

function ToolbarBtn({ children, title, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={[
        "h-8 w-8 sm:h-7 sm:w-7 rounded-md flex items-center justify-center transition-all duration-150",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        active
          ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
          : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Group({ children }) {
  return <div className="flex items-center rounded-lg bg-[hsl(var(--muted))]/60 p-0.5 shrink-0">{children}</div>;
}

function Divider() {
  return <div className="w-px h-4 bg-[hsl(var(--border))] mx-0.5 shrink-0" />;
}

// Zoom / rotate / flip / reset controls for an image in AdvancedFileViewer.
// `t` is the useViewerImageTransform result.
export function ViewerImageToolbar({ t }) {
  return (
    <>
      <Group>
        <ToolbarBtn onClick={() => t.nudgeZoom(-1)} title={withShortcut("Reducir zoom", "zoomout")} disabled={t.zoom <= MIN_ZOOM}>
          <Minus className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <button
          onClick={t.resetZoom}
          title="Restablecer zoom"
          className="h-7 min-w-13 px-2 text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors duration-150 tabular-nums"
        >
          {Math.round(t.zoom * 100)}%
        </button>
        <ToolbarBtn onClick={() => t.nudgeZoom(1)} title={withShortcut("Aumentar zoom", "zoomin")} disabled={t.zoom >= MAX_ZOOM}>
          <Plus className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </Group>
      <Divider />
      <Group>
        <ToolbarBtn onClick={() => t.setRotation((v) => v - 90)} title={withShortcut("Rotar izquierda", "rotl")}>
          <RotateCcw className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => t.setRotation((v) => v + 90)} title={withShortcut("Rotar derecha", "rotr")}>
          <RotateCw className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </Group>
      <Divider />
      <Group>
        <ToolbarBtn onClick={() => t.setFlipX((v) => !v)} title={withShortcut("Voltear horizontal", "fliph")} active={t.flipX}>
          <FlipHorizontal2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => t.setFlipY((v) => !v)} title={withShortcut("Voltear vertical", "flipv")} active={t.flipY}>
          <FlipVertical2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </Group>
      <Divider />
      <div className="shrink-0">
        <ToolbarBtn onClick={t.resetTransforms} title={withShortcut("Restablecer todo", "reset")}>
          <RefreshCw className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>
    </>
  );
}
