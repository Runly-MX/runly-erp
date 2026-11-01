// apps/desktop/src/modules/runly.catalog/components/ProductsTable.jsx
import { Checkbox, StatusPill } from '@runly/ui'
import { Box, ImageOff, Layers, Pencil, Trash2 } from 'lucide-react'
import { formatCurrency } from '../lib/formatCurrency.js'
import { ChannelPills, StockSummary } from './ProductStatusPills.jsx'

const th = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]'
const iconButton = 'flex h-11 w-11 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:h-9 sm:w-9'

export default function ProductsTable({ products, selectedIds, onToggleSelect, onToggleSelectAll, onView, onEdit, onDelete }) {
  const allSelected = onToggleSelectAll && products.length > 0 && selectedIds?.size === products.length
  return (
    <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">Productos del catálogo</caption>
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            {onToggleSelectAll && (
              <th scope="col" className={`${th} w-10`}>
                <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} aria-label="Seleccionar todos los de esta página" />
              </th>
            )}
            <th scope="col" className={th}>Producto</th>
            <th scope="col" className={`${th} hidden lg:table-cell`}>Categoría</th>
            <th scope="col" className={`${th} text-right`}>Precio</th>
            <th scope="col" className={th}>Existencias</th>
            <th scope="col" className={th}>Canales</th>
            <th scope="col" className={`${th} text-right`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const selected = selectedIds?.has(product.id) ?? false
            const isVariable = product.product_type === 'VARIABLE'
            return (
              <tr
                key={product.id}
                onClick={() => onView(product)}
                className={`cursor-pointer border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--muted))]/50 ${selected ? 'bg-(--brand-soft)' : ''}`}
              >
                {onToggleSelect && (
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(product.id)} aria-label={`Seleccionar ${product.name}`} />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--muted))]">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]">
                          <ImageOff size={16} aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onView(product) }}
                        className="block max-w-full truncate rounded text-left font-semibold text-[hsl(var(--foreground))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      >
                        {product.name}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                        <span className="inline-flex items-center gap-1">
                          {isVariable ? <Layers className="h-3 w-3" aria-hidden="true" /> : <Box className="h-3 w-3" aria-hidden="true" />}
                          {isVariable ? 'Con variantes' : 'Simple'}
                        </span>
                        {product.sku && <span className="font-mono">SKU {product.sku}</span>}
                        {product.barcode && <span className="font-mono">{product.barcode}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-3 py-2 text-[hsl(var(--muted-foreground))] lg:table-cell">
                  {product.category_name ?? 'Sin categoría'}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="font-semibold tabular-nums text-[hsl(var(--foreground))]">
                    {formatCurrency(product.price, product.currency)}
                    <span className="ml-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{product.currency}</span>
                  </div>
                  {isVariable && <div className="text-xs text-[hsl(var(--muted-foreground))]">Precio base</div>}
                </td>
                <td className="px-3 py-2"><StockSummary product={product} /></td>
                <td className="px-3 py-2"><ChannelPills product={product} /></td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {onEdit && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(product) }} className={iconButton} aria-label={`Editar ${product.name}`} title="Editar">
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(product) }} className={`${iconButton} hover:text-red-700 dark:hover:text-red-300`} aria-label={`Eliminar ${product.name}`} title="Eliminar">
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ProductTypePill({ type }) {
  return type === 'VARIABLE'
    ? <StatusPill size="sm" tone="neutral" icon={Layers}>Con variantes</StatusPill>
    : <StatusPill size="sm" tone="neutral" icon={Box}>Simple</StatusPill>
}
