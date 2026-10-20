import { useMemo } from 'react'
import { areaFilterOptions, areaWriteOptions } from '../lib/area-tree.js'
import { useInventoryCan } from './useInventoryAdmin.js'
import { useInventoryAreas, useInventoryAreasSettings } from './useInventoryAreas.js'

// What the item form, the bulk move and the list filter need to know about areas.
export function useAreaChoices() {
  const can = useInventoryCan()
  const areasQuery = useInventoryAreas()
  const settings = useInventoryAreasSettings()
  const areas = useMemo(() => areasQuery.data ?? [], [areasQuery.data])
  const enabled = Boolean(settings.data?.enabled)
  const seesAll = can('inventory.scope.all')
  // A limited user (scoping on, no scope.all) must always put items inside an area.
  const requireArea = enabled && !seesAll
  return {
    areas,
    enabled,
    requireArea,
    isLoading: areasQuery.isLoading || settings.isLoading,
    filterOptions: useMemo(() => areaFilterOptions(areas), [areas]),
    writeOptions: useMemo(() => areaWriteOptions(areas, { requireArea }), [areas, requireArea]),
    // Limited user who belongs to no area at all.
    noAccess: requireArea && !areasQuery.isLoading && !areasQuery.isError && areas.length === 0,
  }
}
