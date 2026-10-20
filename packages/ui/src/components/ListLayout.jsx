import { useState } from "react";
import { PageNumbersNav } from "./PageNumbers.jsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SearchInput } from "./SearchInput.jsx";
import { ViewModeSwitch, getStoredViewMode } from "./ViewModeSwitch.jsx";
import { MobileFiltersSheet } from "./MobileFiltersSheet.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { ErrorState } from "./ErrorState.jsx";
import { cn } from "../lib/utils.js";

/**
 * ListLayout — standard container for Runly ERP module list screens.
 *
 * Handles: search bar, filters (desktop inline / mobile sheet), 3-view mode
 * switcher with localStorage persistence, pagination row, and empty/error/loading states.
 *
 * Props:
 *   storageKey        — used for localStorage view preference (e.g. "runly.files")
 *   loading / error / empty — data states
 *   search / onSearchChange / searchPlaceholder — search bar
 *   views             — array of enabled view modes: ['table','cards','grid']
 *   defaultView       — default view mode
 *   renderTable / renderCards / renderGrid — render fns for each view
 *   filters           — JSX rendered in the filter row (desktop) / sheet (mobile)
 *   filtersActiveCount / onFiltersClear — for MobileFiltersSheet indicator
 *   actions           — JSX (primary action buttons: "Nuevo", etc.)
 *   toolbarExtras     — JSX (sort selects, bulk actions, etc.)
 *   page / pageSize / total / onPageChange — server-side pagination
 *   className
 */
export function ListLayout({
  storageKey,
  loading = false,
  error = null,
  empty = false,
  emptyMessage,
  search = "",
  onSearchChange,
  searchPlaceholder = "Buscar...",
  views = ["table", "cards", "grid"],
  defaultView = "cards",
  renderTable,
  renderCards,
  renderGrid,
  filters,
  filtersActiveCount = 0,
  onFiltersClear,
  actions,
  toolbarExtras,
  page,
  pageSize,
  total,
  onPageChange,
  className,
}) {
  const [view, setView] = useState(() =>
    getStoredViewMode(storageKey, defaultView),
  );

  // Ensure selected view is available
  const effectiveView = views.includes(view) ? view : views[0];

  function handleViewChange(next) {
    setView(next);
    if (storageKey) {
      try {
        localStorage.setItem(`runly-view-mode-${storageKey}`, next);
      } catch {}
    }
  }

  const totalPages =
    pageSize && total != null ? Math.ceil(total / pageSize) : 0;
  const currentPage = page ?? 1;
  const hasPagination = totalPages > 1 && typeof onPageChange === "function";

  function renderContent() {
    if (error) {
      return <ErrorState message={error} className="py-16" />;
    }
    if (loading) {
      return (
        <div className="py-16 flex justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--border))] border-t-(--brand-primary) animate-spin" />
        </div>
      );
    }
    if (empty) {
      return <EmptyState message={emptyMessage} className="py-16" />;
    }
    if (effectiveView === "table" && renderTable) return renderTable();
    if (effectiveView === "cards" && renderCards) return renderCards();
    if (effectiveView === "grid" && renderGrid) return renderGrid();
    return null;
  }

  const hasSecondRow = Boolean(filters || views.length > 1 || toolbarExtras);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {/* Row 1: Search + Actions */}
        <div className="flex items-center gap-2">
          {onSearchChange && (
            <SearchInput
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 min-w-0"
            />
          )}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>

        {/* Row 2: Filters (desktop) / MobileFiltersSheet trigger + ViewSwitch + extras */}
        {hasSecondRow && (
          <div className="flex flex-wrap items-center gap-2">
            {filters && (
              <>
                {/* Desktop: inline filters */}
                <div className="hidden md:flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  {filters}
                </div>
                {/* Mobile: sheet trigger */}
                <MobileFiltersSheet
                  activeCount={filtersActiveCount}
                  onClear={onFiltersClear}
                >
                  {filters}
                </MobileFiltersSheet>
              </>
            )}

            {toolbarExtras && (
              <div className="flex items-center gap-2">{toolbarExtras}</div>
            )}

            {views.length > 1 && (
              <div className={cn(!filters && !toolbarExtras ? "" : "ml-auto")}>
                <ViewModeSwitch
                  modes={views}
                  value={effectiveView}
                  onChange={handleViewChange}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="min-w-0 w-full overflow-x-auto">{renderContent()}</div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {hasPagination && (
        <div className="flex items-center justify-between gap-2 py-1">
          <p className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
            {(currentPage - 1) * pageSize + 1}
            {" – "}
            {Math.min(currentPage * pageSize, total)}
            {" de "}
            {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Página anterior"
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <PageNumbersNav pageIndex={currentPage - 1} pageCount={totalPages} onPageChange={(index) => onPageChange(index + 1)} />
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Página siguiente"
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
