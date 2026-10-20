import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ChevronsUpDown, FileSearch } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './Table.jsx'
import { useColumnResize } from '../hooks/useColumnResize.js'
import { ColumnResizeHandle } from './ColumnResizeHandle.jsx'
import { Button } from './Button.jsx'
import { Skeleton } from './Skeleton.jsx'
import { SearchInput } from './SearchInput.jsx'
import { FilterBar } from './FilterBar.jsx'
import { FilterToolbar } from './FilterToolbar.jsx'
import { clearAllPatch, countActiveFilters, filterType, isFilterActive } from './filter-menu-helpers.js'
import { EmptyState } from './EmptyState.jsx'
import { ErrorState } from './ErrorState.jsx'
import { PageFooter } from './PageFooter.jsx'
import { isAllPageSize } from '../lib/page-size.js'
import { ViewModeSwitch, getStoredViewMode } from './ViewModeSwitch.jsx'
import { cn } from '../lib/utils.js'

const GRID_CLASSES = {
  cards: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
  grid: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
}

const isControlledFilter = (spec) => typeof spec.onChange === 'function'
const filterKeys = (spec) => (filterType(spec) === 'daterange' ? [spec.fromKey, spec.toKey] : [spec.key])

// Value slice a controlled spec owns, as flat keys of the menu value.
function controlledSlice(spec) {
  const value = spec.value
  if (filterType(spec) === 'daterange') return { [spec.fromKey]: value?.[spec.fromKey] || '', [spec.toKey]: value?.[spec.toKey] || '' }
  if (filterType(spec) === 'multiselect') return { [spec.key]: Array.isArray(value) ? value : [] }
  if (filterType(spec) === 'toggle') return { [spec.key]: value === true }
  return { [spec.key]: value ?? '' }
}

// Client-side match of one (uncontrolled, active) spec against a row.
function matchesFilter(spec, row, values) {
  const type = filterType(spec)
  if (type === 'daterange') {
    const from = values[spec.fromKey]
    const to = values[spec.toKey]
    if (spec.match) return spec.match(row, { from, to })
    const day = String(row[spec.key] ?? '').slice(0, 10)
    return Boolean(day) && (!from || day >= from) && (!to || day <= to)
  }
  const active = values[spec.key]
  if (type === 'multiselect') return spec.match ? spec.match(row, active) : active.includes(String(row[spec.key]))
  if (type === 'toggle') return spec.match ? spec.match(row, true) : Boolean(row[spec.key])
  return spec.match ? spec.match(row, active) : String(row[spec.key]) === String(active)
}

