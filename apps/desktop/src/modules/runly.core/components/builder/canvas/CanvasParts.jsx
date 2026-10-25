// Building blocks of the automation canvas: block cards, the arrows that connect
// them (SVG) with their "+" insertion buttons, and the closing "add" slot.
//
// Conventions (Runly identity + touch/hover):
// - Cards are rounded-lg containers; controls inside use rounded-md. Selection is
//   a flat brand tint, never a ring or glow.
// - An arrow is solid (brand) while the flow runs right away and dashed (grey,
//   slowly flowing) once it has passed a wait or an approval: from there it runs
//   in the background.
// - Blocks can be dragged anywhere (free layout); the grip reorders the sequence.
// - "+" buttons and grips are revealed on hover/focus where hover exists and are
//   always visible on touch; they grow under `pointer: coarse`.
import { Popover, PopoverContent, PopoverTrigger } from "@runly/ui";
import { AlertCircle, Check, GripVertical, Minus, Plus, X } from "lucide-react";
import { edgePath, pointOnEdge } from "../../../lib/canvasLayout";
import { InsertMenu } from "./InsertMenu";

const cx = (...parts) => parts.filter(Boolean).join(" ");
const REVEAL = "opacity-0 group-hover/node:opacity-100 group-focus-within/node:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

const TILE = {
  brand: "border-transparent bg-(--brand-primary) text-(--brand-primary-foreground)",
  neutral: "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

// Result of the last run on a block: shape + colour + text (never colour alone).
const RUN_BADGE = {
  success: { Icon: Check, label: "Correcto", className: "bg-emerald-600 text-white" },
  failed: { Icon: X, label: "Con error", className: "bg-red-600 text-white" },
  skipped: { Icon: Minus, label: "Omitido", className: "bg-[hsl(var(--muted-foreground))] text-white" },
  waiting: { Icon: Minus, label: "En espera", className: "bg-amber-500 text-white" },
};

const PORT_SIDE = {
  left: "-left-[5px] top-1/2 -translate-y-1/2",
  right: "-right-[5px] top-1/2 -translate-y-1/2",
  top: "-top-[5px] left-1/2 -translate-x-1/2",
  bottom: "-bottom-[5px] left-1/2 -translate-x-1/2",
};

function Port({ side, selected }) {
  if (!side) return null;
  return <span aria-hidden="true" className={cx("absolute z-20 h-2.5 w-2.5 rounded-full border-2 bg-[hsl(var(--card))]", selected ? "border-(--brand-primary)" : "border-[hsl(var(--muted-foreground))]/60", PORT_SIDE[side])} />;
}

export function CanvasNode({ node, selected, dragging, moving, offset, run, move, handle, onSelect, onKeyDown, onFocus }) {
  const { Icon, tone, kind, title, detail, issues = [] } = node;
  const issue = issues[0];
  const badge = run ? RUN_BADGE[run] : null;
  return (
    <div
      data-no-pan
      {...move}
      className={cx("group/node absolute", dragging || moving ? "z-30 cursor-grabbing" : "z-10 cursor-grab", !dragging && !moving && "transition-transform motion-reduce:transition-none")}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height, transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined, ...(move?.style ?? {}) }}
    >
      {(node.sides?.in ?? [node.ports?.in]).map((side) => <Port key={`in-${side}`} side={side} selected={selected} />)}
      {(node.sides?.out ?? [node.ports?.out]).map((side) => <Port key={`out-${side}`} side={side} selected={selected} />)}
      <button
        type="button"
        data-canvas-node={node.id}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cx(
          "relative flex h-full w-full cursor-[inherit] items-center gap-3 overflow-hidden rounded-lg border bg-[hsl(var(--card))] px-3.5 text-left transition-colors",
          selected ? "border-(--brand-primary)/30" : "border-[hsl(var(--border))] hover:border-[hsl(var(--muted-foreground))]/50",
          (dragging || moving) && "shadow-lg",
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
      {badge && (
        <span title={`Última ejecución: ${badge.label}`} className={cx("absolute -left-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[hsl(var(--card))]", badge.className)}>
          <badge.Icon className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Última ejecución: {badge.label}</span>
        </span>
      )}
      {handle && (
        <span
          {...handle}
          role="button"
          tabIndex={-1}
          aria-label={`Arrastrar para reordenar: ${title}`}
          title="Arrastrar para cambiar el orden en el flujo"
          className={cx("absolute right-1.5 top-1.5 z-30 flex h-7 w-7 cursor-grab select-none items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] active:cursor-grabbing [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11", REVEAL)}
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

// Arrows. `background` ones are dashed and drift to show direction.
export function CanvasEdges({ edges, reducedMotion }) {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
      <defs>
        <marker id="edge-arrow-solid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="fill-(--brand-primary)/70" /></marker>
        <marker id="edge-arrow-dashed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="fill-[hsl(var(--muted-foreground))]/60" /></marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edgePath(edge)}
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

// "Sí" / "No" on the first stretch of an arrow that leaves a condition.
export function EdgeLabels({ edges }) {
  return edges.filter((edge) => edge.label).map((edge) => {
    const point = pointOnEdge(edge, 0.3);
    const yes = edge.label === "Sí";
    return (
      <span
        key={`label-${edge.id}`}
        className={cx(
          "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-0.5 text-xs font-semibold leading-4",
          yes ? "border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]",
        )}
        style={{ left: point.x, top: point.y }}
      >
        {edge.label}
      </span>
    );
  });
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

// "+" at the middle of an arrow; the invisible square around it reveals it on hover.
export function EdgePlus({ edge, options, onPick, active, readOnly }) {
  if (readOnly) return null;
  return (
    <div className="group/node absolute z-10 flex items-center justify-center" style={{ left: edge.mid.x - 28, top: edge.mid.y - 28, width: 56, height: 56 }}>
      <PlusButton label="Agregar un bloque aquí" options={options} onPick={onPick} active={active} />
    </div>
  );
}

// Dashed ghost at the end of the flow: always visible, so adding never needs hover.
export function AddGhost({ add, options, onPick, active, readOnly, full }) {
  if (!add) return null;
  return (
    <>
      <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
        <path d={edgePath(add.edge)} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 7" className="stroke-[hsl(var(--muted-foreground))]/40" />
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
