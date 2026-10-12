// Pure helpers that resolve a person's catalog names. They exist because TanStack Table caches
// accessor values per row: if group/category/shift names are looked up inside `accessorFn` and the
// catalogs finish loading after the people, the cached '—' is never recomputed. Baking the names
// into the row objects (new objects whenever lookups change) avoids that.

export const shiftHours = (shift) => (shift?.startTime && shift?.endTime ? `${shift.startTime}–${shift.endTime}` : '')

export function enrichPerson(person, lookups) {
  const rows = lookups?.rows ?? {}
  const find = (list, id) => (id ? (list ?? []).find((r) => r.id === id) : null)
  const shift = find(rows.shifts, person.shiftId)
  return {
    ...person,
    statusKey: person.enabled === false ? 'inactive' : 'active',
    hrLinked: person.hr ? 'yes' : 'no',
    groupName: find(rows.groups, person.groupId)?.name ?? '',
    categoryName: find(rows.categories, person.categoryId)?.name ?? '',
    shiftName: shift?.name ?? '',
    shiftHours: shiftHours(shift),
  }
}

export const enrichPeople = (people, lookups) => (people ?? []).map((p) => enrichPerson(p, lookups))
