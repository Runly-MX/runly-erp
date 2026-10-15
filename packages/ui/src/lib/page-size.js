// Shared page-size contract for every Runly table. Default is 10 rows; the
// picker offers 10..50 in steps of 10 plus "Todos" (PAGE_SIZE_ALL).
export const DEFAULT_PAGE_SIZE = 10
export const PAGE_SIZE_ALL = 0
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, PAGE_SIZE_ALL]

// Largest page the module APIs accept (see normalizePagination in generated services).
export const SERVER_MAX_PAGE_SIZE = 100
// Safety net for "Todos" on server-paginated tables: stop after this many rows.
export const ALL_ROWS_LIMIT = 5000

export const isAllPageSize = (size) => Number(size) === PAGE_SIZE_ALL
export const pageSizeLabel = (size) => (isAllPageSize(size) ? 'Todos' : String(size))
