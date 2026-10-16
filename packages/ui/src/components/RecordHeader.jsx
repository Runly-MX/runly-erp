import { ChevronRight, Loader2, MoreHorizontal } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Button } from "./Button.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./DropdownMenu.jsx";

// Sticky header of a record screen (detail / create / edit): breadcrumb,
// title + subtitle and the action buttons. It wraps instead of overflowing, so
// it works in narrow windows and split panes.
//
// crumbs   [{ label, onClick?, href? }]  last one is the current page
// actions  [{ key, label, icon?, onClick?, type?, form?, variant?, loading?,
//             disabled?, hidden?, destructive?, placement? }]
//   placement "bar" (default): button always visible.
//             "collapse": ghost button from `sm` up, inside "Más acciones" below it.
//             "menu": always inside "Más acciones" (destructive ones go last).
export function RecordHeader({
  crumbs = [],
  title,
  subtitle = null,
  badge = null,
  actions = [],
  sticky = true,
  bleed = false,
  className,
}) {
  const visible = actions.filter((action) => action && !action.hidden);
  const bar = visible.filter((a) => (a.placement ?? "bar") === "bar");
  const collapse = visible.filter((a) => a.placement === "collapse");
  const menu = visible.filter((a) => a.placement === "menu");
  const safeMenu = menu.filter((a) => !a.destructive);
  const dangerMenu = menu.filter((a) => a.destructive);
  const hasMenu = collapse.length + menu.length > 0;

  const renderMenuItem = (action, extraClass) => (
    <DropdownMenuItem
      key={action.key ?? action.label}
      disabled={action.disabled || action.loading}
      onSelect={() => action.onClick?.()}
      className={cn(action.destructive && "text-red-600 focus:text-red-600", extraClass)}
    >
      {action.icon ? <span className="mr-2 inline-flex">{action.icon}</span> : null}
      {action.label}
    </DropdownMenuItem>
  );

  return (
    <header
      className={cn(
        "border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 py-3 backdrop-blur",
        sticky && "sticky top-0 z-20",
        bleed && "-mx-4 px-4 md:-mx-6 md:px-6",
        className,
      )}
    >
      {crumbs.length > 0 ? (
        <nav aria-label="Ruta" className="mb-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            const interactive = !last && (crumb.onClick || crumb.href);
            const text = "max-w-[16rem] truncate";
            return (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                {interactive ? (
                  <a
                    href={crumb.href ?? "#"}
                    onClick={(event) => {
                      if (!crumb.onClick) return;
                      event.preventDefault();
                      crumb.onClick();
                    }}
                    className={cn(text, "hover:text-[hsl(var(--foreground))] hover:underline")}
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className={cn(text, last && "text-[hsl(var(--foreground))]")} aria-current={last ? "page" : undefined}>
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {collapse.map((action) => (
            <Button
              key={action.key ?? action.label}
              type="button"
              variant="ghost"
              size="sm"
              disabled={action.disabled || action.loading}
              onClick={() => action.onClick?.()}
              className="hidden sm:inline-flex"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          {hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Más acciones"
                  className={cn(menu.length === 0 && "sm:hidden")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Más acciones</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {collapse.map((action) => renderMenuItem(action, "sm:hidden"))}
                {safeMenu.map((action) => renderMenuItem(action))}
                {dangerMenu.length > 0 && collapse.length + safeMenu.length > 0 ? <DropdownMenuSeparator /> : null}
                {dangerMenu.map((action) => renderMenuItem(action))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {bar.map((action) => (
            <Button
              key={action.key ?? action.label}
              type={action.type ?? "button"}
              form={action.form}
              size="sm"
              variant={action.variant ?? (action.type === "submit" ? "default" : "outline")}
              disabled={action.disabled || action.loading}
              onClick={action.onClick ? () => action.onClick() : undefined}
            >
              {action.loading ? <Loader2 className="animate-spin" /> : action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}
