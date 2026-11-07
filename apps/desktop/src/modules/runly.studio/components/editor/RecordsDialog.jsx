import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, SearchInput, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@runly/ui'
import { ChevronLeft, ChevronRight, Plus, Table2, Trash2 } from 'lucide-react'
import { BULK_ROWS, addRow, removeRow, searchRows, setCell } from '../../lib/studio-bulk.js'

const PAGE = 25

// "Registros": every record that will become a version, editable in place.
// Edits live in the in-memory dataset only; the source and the design are untouched.
export function RecordsDialog({ open, onOpenChange, data, onChange }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [query])
  const shown = useMemo(() => searchRows(data, query), [data, query])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), current = Math.min(page, pages - 1), visible = shown.slice(current * PAGE, (current + 1) * PAGE)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Table2}>
          <DialogTitle>Registros</DialogTitle>
          <DialogDescription>{data.rows.length} {data.rows.length === 1 ? 'versión' : 'versiones'} desde {data.fileName}. Los cambios solo aplican a esta descarga.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery('')} placeholder="Buscar en los registros…" aria-label="Buscar registros" maxLength={60} className="flex-1" />
          <Button type="button" variant="outline" className="shrink-0 gap-1.5" disabled={data.rows.length >= BULK_ROWS} onClick={() => { onChange(addRow(data)); setQuery(''); setPage(Math.floor(data.rows.length / PAGE)) }}><Plus className="h-4 w-4" aria-hidden />Agregar fila</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[hsl(var(--border))]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">#</TableHead>
                {data.headers.map(header => <TableHead key={header} className="min-w-36 whitespace-nowrap">{header}</TableHead>)}
                <TableHead className="w-10"><span className="sr-only">Quitar</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(index => (
                <TableRow key={index}>
                  <TableCell className="text-right text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}</TableCell>
                  {data.headers.map(header => (
                    <TableCell key={header} className="p-1">
                      <Input aria-label={`${header}, fila ${index + 1}`} value={data.rows[index][header] ?? ''} maxLength={500} className="h-8 border-transparent bg-transparent px-2 text-sm hover:border-[hsl(var(--border))]"
                        onChange={event => onChange(setCell(data, index, header, event.target.value))} />
                    </TableCell>
                  ))}
                  <TableCell className="p-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Quitar fila ${index + 1}`} onClick={() => onChange(removeRow(data, index))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {!visible.length ? <TableRow><TableCell colSpan={data.headers.length + 2} className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">{data.rows.length ? 'Ningún registro coincide.' : 'No hay registros. Agrega una fila.'}</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <span>{shown.length} de {data.rows.length}{data.truncated ? ` (el origen tiene ${data.total})` : ''}</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tabular-nums">{current + 1} / {pages}</span>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Página siguiente" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
