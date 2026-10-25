// Building blocks of the automation canvas: node cards, the edges that connect
// them (SVG) with their "+" insertion buttons, and the closing "add" slot.
//
// Conventions (Runly identity + touch/hover):
// - Cards are rounded-lg containers; controls inside use rounded-md. Selection is
//   a flat brand tint, never a ring or glow.
// - An edge is solid (brand) while the flow runs right away and dashed (grey,
//   slowly flowing) once it has passed a wait or an approval: from there it runs
//   in the background.
// - "+" buttons and grips are revealed on hover/focus where hover exists and are
//   always visible on touch; they grow under `pointer: coarse`.
import { Popover, PopoverContent, PopoverTrigger } from "@runly/ui";
import { AlertCircle, GripVertical, Plus } from "lucide-react";
import { edgePath } from "../../../lib/canvasLayout";
import { InsertMenu } from "./InsertMenu";

const cx = (...parts) => parts.filter(Boolean).join(" ");
const REVEAL = "opacity-0 group-hover/node:opacity-100 group-focus-within/node:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

const TILE = {
  brand: "border-transparent bg-(--brand-primary) text-(--brand-primary-foreground)",
  neutral: "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export function CanvasNode({ node, selected, dragging, offset, first, last, orientation, handle, onSelect, onKeyDown, onFocus }) {
  const { Icon, tone, kind, title, detail, issues = [] } = node;
  const issue = issues[0];
  return (
    <div
      data-no-pan
      className={cx("group/node absolute", dragging ? "z-30 cursor-grabbing" : "z-10", !dragging && "transition-transform motion-reduce:transition-none")}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height, transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined }}
    >
      {!first && <span aria-hidden="true" className={cx("absolute z-20 h-2.5 w-2.5 rounded-full border-2 bg-[hsl(var(--card))]", selected ? "border-(--brand-primary)" : "border-[hsl(var(--muted-foreground))]/60", orientation === "horizontal" ? "-left-[5px] top-1/2 -translate-y-1/2" : "-top-[5px] left-1/2 -translate-x-1/2")} />}
      {!last && <span aria-hidden="true" className={cx("absolute z-20 h-2.5 w-2.5 rounded-full border-2 bg-[hsl(var(--card))]", selected ? "border-(--brand-primary)" : "border-[hsl(var(--muted-foreground))]/60", orientation === "horizontal" ? "-right-[5px] top-1/2 -translate-y-1/2" : "-bottom-[5px] left-1/2 -translate-x-1/2")} />}
      <button
        type="button"
        data-canvas-node={node.id}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cx(
          "relative flex h-full w-full cursor-pointer items-center gap-3 overflow-hidden rounded-lg border bg-[hsl(var(--card))] px-3.5 text-left transition-colors",
          selected ? "border-(--brand-primary)/30" : "border-[hsl(var(--border))] hover:border-[hsl(var(--muted-foreground))]/50",
          dragging && "shadow-lg",
        )}
      >
        {selected && <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-(--brand-primary)/15" />}
        <span className={cx("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border", TILE[tone] ?? TILE.neutral)} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">{kind}</span>
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{title}</span>
          {issue ? (
            <span className="flex items-center gap-1 truncate text-xs text-amber-700 dark:text-amber-400"><AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {issue}</span>
          ) : (
            <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{detail}</span>
          )}
        </span>
      </button>
      {handle && (
        <span
          {...handle}
          role="button"
          tabIndex={-1}
          aria-label={`Arrastrar para reordenar: ${title}`}
          title="Arrastrar para reordenar"
          className={cx("absolute right-1.5 top-1.5 z-30 flex h-7 w-7 cursor-grab select-none items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] active:cursor-grabbing [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11", REVEAL)}
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

// Edges and arrowheads. `background` edges are dashed and drift to show direction.
export function CanvasEdges({ edges, orientation, reducedMotion }) {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
      <defs>
        <marker id="edge-arrow-solid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="fill-(--brand-primary)/70" /></marker>
        <marker id="edge-arrow-dashed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="fill-[hsl(var(--muted-foreground))]/60" /></marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edgePath(edge, orientation)}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={edge.background ? "6 7" : undefined}
          markerEnd={`url(#edge-arrow-${edge.background ? "dashed" : "solid"})`}
          className={edge.background ? "stroke-[hsl(var(--muted-foreground))]/55" : "stroke-(--brand-primary)/55"}
        >
          {edge.background && !reducedMotion && <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.8s" repeatCount="indefinite" />}
        </path>
      ))}
    </svg>
  );
}

function PlusButton({ label, options, onPick, active }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-no-pan
          aria-label={label}
          title={label}
          className={cx(
            "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] shadow-sm transition hover:bg-(--brand-primary)/15 hover:text-(--brand-primary) data-[state=open]:bg-(--brand-primary)/15 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
            active ? "scale-110 border-(--brand-primary) text-(--brand-primary)" : REVEAL,
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-1.5">
        <InsertMenu options={options} onPick={onPick} />
      </PopoverContent>
    </Popover>
  );
}

// "+" at the middle of an edge; the invisible band around it reveals it on hover.
export function EdgePlus({ edge, orientation, options, onPick, active, readOnly }) {
  if (readOnly) return null;
  const horizontal = orientation === "horizontal";
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
  return (
    <div
      className="group/node absolute flex items-center justify-center"
      style={horizontal
        ? { left: edge.start.x, top: edge.mid.y - 28, width: length, height: 56 }
        : { left: edge.mid.x - 28, top: edge.start.y, width: 56, height: length }}
    >
      <PlusButton label="Agregar un bloque aquí" options={options} onPick={onPick} active={active} />
    </div>
  );
}

// Dashed ghost at the end of the flow: always visible, so adding never needs hover.
export function AddGhost({ add, orientation, options, onPick, active, readOnly, full }) {
  if (!add) return null;
  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
        <path d={edgePath(add.edge, orientation)} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 7" className="stroke-[hsl(var(--muted-foreground))]/40" />
      </svg>
      <div data-no-pan className="absolute z-10" style={{ left: add.x, top: add.y, width: add.width, height: add.height }}>
        {readOnly ? null : (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={full ? "Máximo de pasos alcanzado" : "Agregar un bloque al final"}
                title={full ? "Máximo de pasos alcanzado" : "Agregar un bloque al final"}
                className={cx(
                  "flex h-full w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed bg-[hsl(var(--card))]/70 text-[hsl(var(--muted-foreground))] transition hover:bg-(--brand-primary)/10 hover:text-(--brand-primary) data-[state=open]:bg-(--brand-primary)/15",
                  active ? "scale-105 border-(--brand-primary) text-(--brand-primary)" : "border-[hsl(var(--muted-foreground))]/40",
                )}
              >
                <Plus className="h-6 w-6" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-72 p-1.5">
              <InsertMenu options={options} onPick={onPick} />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </>
  );
}
