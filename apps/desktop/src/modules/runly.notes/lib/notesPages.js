// Pure helpers for the paginated notes grid (useInfiniteQuery pages).

// Concatenate the `notes` of every page, dropping repeats by id (a note can
// shift between pages when the list changes while paging).
export function flattenPages(pages) {
  const seen = new Set()
  const out = []
  for (const page of pages ?? []) {
    for (const note of page?.notes ?? []) {
      if (seen.has(note.id)) continue
      seen.add(note.id)
      out.push(note)
    }
  }
  return out
}

// A full page means there may be another one.
export function hasMore(lastPage, pageSize) {
  return (lastPage?.notes?.length ?? 0) === pageSize
}
