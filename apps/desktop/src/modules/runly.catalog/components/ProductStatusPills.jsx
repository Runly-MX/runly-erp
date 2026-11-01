// apps/desktop/src/modules/runly.catalog/components/ProductStatusPills.jsx
import { StatusPill } from '@runly/ui'
import { CircleCheck, CircleSlash, FileClock, Globe, Layers, Package, PackageX, Store, TriangleAlert } from 'lucide-react'
import { getStockStatus } from '../lib/stockStatus.js'

// POS and web are separate channels: `pos_enabled` is the general POS
// baseline (outlet exceptions live in the Venta tab) and `published` only
// controls the web catalog.
export function ChannelPills({ product, size = 'sm' }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {product.pos_enabled === false ? (
        <StatusPill size={size} tone="neutral" icon={CircleSlash} title="No se vende en POS (configuración general)">Fuera de POS</StatusPill>
      ) : (
        <StatusPill size={size} tone="brand" icon={Store} title="Habilitado en POS (configuración general)">POS</StatusPill>
      )}
      {product.published ? (
        <StatusPill size={size} tone="success" icon={Globe} title="Visible en el catálogo web">Web</StatusPill>
      ) : (
        <StatusPill size={size} tone="neutral" icon={FileClock} title="No visible en el catálogo web">Borrador web</StatusPill>
      )}
    </span>
  )
}

// Aggregate across every location (outlets plus «Sin asignar»). Variable
// products keep stock per variant, so the parent shows no number.
export function StockSummary({ product, size = 'sm' }) {
  if (product.product_type === 'VARIABLE') {
    return <StatusPill size={size} tone="neutral" icon={Layers}>Por variante</StatusPill>
  }
  if (!product.track_stock) {
    return <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin control</span>
  }
  const stock = Number(product.stock ?? 0)
  const status = getStockStatus({ trackStock: true, stock })
  const pill = status === 'out'
    ? <StatusPill size={size} tone="danger" icon={PackageX}>Agotado</StatusPill>
    : status === 'low'
      ? <StatusPill size={size} tone="warning" icon={TriangleAlert}>Bajo</StatusPill>
      : <StatusPill size={size} tone="success" icon={CircleCheck}>Disponible</StatusPill>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-[hsl(var(--foreground))]">
        <Package className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        {stock}
      </span>
      {pill}
    </span>
  )
}
