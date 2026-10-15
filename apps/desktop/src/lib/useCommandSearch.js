import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { runly } from "./runly";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_LIMIT,
  SEARCH_MIN_LENGTH,
  initialSearchState,
  normalizeSearchResponse,
  searchReducer,
} from "./commandSearch";

// Debounced, abortable global search. Late responses never overwrite newer ones.
export function useCommandSearch({ enabled, query, moduleKey, token }) {
  const [state, dispatch] = useReducer(searchReducer, initialSearchState);
  const [nonce, setNonce] = useState(0);
  const idRef = useRef(0);
  const trimmed = query.trim();
  const active = enabled && Boolean(token) && trimmed.length >= SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!active) {
      dispatch({ type: "reset" });
      return undefined;
    }
    const controller = new AbortController();
    const id = ++idRef.current;
    const timer = setTimeout(async () => {
      dispatch({ type: "start", id, key: `${moduleKey ?? ""}|${trimmed}` });
      try {
        const data = await runly.search.global(
          trimmed,
          { limit: SEARCH_LIMIT, module: moduleKey || undefined, signal: controller.signal },
          token,
        );
        dispatch({ type: "success", id, data: normalizeSearchResponse(data) });
      } catch (err) {
        if (err?.name === "AbortError") return;
        dispatch({ type: "error", id });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed, moduleKey, token, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  // Between typing and the debounce firing, the old data is stale for this query.
  const pending = active && state.forKey !== `${moduleKey ?? ""}|${trimmed}`;
  return {
    response: active ? state.data : null,
    loading: active && (state.status === "loading" || pending),
    error: active && state.status === "error" && !pending,
    retry,
  };
}
