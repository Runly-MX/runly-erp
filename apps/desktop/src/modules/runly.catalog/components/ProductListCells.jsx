// apps/desktop/src/modules/runly.catalog/components/ProductListCells.jsx
import { ChannelPills, StockSummary } from './ProductStatusPills.jsx'

// Cell components of the products list (RunlyTable column.component).
function ProductStockCell({ row }) {
  return <StockSummary product={row} />
}

function ProductChannelsCell({ row }) {
  return <ChannelPills product={row} />
}

const CELLS = { ProductStockCell, ProductChannelsCell }

export const productCellRegistry = { resolve: (name) => CELLS[name] ?? null }
