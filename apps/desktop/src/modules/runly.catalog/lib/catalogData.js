// apps/desktop/src/modules/runly.catalog/lib/catalogData.js
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'

export function useCatalogAccess() {
  const { session, userProfile } = useAuth()
  const permissions = userProfile?.permissions ?? []
  const has = (key) => Boolean(userProfile?.isAdmin || permissions.includes(key))
  return {
    token: session?.access_token,
    canCreate: has('catalog.products.create'),
    canUpdate: has('catalog.products.update'),
    canDelete: has('catalog.products.delete'),
    canAdjustStock: has('catalog.inventory.adjust') || has('catalog.products.update'),
  }
}

// Enabled outlets. GET /pos/outlets needs a POS operation permission; a
// catalog-only user gets `forbidden` and the screens explain it instead of
// guessing an outlet.
export function useCatalogOutlets(token) {
  const query = useQuery({
    queryKey: ['catalog-outlets', token],
    queryFn: () => runly.pos.listOutlets(token),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: (count, error) => ![401, 403].includes(error?.status) && count < 2,
  })
  return {
    outlets: query.data?.data ?? [],
    isPending: query.isPending,
    forbidden: [401, 403].includes(query.error?.status),
    isError: query.isError,
    refetch: query.refetch,
  }
}

// POS currency and default tax, when the user can read them; only used as
// defaults and explanations, never to compute prices.
export function usePosDefaults(token) {
  const query = useQuery({
    queryKey: ['catalog-pos-defaults', token],
    queryFn: () => runly.pos.getSettings(token),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const settings = query.data?.data ?? null
  return {
    currency: settings?.currency ?? null,
    taxRate: settings?.defaultTaxRate ?? null,
    pricesIncludeTax: settings?.pricesIncludeTax ?? null,
  }
}

export function useCatalogCategories(token) {
  const query = useQuery({
    queryKey: ['catalog-categories-flat', token],
    queryFn: () => runly.catalog.listCategories(token, { flat: 'true' }),
    enabled: Boolean(token),
    staleTime: 60_000,
  })
  return query.data?.data ?? []
}

export const CURRENCY_OPTIONS = [
  { value: 'MXN', label: 'MXN, peso mexicano' },
  { value: 'USD', label: 'USD, dólar estadounidense' },
  { value: 'EUR', label: 'EUR, euro' },
  { value: 'COP', label: 'COP, peso colombiano' },
  { value: 'ARS', label: 'ARS, peso argentino' },
  { value: 'PEN', label: 'PEN, sol peruano' },
  { value: 'CLP', label: 'CLP, peso chileno' },
  { value: 'BRL', label: 'BRL, real brasileño' },
  { value: 'GTQ', label: 'GTQ, quetzal guatemalteco' },
]
