import { useBrandRows, useTypeRows } from './useInventoryCatalogRows.js'
import { useCreateInventoryBrand, useCreateInventoryCategory } from './useInventoryCatalogs.js'
import { useInventoryModels, useSaveInventoryModel } from './useInventoryModels.js'
import { asRows, assertInventoryAdapter, createInventoryDataContext } from '../lib/inventory-data-context.js'

// Default adapter: the company user's own data (SDK + Bearer). Behaves exactly as before the seam existed.
export const mainInventoryData = assertInventoryAdapter({
  useModelRows: () => asRows(useInventoryModels().data),
  useSaveModel: useSaveInventoryModel,
  useTypeRows,
  useBrandRows,
  useCreateType: useCreateInventoryCategory,
  useCreateBrand: useCreateInventoryBrand,
  useCanCreate: () => true,
})

const ctx = createInventoryDataContext(mainInventoryData)
export const InventoryDataProvider = ctx.Provider
export const useInventoryData = ctx.useData
