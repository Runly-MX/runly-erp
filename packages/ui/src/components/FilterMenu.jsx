import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './Popover.jsx'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from './Sheet.jsx'
import { Button } from './Button.jsx'
import { FilterOptionsPane } from './FilterMenuPanes.jsx'
import { clearAllPatch, countActiveFilters, isFilterActive, summarizeFilter } from './filter-menu-helpers.js'
import { useIsMobile } from '../hooks/useIsMobile.js'
import { cn } from '../lib/utils.js'

function CategoryRow({ filter, value, selected, mobile, onSelect, onKeyDown, rowRef }) {
  const Icon = filter.icon
  const active = isFilterActive(filter, value)
  const summary = summarizeFilter(filter, value)
  return (
    <button
      ref={rowRef}
      type="button"
      role={mobile ? undefined : 'tab'}
      aria-selected={mobile ? undefined : selected}
      tabIndex={mobile || selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 text-left transition-colors',
        mobile ? 'min-h-12 py-2' : 'min-h-11 py-1.5',
        selected && !mobile ? 'bg-(--brand-soft)' : 'hover:bg-[hsl(var(--muted))]',
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" /> : null}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', active || selected ? 'font-medium' : '')}>{filter.label}</span>
        {summary ? <span className="block truncate text-xs text-(--brand-primary)">{summary}</span> : null}
      </span>
      {mobile ? <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" /> : active ? <span className="h-2 w-2 shrink-0 rounded-full bg-(--brand-primary)" aria-label="Activo" /> : null}
    </button>
  )
}

function TriggerButton({ count, onClick, className, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filtros${count > 0 ? ` (${count} activos)` : ''}`}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors md:h-9',
        count > 0
          ? 'border-(--brand-primary) bg-(--brand-soft) text-[hsl(var(--foreground))]'
          : 'border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]',
        className,
      )}
      {...props}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      Filtros
      {count > 0 ? (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-(--brand-primary) px-1 text-[10px] font-bold leading-none text-(--brand-primary-foreground)">{count}</span>
      ) : null}
    </button>
  )
}

/**
 * FilterMenu - one "Filtros" button replacing a row of filter pills.
 * Desktop: popover with categories on the left and the options on the right.
 * Mobile: bottom sheet with two steps (categories, then the options).
 *
 * filters: [{ key, label, type?: 'select'|'multiselect'|'daterange'|'toggle'|'combobox',
 *             options?: [{ value, label }], icon?, fromKey?, toKey?, allLabel?, description? }]
 * value:   flat object (key -> string | string[] | boolean; fromKey/toKey for ranges)
 * onChange(nextValue): receives the whole value with the change merged in.
 */
export function FilterMenu({ filters = [], value = {}, onChange, className }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const [step, setStep] = useState(null) // mobile: null = categories, key = options
  const rowRefs = useRef({})
  if (!filters.length) return null

  const count = countActiveFilters(filters, value)
  const selected = filters.find((f) => f.key === selectedKey) ?? filters.find((f) => isFilterActive(f, value)) ?? filters[0]
  const stepFilter = filters.find((f) => f.key === step) ?? null
  const patch = (partial) => onChange({ ...value, ...partial })
  const clearAll = () => onChange({ ...value, ...clearAllPatch(filters) })

  const handleOpen = (next) => {
    setOpen(next)
    if (next) { setStep(null); setSelectedKey(null) }
  }

  const onCategoryKey = (index) => (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const next = filters[(index + (event.key === 'ArrowDown' ? 1 : -1) + filters.length) % filters.length]
    setSelectedKey(next.key)
    rowRefs.current[next.key]?.focus()
  }

  if (isMobile) {
    return (
      <>
        <TriggerButton count={count} onClick={() => handleOpen(true)} className={className} />
        <Sheet open={open} onOpenChange={handleOpen}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetHeader>
              <div className="flex items-center gap-1">
                {stepFilter ? (
                  <button type="button" onClick={() => setStep(null)} aria-label="Volver a los filtros" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[hsl(var(--muted))]">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                ) : null}
                <SheetTitle>{stepFilter ? stepFilter.label : 'Filtros'}</SheetTitle>
              </div>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
              {stepFilter ? (
                <FilterOptionsPane filter={stepFilter} value={value} onChange={patch} />
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filters.map((filter) => (
                    <CategoryRow key={filter.key} mobile filter={filter} value={value} onSelect={() => setStep(filter.key)} />
                  ))}
                </div>
              )}
            </div>
            <SheetFooter>
              <Button variant="ghost" onClick={stepFilter ? () => patch(clearAllPatch([stepFilter])) : clearAll} disabled={stepFilter ? !isFilterActive(stepFilter, value) : count === 0}>
                {stepFilter ? 'Limpiar' : 'Limpiar todo'}
              </Button>
              <Button onClick={() => (stepFilter ? setStep(null) : handleOpen(false))}>{stepFilter ? 'Listo' : 'Aplicar'}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <TriggerButton count={count} className={className} />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[min(40rem,calc(100vw-2rem))] flex-col p-0">
        <div className="flex max-h-[min(30rem,70vh)] min-h-[20rem]">
          <div role="tablist" aria-orientation="vertical" aria-label="Filtros" className="w-52 shrink-0 overflow-y-auto border-r border-[hsl(var(--border))] p-2">
            {filters.map((filter, index) => (
              <CategoryRow
                key={filter.key}
                rowRef={(node) => { rowRefs.current[filter.key] = node }}
                filter={filter}
                value={value}
                selected={filter.key === selected.key}
                onSelect={() => setSelectedKey(filter.key)}
                onKeyDown={onCategoryKey(index)}
              />
            ))}
          </div>
          <div role="tabpanel" aria-label={selected.label} className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{selected.label}</p>
            <FilterOptionsPane filter={selected} value={value} onChange={patch} />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[hsl(var(--border))] px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={count === 0}>Limpiar todo</Button>
          <Button type="button" size="sm" onClick={() => handleOpen(false)}>Listo</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
