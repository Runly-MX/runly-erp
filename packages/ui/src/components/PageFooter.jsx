import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button.jsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select.jsx'
import { cn } from '../lib/utils.js'
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_ALL, pageSizeLabel } from '../lib/page-size.js'
import { buildPageWindow } from '../lib/page-window.js'

// Numbered pager: arrows plus first/last page and a few pages around the current one. The compact
// window (current page only) shows below `sm`, the wider one from `sm` up; both jump straight to a page.
function PageNumbers({ pageIndex, pageCount, siblings, onPageChange, className }) {
  return (
    <ul className={cn('items-center gap-1', className)}>
      {buildPageWindow(pageIndex, pageCount, siblings).map((item, i) => (
        item === 'gap' ? (
          <li key={`gap-${i}`} aria-hidden className="flex h-9 w-6 items-center justify-center sm:h-8 sm:w-6">…</li>
        ) : (
          <li key={item}>
            <button
              type="button"
              aria-label={`Ir a la página ${item}`}
              aria-current={item === pageIndex + 1 ? 'page' : undefined}
              onClick={() => item !== pageIndex + 1 && onPageChange(item - 1)}
              className={cn(
                'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs tabular-nums transition-colors sm:h-8 sm:min-w-8',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                item === pageIndex + 1
                  ? 'bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))]'
                  : 'hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
              )}
            >
              {item}
            </button>
          </li>
        )
      ))}
    </ul>
  )
}

// Pagination footer under a table: a quiet line (no band of its own) with the
// record count, rows-per-page and the pager. The page-size picker and pager
// only appear when there is more than one page's worth of rows. `allSelected`
// is the "Todos" choice: the table shows every row, so the page size is the
// row count and the picker stays to go back.
export function PageFooter({
  total = 0,
  pageIndex = 0,
  pageCount = 1,
  pageSize = 10,
  onPrevious,
  onNext,
  onPageChange,
  canPrevious = false,
  canNext = false,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  allSelected = false,
  className,
}) {
  const from = total === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, total)
  const smallest = Math.min(...pageSizeOptions.filter((s) => s !== PAGE_SIZE_ALL))
  const options = allSelected || pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions.filter((s) => s !== PAGE_SIZE_ALL), pageSize].sort((a, b) => a - b).concat(PAGE_SIZE_ALL)
  const showSize = Boolean(onPageSizeChange) && (allSelected || total > smallest)
  const showPager = pageCount > 1

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-1 pt-3 text-xs text-[hsl(var(--muted-foreground))]', className)}>
      <p className="tabular-nums">
        {total === 0 ? 'Sin registros' : allSelected || total <= pageSize ? `${total} ${total === 1 ? 'registro' : 'registros'}` : `${from}–${to} de ${total} registros`}
      </p>

      {(showSize || showPager) && (
        <div className="flex items-center gap-4">
          {showSize && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Filas por página</span>
              <Select value={allSelected ? String(PAGE_SIZE_ALL) : String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger className="h-8 w-20 rounded-lg px-2.5 text-xs" aria-label="Filas por página">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((s) => (
                    <SelectItem key={s} value={String(s)} className="text-xs">{pageSizeLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPager && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon-sm" className="h-9 w-9 rounded-lg sm:h-8 sm:w-8" aria-label="Página anterior" onClick={onPrevious} disabled={!canPrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {onPageChange ? (
                <nav aria-label="Paginación" className="flex items-center">
                  <PageNumbers pageIndex={pageIndex} pageCount={pageCount} siblings={0} onPageChange={onPageChange} className="flex sm:hidden" />
                  <PageNumbers pageIndex={pageIndex} pageCount={pageCount} siblings={2} onPageChange={onPageChange} className="hidden sm:flex" />
                </nav>
              ) : (
                <span className="min-w-20 text-center tabular-nums">Página {pageIndex + 1} de {pageCount}</span>
              )}
              <Button variant="outline" size="icon-sm" className="h-9 w-9 rounded-lg sm:h-8 sm:w-8" aria-label="Página siguiente" onClick={onNext} disabled={!canNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
