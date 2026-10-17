import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils.js";
import { useScrollCollapse } from "../hooks/useScrollCollapse.js";

const EASE = "duration-200 ease-out motion-reduce:transition-none";

// PageHeader with `collapseOnScroll`: shrinks into a single thin row (back,
// title, actions) once the content scrolls past a small threshold, and grows
// back at the top. See PageHeader.jsx for the props.
export function PageHeaderCollapsing({
  eyebrow,
  title,
  description,
  actions,
  compact,
  onBack,
  backLabel = "Volver",
  loading,
  sticky = false,
  collapsed: controlled,
  className,
}) {
  const external = typeof controlled === "boolean";
  const scroll = useScrollCollapse({ enabled: !external, reserve: sticky });
  const collapsed = external ? controlled : scroll.collapsed;

  // Eyebrow and description fade and collapse to nothing (inert so their
  // controls leave the tab order while hidden).
  const fold = (extra) =>
    cn(
      "min-w-0 overflow-hidden transition-[max-height,opacity]",
      EASE,
      collapsed ? "max-h-0 max-w-0 basis-0 opacity-0" : "max-h-40 basis-full opacity-100",
      extra,
    );

  return (
    <>
      {external ? null : <div ref={scroll.sentinelRef} aria-hidden="true" className="pointer-events-none" />}
      <header
        ref={scroll.targetRef}
        data-collapsed={collapsed ? "" : undefined}
        className={cn(
          "flex gap-x-4 gap-y-3 border-b border-transparent bg-[hsl(var(--background))]/95 backdrop-blur",
          "transition-[padding,box-shadow,border-color]",
          EASE,
          sticky && "sticky top-0 z-20",
          compact ? "pb-4" : "pb-6",
          collapsed
            ? "flex-row items-center justify-between"
            : cn("flex-col", compact ? "sm:flex-row sm:items-center sm:justify-between" : "sm:flex-row sm:items-start sm:justify-between"),
          className,
          collapsed && "py-2 shadow-sm border-[hsl(var(--border))]",
        )}
      >
        <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-3", collapsed ? "gap-y-0" : "gap-y-1")}>
          {onBack ? (
            <div className={collapsed ? "shrink-0" : "basis-full"}>
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1 rounded-md text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
              >
                <ArrowLeft size={11} />
                {backLabel}
              </button>
            </div>
          ) : null}
          {eyebrow ? (
            <div className={fold()} inert={collapsed}>
              <p
                className={cn(
                  "truncate text-[hsl(var(--muted-foreground))]",
                  compact ? "text-xs" : "text-[11px] font-semibold uppercase tracking-[0.2em]",
                )}
              >
                {eyebrow}
              </p>
            </div>
          ) : null}
          {loading ? (
            <div className={cn("rounded-lg bg-[hsl(var(--muted))] animate-pulse", collapsed ? "h-5 w-32" : "h-7 w-44")} />
          ) : (
            <h1
              className={cn(
                "min-w-0 tracking-tight text-[hsl(var(--foreground))] transition-[font-size,line-height]",
                EASE,
                collapsed
                  ? "flex-1 basis-0 truncate text-base font-semibold"
                  : cn("basis-full", compact ? "truncate text-xl font-semibold" : "text-2xl font-bold"),
              )}
            >
              {title}
            </h1>
          )}
          {description && !loading ? (
            <div className={fold("text-sm leading-relaxed text-[hsl(var(--muted-foreground))]")} inert={collapsed}>
              <div className="max-w-2xl">{description}</div>
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cn(
              "flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 [&>*]:min-w-0",
              !collapsed && !compact && "w-full justify-start sm:w-auto sm:justify-end",
            )}
          >
            {actions}
          </div>
        ) : null}
      </header>
    </>
  );
}
