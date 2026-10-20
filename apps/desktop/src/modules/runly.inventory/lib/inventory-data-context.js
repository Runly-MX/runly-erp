// Dependency-injection seam for the inventory form pieces (model selector, type/brand pickers, model
// dialog, import dialog). The same components run against the main SDK (default) or the supplier
// portal client by wrapping them in a provider; they never import a data source directly.
// Kept free of app imports so it can be unit tested in plain node.
import { createContext, createElement, useContext } from 'react'

export function createInventoryDataContext(defaultValue) {
  const Context = createContext(defaultValue)
  const Provider = ({ value, children }) => createElement(Context.Provider, { value }, children)
  return { Context, Provider, useData: () => useContext(Context) }
}

// Query results from the main API come as an array or `{ data: [] }`; the picker code wants rows.
export const asRows = (data) => {
  const rows = Array.isArray(data) ? data : (data?.data ?? [])
  return Array.isArray(rows) ? rows : []
}

// Create endpoints answer `row`, `{ data: row }`; callers only need the row.
export const createdRow = (response) => response?.data ?? response ?? null

// Contract of an inventory data adapter (all `use*` members are React hooks called unconditionally):
//   useModelRows()        -> rows [{ id, name, code, typeId, brandId, year, description, typeName, brandName }]
//   useSaveModel()        -> mutation; mutateAsync(payload) resolves to the saved model row
//   useTypeRows()         -> rows [{ id, name, parentId? }]
//   useBrandRows()        -> rows [{ id, name }]
//   useCreateType()       -> mutation; mutateAsync({ name }) resolves to the row
//   useCreateBrand()      -> mutation; mutateAsync({ name }) resolves to the row
//   useCanCreate(areaId)  -> boolean; whether "+ Crear" options (models, types, brands) are offered
export const ADAPTER_HOOKS = ['useModelRows', 'useSaveModel', 'useTypeRows', 'useBrandRows', 'useCreateType', 'useCreateBrand', 'useCanCreate']

export function assertInventoryAdapter(adapter) {
  const missing = ADAPTER_HOOKS.filter((key) => typeof adapter?.[key] !== 'function')
  if (missing.length) throw new Error(`Inventory data adapter is missing: ${missing.join(', ')}`)
  return adapter
}
