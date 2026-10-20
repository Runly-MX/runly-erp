import { cn } from '../lib/utils.js'
import { buildPageWindow } from '../lib/page-window.js'

// Numbered pager: arrows plus first/last page and a few pages around the current one. The compact
// window (current page only) shows below `sm`, the wider one from `sm` up; both jump straight to a page.
export function PageNumbers({ pageIndex, pageCount, siblings, onPageChange, className }) {
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

// Page numbers with both responsive windows (compact below `sm`, wider from `sm` up) in one nav.
// `onPageChange` receives a zero-based page index, like PageFooter.
export function PageNumbersNav({ pageIndex, pageCount, onPageChange }) {
  return (
    <nav aria-label="Paginación" className="flex items-center">
      <PageNumbers pageIndex={pageIndex} pageCount={pageCount} siblings={0} onPageChange={onPageChange} className="flex sm:hidden" />
      <PageNumbers pageIndex={pageIndex} pageCount={pageCount} siblings={2} onPageChange={onPageChange} className="hidden sm:flex" />
    </nav>
  )
}
