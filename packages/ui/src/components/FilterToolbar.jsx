import { MobileFiltersSheet } from './MobileFiltersSheet.jsx'
import { FilterMenu } from './FilterMenu.jsx'
import { ActiveFilterChips } from './ActiveFilterChips.jsx'
import { cn } from '../lib/utils.js'

// One toolbar for every list: search + filters + actions.
//
// Preferred (menu) API: pass `filterSpecs` (FilterMenu specs), `filterValue`
// and `onFilterChange`. Desktop (md+): one row [search] [Filtros] [start] ...
// [actions] [viewSwitch], every control h-9. Mobile: search + Filtros button +
// view switch on row 1, actions on row 2. Removable chips for the active
// filters render under the row.
//
// Legacy API: `filters` as a ReactNode (pills inline on desktop, bottom sheet
// on mobile) with `activeCount`/`onClear`. `start` is an escape hatch node
// (e.g. a date picker) rendered inside the desktop row, and on its own row on
// mobile.
export function FilterToolbar({
  search, filters, filterSpecs, filterValue, onFilterChange, start, actions, viewSwitch, activeCount = 0, onClear, className,
}) {
  const hasMenu = Boolean(filterSpecs?.length)
  return (
    <div className={cn('runly-toolbar-controls flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        {search ? <div className="min-w-0 flex-1 md:max-w-sm">{search}</div> : null}
        {hasMenu ? <FilterMenu filters={filterSpecs} value={filterValue} onChange={onFilterChange} /> : null}
        {start ? <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">{start}</div> : null}
        {!hasMenu && filters ? <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">{filters}</div> : null}
        {!hasMenu && filters ? (
          <MobileFiltersSheet activeCount={activeCount} onClear={onClear}>
            <div className="runly-toolbar-controls flex flex-col gap-3 [&>*]:w-full [&>button]:justify-start [&>button>svg:last-child:not(:first-child)]:ml-auto">{filters}</div>
          </MobileFiltersSheet>
        ) : null}
        {actions || viewSwitch ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions ? <div className="hidden items-center gap-2 md:flex">{actions}</div> : null}
            {viewSwitch}
          </div>
        ) : null}
      </div>
      {start ? <div className="flex flex-wrap items-center gap-2 md:hidden [&>*]:min-w-0">{start}</div> : null}
      {actions ? <div className="flex items-center gap-2 md:hidden [&>*]:flex-1">{actions}</div> : null}
      {hasMenu ? <ActiveFilterChips filters={filterSpecs} value={filterValue} onChange={onFilterChange} /> : null}
    </div>
  )
}
