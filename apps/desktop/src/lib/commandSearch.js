// Pure logic for the module-scoped global search in the command palette.
// No JSX / Vite imports so it can run under `node --test`.

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_LIMIT = 5;

// Scope = the module the user is currently inside, unless they widened it.
export function resolveSearchScope(activeModule, widened = false) {
  const key = activeModule?.key ?? null;
  if (!key) return { moduleKey: null, label: null, canWiden: false, widened: false };
  if (widened) return { moduleKey: null, label: activeModule?.name ?? null, canWiden: false, widened: true };
  return { moduleKey: key, label: activeModule?.name ?? key, canWiden: true, widened: false };
}

export function buildSearchParams({ q, moduleKey = null, limit = SEARCH_LIMIT }) {
  return { q, module: moduleKey || undefined, limit };
}

// Mirrors what the SDK sends; used by tests and as a stable query key.
export function buildSearchUrl(params) {
  const sp = new URLSearchParams();
  const p = buildSearchParams(params);
  sp.set("q", p.q);
  if (p.module) sp.set("module", p.module);
  sp.set("limit", String(p.limit));
  return `/search?${sp.toString()}`;
}

// Accepts the old ({ query, groups }) and new response shapes; missing = absent.
export function normalizeSearchResponse(data) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : []).filter(
    (s) => s && typeof s.text === "string" && s.text.trim(),
  );
  return {
    query: data?.query ?? "",
    scope: data?.scope ?? null,
    scopeLabel: data?.scopeLabel ?? null,
    fallback: data?.fallback === true,
    groups,
    suggestions,
  };
}

export function fallbackNotice(response, scopeLabel) {
  if (!response?.fallback) return null;
  const label = response.scopeLabel || scopeLabel;
  return label
    ? `No encontramos resultados en ${label}. Mostrando otros módulos.`
    : "No encontramos resultados. Mostrando otros módulos.";
}

// Puts the scoped module's groups first, keeping server order otherwise.
export function orderGroups(groups, moduleKey) {
  if (!moduleKey) return groups;
  const mine = groups.filter((g) => g?.moduleKey === moduleKey);
  const rest = groups.filter((g) => g?.moduleKey !== moduleKey);
  return [...mine, ...rest];
}

// True when the server answered and found nothing anywhere.
export function isReallyEmpty(response) {
  if (!response) return false;
  return !response.groups.some((g) => Array.isArray(g?.items) && g.items.length > 0);
}

// Extra keyboard-navigable sections: the "widen scope" row (top) and the
// "Quizá buscabas" suggestions (bottom).
export function buildSearchExtras({ scope, response, searching }) {
  const top = [];
  const bottom = [];
  if (scope?.canWiden && searching) {
    top.push({
      id: "search-scope",
      title: "Alcance",
      items: [
        {
          key: "widen-scope",
          kind: "widen",
          title: "Buscar en todos los módulos",
          subtitle: `Ahora solo se busca en ${scope.label}`,
          keywords: [],
          icon: "Globe",
          color: null,
          target: null,
          blocked: false,
        },
      ],
    });
  }
  if (response?.suggestions?.length) {
    bottom.push({
      id: "search-suggestions",
      title: "Quizá buscabas",
      items: response.suggestions.map((s, i) => ({
        key: `suggestion:${i}:${s.text}`,
        kind: "suggestion",
        title: s.text,
        subtitle: s.label || null,
        keywords: [],
        icon: "Search",
        color: null,
        text: s.text,
        target: s.target || null,
        blocked: false,
      })),
    });
  }
  return { top, bottom };
}

// ---- stale-response protection -------------------------------------------------
// Every request gets an increasing id; only the latest id may write results.

export const initialSearchState = {
  latestId: 0,
  status: "idle", // idle | loading | success | error
  data: null,
  forKey: null,
};

export function searchReducer(state, action) {
  switch (action.type) {
    case "start":
      return { ...state, latestId: action.id, status: "loading", forKey: action.key };
    case "success":
      if (action.id !== state.latestId) return state;
      return { ...state, status: "success", data: action.data };
    case "error":
      if (action.id !== state.latestId) return state;
      return { ...state, status: "error" };
    case "reset":
      return { ...initialSearchState, latestId: state.latestId + 1 };
    default:
      return state;
  }
}
