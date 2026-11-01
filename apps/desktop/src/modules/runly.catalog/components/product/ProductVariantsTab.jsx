// apps/desktop/src/modules/runly.catalog/components/product/ProductVariantsTab.jsx
import { useQuery } from '@tanstack/react-query'
import { runly } from '../../../../lib/runly.js'
import { useCatalogOutlets } from '../../lib/catalogData.js'
import VariantGrid from './VariantGrid.jsx'
import VariantOptionsCard from './VariantOptionsCard.jsx'

export default function ProductVariantsTab({ product, token, access, productId }) {
  const { outlets } = useCatalogOutlets(token)
  const availability = useQuery({
    queryKey: ['catalog-pos-availability', productId, token],
    queryFn: () => runly.catalogCommerce.availability(productId, {}, token),
    enabled: Boolean(token),
    staleTime: 15_000,
  })

  // Exact-code lookup across the catalog through C1 scan. Scan needs an
  // outlet for its response, but matching does not depend on it; without
  // POS access the cross-catalog warning is simply skipped.
  const lookupOutlet = outlets[0]?.id
  const checkCatalogCode = lookupOutlet ? async (code) => {
    try {
      const res = await runly.commerce.scan({ outletId: lookupOutlet, code }, token)
      return (res?.data?.matches ?? [])
        .filter((m) => m.productId !== productId && m.unavailableReason !== 'DISABLED')
        .map((m) => (m.variantLabel ? `«${m.name}» (${m.variantLabel})` : `«${m.name}»`))
    } catch {
      return []
    }
  } : null

  return (
    <div className="space-y-5">
      <VariantOptionsCard productId={productId} token={token} options={product.options ?? []} variants={product.variants ?? []} canUpdate={access.canUpdate} />
      <VariantGrid
        product={product}
        productId={productId}
        token={token}
        canUpdate={access.canUpdate}
        disabledVariantIds={availability.data?.data?.disabledVariantIds ?? []}
        checkCatalogCode={checkCatalogCode}
      />
    </div>
  )
}
