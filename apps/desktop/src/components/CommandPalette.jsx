import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, WifiOff, Loader2, Info } from "lucide-react";
import { ModuleNavIcon, EmptyState, ErrorState } from "@runly/ui";
import { useCommandStore } from "../stores/command";
import { useRuntimeModules } from "../app/useRuntimeModules";
import { useOfflineStore, OFFLINE_MODULES } from "@runly/offline";
import { useAuth } from "../auth/AuthProvider";
import { runly } from "../lib/runly";
import { ModuleIcon } from "./ModuleCard";
import { buildCommandItems } from "../lib/commandPalette";
import {
  SEARCH_MIN_LENGTH,
  buildSearchExtras,
  fallbackNotice,
  isReallyEmpty,
  orderGroups,
  resolveSearchScope,
} from "../lib/commandSearch";
import {
  PALETTE_MODES,
  filterGroupsForMode,
  isLocalMode,
  loadRecents,
  parseQuery,
  pushRecent,
  saveRecents,
  toRecent,
} from "../lib/commandQuery";
import { useCommandSearch } from "../lib/useCommandSearch";
import { useQuickNoteStore } from "../modules/runly.notes/quick/quickNoteStore";

export function CommandPalette({ activeModule }) {
  const { isOpen, closeCommand, openCommand } = useCommandStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const { availableModules } = useRuntimeModules();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const { session } = useAuth();
  const token = session?.access_token;

  const [widened, setWidened] = useState(false);
  const scope = resolveSearchScope(activeModule, widened);
  const { mode, text } = useMemo(() => parseQuery(query), [query]);
  const modeMeta = mode ? PALETTE_MODES[mode] : null;
  const trimmedQuery = text.trim();
  const searchActive =
    isOpen && isOnline && !isLocalMode(mode) && trimmedQuery.length >= SEARCH_MIN_LENGTH;
  const { response, loading, error, retry } = useCommandSearch({
    enabled: searchActive,
    query: text,
    moduleKey: scope.moduleKey,
    token,
  });
  const [recents, setRecents] = useState(() => loadRecents());

  const { sections, flat } = useMemo(() => {
    const base = buildCommandItems({
      availableModules,
      activeModule,
      query: text,
      isOnline,
      offlineModuleKeys: OFFLINE_MODULES,
      searchGroups: filterGroupsForMode(orderGroups(response?.groups ?? [], scope.moduleKey), mode),
      mode,
      recents,
    });
    const extras = buildSearchExtras({ scope, response, searching: searchActive });
    const all = [...extras.top, ...base.sections, ...extras.bottom];
    return { sections: all, flat: all.flatMap((sec) => sec.items) };
  }, [availableModules, activeModule, text, mode, recents, isOnline, response, scope.moduleKey, scope.canWiden, scope.label, searchActive]);

  const notice = fallbackNotice(response, scope.label);
  const showEmpty = searchActive && !loading && !error && flat.length === 0 && isReallyEmpty(response);

  const searching = searchActive && loading;

  function runItem(item) {
    if (!item || item.blocked) return;
    if (item.kind === "widen") {
      setWidened(true);
      return;
    }
    if (item.kind === "suggestion" && !item.target) {
      setQuery(item.text);
      return;
    }
    const recent = toRecent(item);
    if (recent) {
      const next = pushRecent(recents, recent);
      setRecents(next);
      saveRecents(next);
    }
    if (item.action === "quick-note") useQuickNoteStore.getState().open();
    else navigate(item.target);
    closeCommand();
    setQuery("");
  }

  useEffect(() => {
    setSelectedIndex(0);
  }, [flat.length]);

  useEffect(() => {
    function handleKey(e) {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        if (isOpen) closeCommand();
        else openCommand();
      }
      if (!isOpen) return;
      if (e.key === "Escape") {
        closeCommand();
        setQuery("");
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && flat[selectedIndex]) {
        runItem(flat[selectedIndex]);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, openCommand, closeCommand, flat, selectedIndex]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-cmd-idx="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setQuery("");
    setWidened(false);
    setSelectedIndex(0);
  }, [isOpen]);

  let runningIndex = -1;

  return (
    <AnimatePresence>
      {isOpen && (
        // The wrapper must not animate opacity: a fading ancestor becomes a
        // backdrop root and the blur only appears once the fade finishes.
        <div className="fixed inset-0 z-110 flex items-start justify-center">
          <motion.div
            className="absolute inset-0 overlay-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              closeCommand();
              setQuery("");
            }}
          />

          <motion.div
            className="relative glass-overlay rounded-2xl w-full max-w-xl mx-4 mt-[15dvh] flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border))] shrink-0">
              <Search
                size={15}
                className="text-[hsl(var(--muted-foreground))] shrink-0"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scope.moduleKey ? `Buscar en ${scope.label}...` : "Buscar módulos, acciones, páginas..."}
                className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] outline-none"
              />
              <button
                onClick={() => {
                  closeCommand();
                  setQuery("");
                }}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {modeMeta && (
              <div className="shrink-0 px-4 py-1.5 border-b border-[hsl(var(--border))] flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                <span className="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 font-medium text-[hsl(var(--foreground))]">
                  {modeMeta.label}
                </span>
                Buscando solo {modeMeta.hint}. Borra «{modeMeta.prefix}» para volver a todo.
              </div>
            )}

            {!modeMeta && (scope.moduleKey || widened) && (
              <div className="shrink-0 px-4 py-1.5 border-b border-[hsl(var(--border))] flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                <span className="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 font-medium text-[hsl(var(--foreground))]">
                  {widened ? "Todos los módulos" : scope.label}
                </span>
                {widened && (
                  <button
                    type="button"
                    onClick={() => setWidened(false)}
                    className="cursor-pointer underline-offset-2 hover:underline"
                  >
                    Volver a {scope.label}
                  </button>
                )}
              </div>
            )}

            {notice && (
              <div className="shrink-0 px-4 py-2 border-b border-[hsl(var(--border))] flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {searching && (
              <div className="shrink-0 px-4 py-1.5 border-b border-[hsl(var(--border))] flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                <Loader2 size={12} className="animate-spin" />
                Buscando...
              </div>
            )}

            <div ref={listRef} className="overflow-y-auto max-h-[50dvh] p-2">
              {error && (
                <ErrorState
                  className="py-6 mb-2"
                  title="No se pudo buscar"
                  description="Revisa tu conexión e inténtalo de nuevo."
                  showReport={false}
                  onRetry={retry}
                />
              )}
              {flat.length === 0 && !error ? (
                searching ? (
                  <div className="space-y-2 p-3" aria-busy="true">
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="h-9 rounded-lg bg-[hsl(var(--muted))] animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    variant="compact"
                    icon={Search}
                    title={showEmpty ? "Sin resultados" : "Escribe para buscar"}
                    description={showEmpty ? `No encontramos nada para "${trimmedQuery}".` : undefined}
                  />
                )
              ) : (
                sections.map((section) => (
                  <div key={section.id} className="mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] px-3 py-1.5">
                      {section.title}
                      {section.count != null ? ` · ${section.count}` : ""}
                    </p>
                    {section.items.map((item) => {
                      runningIndex += 1;
                      const idx = runningIndex;
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={item.key}
                          data-cmd-idx={idx}
                          onClick={() => runItem(item)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors duration-100 text-left ${
                            item.blocked
                              ? "opacity-40 cursor-not-allowed"
                              : `cursor-pointer ${
                                  isSelected
                                    ? "overlay-item-active"
                                    : "hover:bg-[hsl(var(--foreground)/0.05)]"
                                }`
                          }`}
                        >
                          {item.kind === "module" && !item.blocked ? (
                            <ModuleIcon module={item.module} size="sm" />
                          ) : (
                            <div
                              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: item.color
                                  ? `${item.color}20`
                                  : "hsl(var(--muted))",
                              }}
                            >
                              {item.blocked ? (
                                <WifiOff
                                  size={14}
                                  className="text-[hsl(var(--muted-foreground))]"
                                />
                              ) : (
                                <ModuleNavIcon
                                  name={item.icon}
                                  size={14}
                                  style={{
                                    color:
                                      item.color ||
                                      "hsl(var(--muted-foreground))",
                                  }}
                                />
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                                {item.subtitle}
                              </p>
                            )}
                            {item.matchedIn && (
                              <p className="text-[11px] italic text-[hsl(var(--muted-foreground))] truncate">
                                Coincide en: {item.matchedIn}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="shrink-0 px-4 py-2 border-t border-[hsl(var(--border))] flex items-center gap-4 text-[10px] text-[hsl(var(--muted-foreground))]">
              <span>
                <kbd className="font-mono mr-1">Up/Down</kbd>navegar
              </span>
              <span>
                <kbd className="font-mono mr-1">Enter</kbd>seleccionar
              </span>
              <span>
                <kbd className="font-mono mr-1">Esc</kbd>cerrar
              </span>
              <span className="ml-auto truncate">
                {Object.values(PALETTE_MODES).map((m) => (
                  <span key={m.prefix} className="ml-2">
                    <kbd className="font-mono mr-0.5">{m.prefix}</kbd>
                    {m.label.toLowerCase()}
                  </span>
                ))}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
