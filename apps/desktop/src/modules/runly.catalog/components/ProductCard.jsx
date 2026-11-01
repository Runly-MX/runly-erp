// apps/desktop/src/modules/runly.catalog/components/ProductCard.jsx
import { Card, Checkbox } from '@runly/ui'
import { ImageOff, Layers } from 'lucide-react'
import { formatCurrency } from '../lib/formatCurrency.js'
import { ChannelPills, StockSummary } from './ProductStatusPills.jsx'

// Grid tile for the products view. Every value comes from the row returned
// by GET /catalog/products; POS and web are shown as separate channels.
export default function ProductCard({ product, selected = false, onToggleSelect, onSelect }) {
  const isVariable = product.product_type === 'VARIABLE'
  return (
    <Card
      variant="interactive"
      className={`group flex flex-col overflow-hidden rounded-xl p-0 ${selected ? 'bg-(--brand-soft)' : ''}`}
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      aria-label={product.name}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(product))}
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[hsl(var(--muted))]">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]">
            <ImageOff size={24} aria-hidden="true" />
          </div>
        )}
        {onToggleSelect && (
          <div
            className={`absolute right-1.5 top-1.5 rounded-md bg-[hsl(var(--card))] p-1 shadow-sm transition-opacity focus-within:opacity-100 ${selected ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelect()} aria-label={`Seleccionar ${product.name}`} />
          </div>
        )}
        {isVariable && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-[hsl(var(--card))] px-1.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--foreground))] shadow-sm">
            <Layers size={11} aria-hidden="true" /> Con variantes
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {product.category_name ?? 'Sin categoría'}
        </span>
        <h3 className="truncate text-sm font-semibold text-[hsl(var(--foreground))]" title={product.name}>{product.name}</h3>
        {product.sku && <span className="truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">SKU {product.sku}</span>}
        <span className="text-base font-bold tabular-nums text-[hsl(var(--foreground))]">
          {formatCurrency(product.price, product.currency)}
          <span className="ml-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">{product.currency}</span>
        </span>
        <div className="mt-auto flex flex-col gap-1.5 border-t border-[hsl(var(--border))] pt-2 text-xs">
          <StockSummary product={product} />
          <ChannelPills product={product} />
        </div>
      </div>
    </Card>
  )
}