export function DataTable({
  columns,
  data,
  searchPlaceholder = 'Buscar...',
  pageSize: initialPageSize = 10,
  filters,
  isLoading,
  isError,
  onRetry,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
  manualPagination = false,
  getRowId,
  autoResetPageIndex,
  showToolbar = true,
  showPagination = true,
  toolbarStart,
  toolbarActions,
  viewModes,
  viewMode: controlledViewMode,
  onViewModeChange,
  viewStorageKey,
  // Where column widths are remembered (this browser only). Defaults to the view key or the column ids.
  resizeKey,
  defaultViewMode,
  renderCard,
  cardGridClassName,
  filtersLayout = 'menu',
}) {
  const EMPTY_ROWS = useMemo(() => [], [])
  const resize = useColumnResize(resizeKey ?? viewStorageKey ?? `cols:${columns.map((c) => c.id ?? c.accessorKey ?? '').join('|')}`)
  const [sorting, setSorting] = useState([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: initialPageSize })
  const [showAll, setShowAll] = useState(false)

  // Optional Tabla / Tarjetas toggle. Controlled via viewMode + onViewModeChange, otherwise
  // uncontrolled and persisted under viewStorageKey. Only active when renderCard is provided.
  const switchModes = renderCard && viewModes?.length > 1 ? viewModes : null
  const [storedViewMode, setStoredViewMode] = useState(() => getStoredViewMode(viewStorageKey, defaultViewMode ?? viewModes?.[0] ?? 'table'))
  const requestedMode = controlledViewMode ?? storedViewMode
  const currentViewMode = switchModes ? (switchModes.includes(requestedMode) ? requestedMode : (defaultViewMode ?? switchModes[0])) : 'table'
  const cardsActive = currentViewMode !== 'table'
  const changeViewMode = (mode) => {
    if (controlledViewMode === undefined) setStoredViewMode(mode)
    onViewModeChange?.(mode)
  }

  const specs = useMemo(() => filters ?? [], [filters])
  // Controlled specs (they carry their own onChange) keep their value in the
  // caller, e.g. filters that refetch from the API; the rest filter client-side.
  const menuValue = useMemo(() => {
    const merged = { ...filterValues }
    specs.filter(isControlledFilter).forEach((spec) => Object.assign(merged, controlledSlice(spec)))
    return merged
  }, [specs, filterValues])

  const handleFilterChange = (next) => {
    const local = {}
    specs.forEach((spec) => {
      if (!isControlledFilter(spec)) {
        filterKeys(spec).forEach((key) => { local[key] = next[key] })
        return
      }
      const before = controlledSlice(spec)
      const after = {}
      filterKeys(spec).forEach((key) => { after[key] = next[key] })
      if (JSON.stringify(before) === JSON.stringify(after)) return
      spec.onChange(filterType(spec) === 'daterange' ? after : after[spec.key])
    })
    setFilterValues(local)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  // `filtersLayout="pills"` renders FilterBar pills (select / daterange only) instead of the Filtros menu.
  const pillSpecs = useMemo(() => (filtersLayout === 'pills' ? specs.filter((s) => ['select', 'combobox', 'daterange'].includes(filterType(s))) : []), [specs, filtersLayout])

  const filteredData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return EMPTY_ROWS
    const clientSpecs = specs.filter((spec) => !isControlledFilter(spec) && isFilterActive(spec, filterValues))
    if (!clientSpecs.length) return data
    return data.filter((row) => clientSpecs.every((spec) => matchesFilter(spec, row, filterValues)))
  }, [data, specs, filterValues, EMPTY_ROWS])

  const table = useReactTable({
    data: filteredData,
    getRowId,
    autoResetPageIndex,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination,
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  useEffect(() => {
    if (!showAll) return
    const size = Math.max(filteredCount, 1)
    setPagination((p) => (p.pageSize === size && p.pageIndex === 0 ? p : { ...p, pageIndex: 0, pageSize: size }))
  }, [showAll, filteredCount])

  const rows = table.getRowModel().rows

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {showToolbar && (columns.length > 0 || filters) && (
        <FilterToolbar
          className="pb-3"
          search={(
            <SearchInput
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
              placeholder={searchPlaceholder}
              className="w-full"
            />
          )}
          {...(filtersLayout === 'pills'
            ? (pillSpecs.length ? {
              filters: <FilterBar filters={pillSpecs} value={menuValue} onChange={(next) => handleFilterChange({ ...menuValue, ...next })} />,
              activeCount: countActiveFilters(pillSpecs, menuValue),
              onClear: () => handleFilterChange({ ...menuValue, ...clearAllPatch(pillSpecs) }),
            } : {})
            : { filterSpecs: specs, filterValue: menuValue, onFilterChange: handleFilterChange })}
          start={toolbarStart}
          actions={toolbarActions}
          viewSwitch={switchModes ? <ViewModeSwitch modes={switchModes} value={currentViewMode} onChange={changeViewMode} storageKey={viewStorageKey} /> : null}
        />
      )}

      {cardsActive ? (
        isLoading ? (
          <div className={cn('grid gap-4', cardGridClassName ?? GRID_CLASSES[currentViewMode] ?? GRID_CLASSES.cards)}>
            {Array.from({ length: Math.min(pagination.pageSize, 6) }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : isError ? (
          <ErrorState title="Error al cargar los datos" description="No se pudieron obtener los registros." onRetry={onRetry} />
        ) : rows.length === 0 ? (
          <EmptyState icon={emptyIcon ?? FileSearch} title={emptyTitle} description={emptyDescription} action={emptyAction} />
        ) : (
          <div className={cn('grid gap-4', cardGridClassName ?? GRID_CLASSES[currentViewMode] ?? GRID_CLASSES.cards)}>
            {rows.map((row) => <Fragment key={row.id}>{renderCard(row.original, row)}</Fragment>)}
          </div>
        )
      ) : (
      <div className="rounded-2xl surface-card overflow-clip">
        <Table {...resize.tableProps(table.getVisibleLeafColumns().map((c) => c.id))}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="relative"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    {...resize.headerProps(header.column.id)}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex cursor-pointer items-center gap-1 hover:text-[hsl(var(--foreground))] transition-colors"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-(--brand-primary)" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5 text-(--brand-primary)" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                    {header.isPlaceholder ? null : <ColumnResizeHandle {...resize.handleProps(header.column.id)} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pagination.pageSize }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-0">
                  <ErrorState
                    title="Error al cargar los datos"
                    description="No se pudieron obtener los registros."
                    onRetry={onRetry}
                    className="border-0 rounded-none"
                  />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-0">
                  <EmptyState
                    icon={emptyIcon ?? FileSearch}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                    className="border-0 rounded-none"
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={resize.resized ? 'overflow-hidden' : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {showPagination && <PageFooter
        total={table.getFilteredRowModel().rows.length}
        pageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
        pageSize={table.getState().pagination.pageSize}
        canPrevious={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
        onPrevious={() => table.previousPage()}
        onNext={() => table.nextPage()}
        onPageChange={(index) => table.setPageIndex(index)}
        allSelected={showAll}
        onPageSizeChange={(size) => {
          const all = isAllPageSize(size)
          setShowAll(all)
          const effective = all ? Math.max(table.getFilteredRowModel().rows.length, 1) : size
          table.setPageSize(effective)
          setPagination((p) => ({ ...p, pageIndex: 0, pageSize: effective }))
        }}
      />}
    </div>
  )
}
