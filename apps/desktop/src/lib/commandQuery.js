// Prefix modes for the command palette (Ctrl+K). A leading character tells the
// palette what to look for, so "/inv" is the Inventario module and never a
// record called "inventarios". Pure: no JSX / Vite imports.

export const PALETTE_MODES = {
  actions: { prefix: ">", label: "Acciones", hint: "acciones y herramientas" },
  modules: { prefix: "/", label: "Módulos", hint: "módulos" },
  people: { prefix: "@", label: "Personas", hint: "contactos, usuarios y empleados" },
  records: { prefix: "#", label: "Registros", hint: "folios, números y registros" },
  help: { prefix: "?", label: "Ayuda", hint: "ayuda y guías" },
};

const MODE_BY_PREFIX = Object.fromEntries(
  Object.entries(PALETTE_MODES).map(([mode, meta]) => [meta.prefix, mode]),
);

const PEOPLE_SOURCES = new Set(["contacts", "users", "employees"]);

// "/inv" -> { mode: "modules", text: "inv" }; "inv" -> { mode: null, text: "inv" }.
export function parseQuery(raw) {
  const value = typeof raw === "string" ? raw.trimStart() : "";
  const mode = MODE_BY_PREFIX[value[0]] ?? null;
  if (!mode) return { mode: null, text: value };
  return { mode, text: value.slice(1).trim() };
}

// Modes answered entirely from the local module list (no server round-trip).
export function isLocalMode(mode) {
  return mode === "actions" || mode === "modules";
}

export function filterGroupsForMode(groups = [], mode = null) {
  if (!mode) return groups;
  if (mode === "people") return groups.filter((g) => PEOPLE_SOURCES.has(g?.source));
  if (mode === "help") return groups.filter((g) => g?.source === "help");
  if (mode === "records") {
    return groups.filter((g) => g?.source !== "help" && !PEOPLE_SOURCES.has(g?.source));
  }
  return [];
}

// "Control de Inventario" -> "ci": lets people reach a module by its initials.
export function initialsOf(name) {
  if (typeof name !== "string") return "";
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  return words.length > 1 ? words.map((w) => w[0]).join("") : "";
}

// ---- recents ----------------------------------------------------------------

export const RECENTS_KEY = "runly.commandPalette.recents";
export const RECENTS_LIMIT = 6;

// Items worth remembering: anything that navigates somewhere concrete.
export function toRecent(item) {
  if (!item?.target || item.blocked) return null;
  if (item.kind === "widen" || item.kind === "suggestion" || item.kind === "see-all") return null;
  return {
    target: item.target,
    title: item.title,
    subtitle: item.subtitle ?? null,
    icon: item.icon ?? null,
    color: item.color ?? null,
  };
}

export function pushRecent(list, entry, limit = RECENTS_LIMIT) {
  if (!entry) return list;
  return [entry, ...list.filter((r) => r.target !== entry.target)].slice(0, limit);
}

export function loadRecents(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((r) => r && typeof r.target === "string" && typeof r.title === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveRecents(list, storage = globalThis.localStorage) {
  try {
    storage?.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // Storage can be unavailable (private mode); recents are a convenience only.
  }
}
