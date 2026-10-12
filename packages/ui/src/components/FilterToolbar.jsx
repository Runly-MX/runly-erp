import { MobileFiltersSheet } from './MobileFiltersSheet.jsx'
import { cn } from '../lib/utils.js'

// One toolbar for every list: search + filters + actions.
// Desktop (md+): a single aligned row; every control shares the same height
// (h-9) and radius (rounded-xl). Mobile: search plus one "Filtros" button that
// opens a bottom sheet with the filters stacked, and actions on their own row,
// so nothing is cramped. Pass the same `filters` node for both layouts.
export function FilterToolbar({ search, filters, actions, activeCount = 0, onClear, className }) {
  return (
    <div className={cn('runly-toolbar-controls flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        {search ? <div className="min-w-0 flex-1 md:max-w-xs md:flex-none md:basis-72">{search}</div> : null}
        {filters ? <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">{filters}</div> : null}
        {filters ? (
          <MobileFiltersSheet activeCount={activeCount} onClear={onClear}>
            <div className="runly-toolbar-controls flex flex-col gap-3 [&>*]:w-full [&>button]:justify-start [&>button>svg:last-child:not(:first-child)]:ml-auto">{filters}</div>
          </MobileFiltersSheet>
        ) : null}
        {actions ? <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">{actions}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 md:hidden [&>*]:flex-1">{actions}</div> : null}
    </div>
  )
}
