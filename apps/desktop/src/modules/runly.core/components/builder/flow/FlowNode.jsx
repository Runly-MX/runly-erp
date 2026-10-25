// Pieces of the visual automation editor ("Flujo"): the thread (spine) that
// connects the nodes, a node, the "+" slots between nodes and the closing
// "add step" row.
//
// Design rules (Runly identity + touch):
// - The thread is the flow. A solid brand line means "runs right away"; once the
//   flow passes a wait or an approval the thread turns dashed and grey: from
//   there on it runs in the background.
// - Selected node = flat brand fill, no ring or glow. Controls use rounded-md.
// - Hover-capable pointers reveal secondary controls (grip, "+") on hover and
//   keyboard focus. Without hover (touch) they are always visible, and targets
//   grow to 44px under `pointer: coarse`. Nothing essential needs hover: the
//   inspector repeats move/delete for touch and keyboard.
import { forwardRef } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@runly/ui";
import { AlertCircle, GripVertical, Plus } from "lucide-react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

// Visible by default without hover; revealed on hover/focus where hover exists.
const REVEAL = "opacity-0 group-hover/reveal:opacity-100 group-focus-within/reveal:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";
const COARSE = "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

const TONES = {
  brand: "border-transparent bg-(--brand-primary) text-(--brand-primary-foreground)",
  neutral: "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

// One segment of the thread. `background` = dashed (runs later, in the background).
export function Spine({ background = false, from = "top", to = "bottom" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute left-5 w-0 -translate-x-1/2 border-l-2",
        from === "middle" ? "top-1/2" : "top-0",
        to === "middle" ? "bottom-1/2" : "bottom-0",
        background ? "border-dashed border-[hsl(var(--muted-foreground))]/50" : "border-solid border-(--brand-primary)/45",
      )}
    />
  );
}

export const FlowNode = forwardRef(function FlowNode(
  { icon: Icon, tone = "neutral", title, detail, issues = [], selected, background, first, last, dragging, dropMark, handle, onSelect, onKeyDown, nodeId },
  ref,
) {
  return (
    <li ref={ref} className={cx("group/reveal relative pl-12", dragging && "opacity-40")}>
      <Spine background={background} from={first ? "middle" : "top"} to={last ? "middle" : "bottom"} />
      {dropMark && <span aria-hidden="true" className={cx("absolute inset-x-0 z-20 h-0.5", dropMark.edge === "top" ? "-top-px" : "-bottom-px", dropMark.valid ? "bg-(--brand-primary)" : "bg-red-500")} />}
      <span className={cx("absolute left-0.5 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md border", TONES[tone] ?? TONES.neutral)} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex items-stretch gap-1 py-1">
        <button
          type="button"
          data-flow-node={nodeId}
          aria-current={selected ? "true" : undefined}
          onClick={onSelect}
          onKeyDown={onKeyDown}
          className={cx(
            "min-h-12 min-w-0 flex-1 cursor-pointer rounded-md px-3 py-2 text-left transition-colors",
            selected ? "bg-(--brand-primary)/15" : "hover:bg-[hsl(var(--muted))]/60",
          )}
        >
          <span className="block truncate text-sm font-medium leading-snug">{title}</span>
          {detail && <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{detail}</span>}
          {issues.length > 0 && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {issues[0]}
            </span>
          )}
        </button>
        {handle && (
          <span
            {...handle}
            role="button"
            tabIndex={-1}
            aria-label={`Arrastrar para reordenar: ${title}`}
            title="Arrastrar para reordenar"
            className={cx("flex h-8 w-8 shrink-0 cursor-grab select-none items-center justify-center self-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] active:cursor-grabbing", COARSE, REVEAL)}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
      </div>
    </li>
  );
});

function InsertMenu({ options, onPick }) {
  return (
    <ul className="space-y-0.5">
      {options.map((option) => (
        <li key={option.kind}>
          <button
            type="button"
            disabled={option.disabled}
            onClick={() => onPick(option.kind)}
            className="w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent [@media(pointer:coarse)]:min-h-11"
          >
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="block text-xs text-[hsl(var(--muted-foreground))]">{option.disabled ? option.reason : option.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// The "+" between two nodes. `caption` marks where the background part begins.
export function FlowSlot({ options, background, caption, readOnly, onPick }) {
  const hasCaption = Boolean(caption);
  return (
    <li className={cx("group/reveal relative pl-12", hasCaption ? "min-h-9" : "h-6 [@media(pointer:coarse)]:h-9")}>
      <Spine background={background} />
      {!readOnly && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Agregar un paso aquí"
              title="Agregar un paso aquí"
              className={cx(
                "absolute left-5 top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] transition-opacity hover:bg-(--brand-primary)/15 hover:text-(--brand-primary) data-[state=open]:opacity-100",
                "[@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9",
                REVEAL.replace("opacity-0", "opacity-30"),
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1.5">
            <InsertMenu options={options} onPick={onPick} />
          </PopoverContent>
        </Popover>
      )}
      {hasCaption && <p className="flex h-full items-center pl-3 text-xs text-[hsl(var(--muted-foreground))]">{caption}</p>}
    </li>
  );
}

// Last row: always visible, so adding a step never depends on hover.
export function FlowEnd({ options, background, readOnly, onPick, full }) {
  return (
    <li className="relative pl-12">
      <Spine background={background} to="middle" />
      <span className="absolute left-0.5 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))]" aria-hidden="true">
        <Plus className="h-4 w-4" />
      </span>
      <div className="py-1">
        {readOnly ? (
          <p className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))]">Fin del flujo</p>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-12 w-full justify-start rounded-md px-3 text-[hsl(var(--muted-foreground))]">
                {full ? "Máximo de pasos alcanzado" : "Agregar un paso"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1.5">
              <InsertMenu options={options} onPick={onPick} />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </li>
  );
}

