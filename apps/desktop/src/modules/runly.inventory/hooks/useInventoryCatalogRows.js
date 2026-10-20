import { useInventoryBrands, useInventoryCategories } from './useInventoryCatalogs.js'

const rowsOf = (data) => (data?.data ?? data ?? []).filter((row) => row.enabled !== false)

export function useBrandRows() {
  return rowsOf(useInventoryBrands().data)
}

export function useTypeRows() {
  return rowsOf(useInventoryCategories().data)
}
