// Pure result-building for the command palette (Ctrl+K).
//
// Kept free of JSX and of any Vite-only imports (e.g. `import.meta.glob`) so it
// can be unit-tested with `node --test`. The React component in
// components/CommandPalette.jsx turns each descriptor's `target` into a
// navigation + close.

import { CATEGORY_LABELS } from "./sortModules.js";
import { initialsOf } from "./commandQuery.js";

export const STATIC_PAGES = [
  {
    key: "home",
    label: "Inicio",
    path: "/app/home",
    icon: "Home",
    description: "Pantalla de inicio",
  },
  {
    key: "profile",
    label: "Mi perfil",
    path: "/app/profile",
    icon: "User",
    description: "Perfil de usuario",
  },
];

// ---- text scoring -----------------------------------------------------------

export function normalizeText(value) {
  if (typeof value !== "string") return "";
  // Strip the Unicode combining diacritical marks block (U+0300–U+036F) that
  // NFD decomposition produces, so "empresá" matches "empresa".
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 0 = no match. Higher is better: exact > prefix > word-boundary > substring.
export function scoreMatch(query, text) {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 100;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(t)) return 60;
  if (t.includes(q)) return 30;
  return 0;
}

// Best weighted score across an item's searchable fields.
export function scoreItem(query, { title, subtitle, keywords = [] } = {}) {
  const q = normalizeText(query);
  if (!q) return 0;
  let best = scoreMatch(q, title) * 3;
  for (const kw of keywords) {
    best = Math.max(best, scoreMatch(q, kw) * 1.5);
  }
  best = Math.max(best, scoreMatch(q, subtitle) * 1);
  if (best > 0) return best;
  // Several words ("ocultar chat"): every word must hit some field, in any order.
  const words = q.split(" ").filter(Boolean);
  if (words.length < 2) return 0;
  const fields = [title, subtitle, ...keywords];
  return words.every((word) => fields.some((field) => scoreMatch(word, field) > 0)) ? 20 : 0;
}

// ---- descriptors ----------------------------------------------------------

function moduleLaunchTarget(module) {
  const firstNav = module?.navigation?.[0];
  if (firstNav && firstNav.path && firstNav.path !== "/") {
    return `/app/m/${module.key}${firstNav.path}`;
  }
  return `/app/m/${module.key}`;
}

function navTarget(moduleKey, path) {
  return path === "/" ? `/app/m/${moduleKey}` : `/app/m/${moduleKey}${path}`;
}

function categoryLabel(category) {
  if (!category) return "";
  return CATEGORY_LABELS[category] ?? category;
}

function makeBlocked(isOnline, offlineModuleKeys) {
  const allowed = new Set(offlineModuleKeys ?? []);
  return (moduleKey) => (isOnline ? false : !allowed.has(moduleKey));
}

function moduleItem(module, isBlocked) {
  return {
    key: `module:${module.key}`,
    kind: "module",
    title: module.name,
    subtitle:
      module.summary || module.description || categoryLabel(module.category),
    keywords: [
      module.key,
      module.key.split(".").pop(),
      initialsOf(module.name),
      categoryLabel(module.category),
    ].filter(Boolean),
    icon: module.icon,
    color: module.color,
    module,
    target: moduleLaunchTarget(module),
    blocked: isBlocked(module.key),
  };
}

function actionItem(module, nav, { showModule, blocked }) {
  return {
    key: `action:${module.key}:${nav.path}`,
    kind: "action",
    title: nav.label,
    subtitle: showModule ? module.name : null,
    keywords: [module.name],
    icon: nav.icon || module.icon,
    color: module.color,
    target: navTarget(module.key, nav.path),
    blocked,
  };
}

// Flattens a nav entry (and its children) into navigable action descriptors.
function expandNav(module, nav, opts) {
  const out = [];
  if (nav?.path) out.push(actionItem(module, nav, opts));
  for (const child of nav?.children ?? []) {
    if (child?.path) out.push(actionItem(module, { ...child }, opts));
  }
  return out;
}

// Maps the `/search` response groups into palette sections. Server-side results
// are already filtered by the query, so these are never re-scored locally.
export function mapSearchGroups(groups = [], moduleColors = {}) {
  return (groups ?? [])
    .filter((g) => g && Array.isArray(g.items) && g.items.length > 0)
    .map((g) => {
      // Some sources (help) return several hits sharing one id (a module key),
      // so repeated ids get a positional suffix to keep React keys unique.
      const seen = new Map();
      const uniqueKey = (id) => {
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        return count ? `record:${g.source}:${id}:${count}` : `record:${g.source}:${id}`;
      };
      const items = g.items.map((it) => ({
        key: uniqueKey(it.id),
        kind: "record",
        title: it.title,
        subtitle: it.subtitle || null,
        keywords: [],
        icon: it.icon,
        color: moduleColors[g.moduleKey] ?? null,
        source: g.source,
        target: it.target,
        blocked: false,
        ...(it.badge ? { badge: String(it.badge).slice(0, 60), badgeLabel: it.badgeLabel ? String(it.badgeLabel) : null } : {}),
        ...(it.matchedIn ? { matchedIn: String(it.matchedIn) } : {}),
      }));
      const total = Number.isFinite(g.total) ? g.total : items.length;
      if (g.seeAllTarget && total > items.length) {
        items.push({
          key: `see-all:${g.source}`,
          kind: "see-all",
          title: `Ver todos los resultados en ${g.label}`,
          subtitle: `${total} resultados`,
          keywords: [],
          icon: "ArrowRight",
          color: moduleColors[g.moduleKey] ?? null,
          source: g.source,
          target: g.seeAllTarget,
          blocked: false,
        });
      }
      return { id: `search:${g.source}`, title: g.label, count: total, items };
    });
}

