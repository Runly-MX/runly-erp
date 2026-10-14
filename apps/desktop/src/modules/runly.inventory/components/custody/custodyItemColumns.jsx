import { Button } from '@runly/ui'
import { X } from 'lucide-react'
import { CustodyEditableCell } from './CustodyEditableCell.jsx'

const muted = 'text-[hsl(var(--muted-foreground))]'

// [field, header, mono, clamp]
const FIELDS = [
  ['typeBrand', 'Tipo / marca'],
  ['model', 'Modelo'],
  ['serialNumber', 'Serie', true],
  ['assetTag', 'Núm. de activo', true],
  ['invoiceNumber', 'Factura'],
  ['features', 'Características', false, true],
]

function readOnlyCell(field, mono, clamp) {
  return ({ row }) => {
    const value = row.original[field] || '—'
    if (mono) return <span className="font-mono text-xs">{value}</span>
    return clamp ? <span className="line-clamp-2">{value}</span> : value
  }
}

// Snapshot item columns shared by the read-only and editable custody tables.
// `onEdit(row, field, text)` turns the snapshot cells into inline editors.
export function custodyItemColumns({ onRemove, onEdit, disabled } = {}) {
  const columns = [
    { id: 'index', header: '#', enableSorting: false, cell: ({ row }) => <span className={`tabular-nums ${muted}`}>{row.index + 1}</span> },
    ...FIELDS.map(([field, header, mono, clamp]) => ({
      accessorKey: field,
      header,
      enableSorting: !onEdit,
      cell: onEdit
        ? ({ row }) => (
          <CustodyEditableCell row={row.original} field={field} label={header} mono={mono} clamp={clamp} disabled={disabled} onSave={onEdit} />
        )
        : readOnlyCell(field, mono, clamp),
    })),
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
