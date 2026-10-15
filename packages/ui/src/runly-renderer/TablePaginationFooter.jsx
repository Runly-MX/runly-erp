import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../components/Button.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/Select.jsx";
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_ALL, isAllPageSize, pageSizeLabel } from "../lib/page-size.js";

export function TablePaginationFooter({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  const all = isAllPageSize(pageSize);
  // The picker stays visible while "Todos" is on, so the user can go back.
  if (!all && total <= Math.min(pageSize, PAGE_SIZE_OPTIONS[0])) return null;

  const options = all || PAGE_SIZE_OPTIONS.includes(pageSize)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS.filter((s) => s !== PAGE_SIZE_ALL), pageSize].sort((a, b) => a - b).concat(PAGE_SIZE_ALL);
  const totalPages = all ? 1 : Math.ceil(total / pageSize);
  const from = all ? Math.min(1, total) : (page - 1) * pageSize + 1;
  const to = all ? total : Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]">
      <span className="hidden tabular-nums sm:inline">
        {from}–{to} de {total} registros
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          <span className="tabular-nums">
            <span className="sm:hidden">{page} / {totalPages}</span>
            <span className="hidden sm:inline">Página {page} de {totalPages}</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="hidden sm:inline">Filas por página</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            onPageSizeChange(Number(v));
            onPageChange(1);
          }}
        >
          <SelectTrigger className="h-7 w-20 px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {pageSizeLabel(size)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
