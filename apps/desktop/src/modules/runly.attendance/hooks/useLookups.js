import { useMemo } from 'react'
import { useCatalog } from './useAttendanceData.js'

// id -> name maps plus the raw rows for every catalog used by pickers and labels.
export function useLookups() {
  const sites = useCatalog('sites'), groups = useCatalog('groups'), categories = useCatalog('categories'), shifts = useCatalog('shifts')
  return useMemo(() => {
    const map = (q) => new Map((q.data ?? []).map((r) => [r.id, r.name]))
    return {
      sites: map(sites), groups: map(groups), categories: map(categories), shifts: map(shifts),
      rows: { sites: sites.data ?? [], groups: groups.data ?? [], categories: categories.data ?? [], shifts: shifts.data ?? [] },
    }
  }, [sites, groups, categories, shifts])
}
