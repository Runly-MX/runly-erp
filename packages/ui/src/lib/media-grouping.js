// Groups gallery items by day (newest first) or by a record, keeping a flat option.
export const dayKey = (value) => String(value ?? "").slice(0, 10);
function dayLabel(key) {
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// `sortDir` orders the day groups; items keep the order they arrive in (the API sorts them).
export function groupMedia(items, grouping, sortDir = "desc") {
  if (grouping === "none") return [{ id: "all", label: null, items }];
  const map = new Map();
  for (const item of items) {
    const id = grouping === "date" ? dayKey(item.date) : item.groupId ?? "none";
    const label = grouping === "date" ? dayLabel(id) : item.groupLabel ?? "Sin asignar";
    if (!map.has(id)) map.set(id, { id, label, items: [] });
    map.get(id).items.push(item);
  }
  const groups = [...map.values()];
  if (grouping === "date") groups.sort((a, b) => ((a.id < b.id) === (sortDir === "asc") ? -1 : 1));
  else groups.sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));
  return groups;
}