function pageItem(page) {
  return {
    key: `page:${page.key}`,
    kind: "page",
    title: page.label,
    subtitle: page.description,
    keywords: [],
    icon: page.icon,
    color: undefined,
    target: page.path,
    blocked: false,
  };
}

// ---- builder ------------------------------------------------------------------

export function buildCommandItems({
  availableModules = [],
  activeModule = null,
  query = "",
  isOnline = true,
  offlineModuleKeys = [],
  searchGroups = [],
  mode = null,
  recents = [],
  commands = [],
} = {}) {
  const isBlocked = makeBlocked(isOnline, offlineModuleKeys);
  const q = normalizeText(query);

  const rawSections = [];

  if (activeModule && (activeModule.navigation?.length ?? 0) > 0) {
    rawSections.push({
      id: "active",
      title: `Acciones — ${activeModule.name}`,
      items: activeModule.navigation.flatMap((nav) =>
        expandNav(activeModule, nav, {
          showModule: false,
          blocked: isBlocked(activeModule.key),
        }),
      ),
    });
  }

  rawSections.push({
    id: "modules",
    title: "Módulos",
    items: availableModules.map((m) => moduleItem(m, isBlocked)),
  });

  const toolItems = availableModules
    .filter((m) => m.key !== activeModule?.key)
    .flatMap((m) =>
      (m.navigation ?? []).flatMap((nav) =>
        expandNav(m, nav, { showModule: true, blocked: isBlocked(m.key) }),
      ),
    );
  rawSections.push({ id: "tools", title: "Herramientas", items: toolItems });

  if (availableModules.some((m) => m.key === "runly.notes")) {
    rawSections.push({
      id: "actions",
      title: "Acciones rápidas",
      items: [
        {
          key: "action:quick-note",
          kind: "action",
          action: "quick-note",
          title: "Nota rápida",
          subtitle: "Abre el bloc flotante de notas (Ctrl+Alt+N)",
          keywords: ["nota", "notas", "apunte", "rapida", "bloc"],
          icon: "NotebookPen",
          color: undefined,
          target: null,
          blocked: false,
        },
      ],
    });
  }

  if (commands.length > 0) rawSections.push({ id: "commands", title: "Comandos", items: commands });

  rawSections.push({
    id: "pages",
    title: "Páginas",
    items: STATIC_PAGES.map(pageItem),
  });

  const MODE_SECTIONS = {
    actions: ["active", "tools", "actions", "commands"],
    modules: ["modules"],
    people: [],
    records: [],
    help: [],
  };
  const allowedIds = mode ? MODE_SECTIONS[mode] ?? [] : null;

  const localSections = rawSections
    .filter((section) => !allowedIds || allowedIds.includes(section.id))
    .map((section) => {
      if (!q) return section;
      const scored = section.items
        .map((item) => ({ item, score: scoreItem(q, item) }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.item.title.localeCompare(b.item.title, "es", {
              sensitivity: "base",
            }),
        );
      return { ...section, items: scored.map((entry) => entry.item) };
    })
    .filter((section) => section.items.length > 0);

  // Records the user explicitly searched for sit just under the active module's
  // own actions and above the generic module list. Help articles are reference
  // material, so they go last, after modules/tools/pages.
  const allSearchSections = mapSearchGroups(searchGroups, Object.fromEntries(availableModules.map((m) => [m.key, m.color])));
  const helpSections = allSearchSections.filter((s) => s.id === "search:help");
  const searchSections = allSearchSections.filter((s) => s.id !== "search:help");
  const hasActive = localSections[0]?.id === "active";
  let sections = hasActive
    ? [localSections[0], ...searchSections, ...localSections.slice(1), ...helpSections]
    : [...searchSections, ...localSections, ...helpSections];

  // A query that is a clear name/alias hit on a module ("inv" -> Inventario)
  // means the person wants the module itself, so it outranks matching records.
  if (q && !mode) {
    const modulesSection = localSections.find((s) => s.id === "modules");
    const top = modulesSection?.items[0];
    if (top && scoreItem(q, top) >= 300) {
      sections = [modulesSection, ...sections.filter((s) => s !== modulesSection)];
    }
  }

  if (!q && !mode && recents.length > 0) {
    sections = [
      {
        id: "recent",
        title: "Recientes",
        items: recents.map((r) => ({
          key: `recent:${r.target}`,
          kind: "recent",
          title: r.title,
          subtitle: r.subtitle ?? null,
          keywords: [],
          icon: r.icon,
          color: r.color ?? undefined,
          target: r.target,
          blocked: false,
        })),
      },
      ...sections,
    ];
  }

  const flat = sections.flatMap((section) => section.items);

  return { sections, flat };
}
