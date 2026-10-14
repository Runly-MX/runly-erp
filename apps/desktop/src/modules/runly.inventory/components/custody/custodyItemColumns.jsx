import { Button } from '@runly/ui'
import { X } from 'lucide-react'

const muted = 'text-[hsl(var(--muted-foreground))]'

// Snapshot item columns shared by the read-only and editable custody tables.
export function custodyItemColumns({ onRemove, disabled } = {}) {
  const columns = [
    { id: 'index', header: '#', enableSorting: false, cell: ({ row }) => <span className={`tabular-nums ${muted}`}>{row.index + 1}</span> },
    { accessorKey: 'typeBrand', header: 'Tipo / marca', cell: ({ row }) => row.original.typeBrand || '—' },
    { accessorKey: 'model', header: 'Modelo', cell: ({ row }) => row.original.model || '—' },
    { accessorKey: 'serialNumber', header: 'Serie', cell: ({ row }) => <span className="font-mono text-xs">{row.original.serialNumber || '—'}</span> },
    { accessorKey: 'assetTag', header: 'Etiqueta', cell: ({ row }) => <span className="font-mono text-xs">{row.original.assetTag || '—'}</span> },
    { accessorKey: 'invoiceNumber', header: 'Factura', cell: ({ row }) => row.original.invoiceNumber || '—' },
    { accessorKey: 'features', header: 'Características', cell: ({ row }) => <span className="line-clamp-2">{row.original.features || '—'}</span> },
  ]
  if (!onRemove) return columns
  return [...columns, {
    id: 'remove', header: '', enableSorting: false, cell: ({ row }) => (
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled}
          aria-label={`Quitar ${row.original.model || row.original.assetTag || 'artículo'}`} onClick={() => onRemove(row.original)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
  }]
}
