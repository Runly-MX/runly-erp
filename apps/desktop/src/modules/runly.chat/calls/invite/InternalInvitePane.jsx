import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PersonAvatar, SearchInput, cn } from "@runly/ui";
import { Check, PhoneCall, Users } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../../lib/runly";

const RING_UI_MS = 36_000;
// Without a search the pane shows a few quick suggestions, not the whole
// company; typing searches everyone.
const SUGGESTIONS = 6;
const SEARCH_LIMIT = 30;

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// "Personas de la empresa": search anyone in the company, pick several and
// ring them. People outside the conversation are added to it by the API
// before ringing, so they can join and see the call's chat.
export function InternalInvitePane({ callId, token, inCallIds, memberIds, selfId }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [ringing, setRinging] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const term = useDebounced(search.trim(), 250);

  const { data, isLoading } = useQuery({
    queryKey: ["call-invite-candidates", term],
    // +2: room for self and one extra row, so "hay más" can be detected.
    queryFn: () => runly.identity.listCandidates(token, { action: "chat", search: term || undefined, pageSize: (term ? SEARCH_LIMIT : SUGGESTIONS) + 2 }),
    enabled: Boolean(token),
    staleTime: 60_000,
  });

  const { people, hasMore } = useMemo(() => {
    const rows = (data?.data ?? []).filter((u) => u.id !== selfId && !u.isBot);
    // People already in the call last; then members before the rest.
    const rank = (u) => (inCallIds.has(u.id) ? 2 : memberIds.has(u.id) ? 0 : 1);
    rows.sort((a, b) => rank(a) - rank(b) || String(a.displayName).localeCompare(String(b.displayName), "es"));
    const limit = term ? SEARCH_LIMIT : SUGGESTIONS;
    return { people: rows.slice(0, limit), hasMore: rows.length > limit };
  }, [data, selfId, inCallIds, memberIds, term]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function ringSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setSending(true);
    try {
      await runly.calls.ring(callId, ids, token);
      setRinging((prev) => new Set([...prev, ...ids]));
      setTimeout(() => setRinging((prev) => new Set([...prev].filter((id) => !ids.includes(id)))), RING_UI_MS);
      setSelected(new Set());
      toast.success(ids.length === 1 ? "Llamando…" : `Llamando a ${ids.length} personas…`);
    } catch (e) {
      toast.error(e?.message || "No se pudo llamar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pb-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o correo"
          aria-label="Buscar personas de la empresa"
        />
      </div>
      <div className="min-h-48 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {!isLoading && people.length > 0 && (
          <p className="px-3 pb-1.5 pt-1 text-left text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            {term ? "Resultados" : "Sugerencias"}
          </p>
        )}
        {isLoading ? (
          <p className="px-3 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Cargando personas…</p>
        ) : !people.length ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
            <Users className="h-6 w-6" aria-hidden />
            {term ? `Nadie coincide con «${term}».` : "No hay más personas en la empresa."}
          </div>
        ) : (
          <ul className="space-y-1">
            {people.map((u, index) => {
              const inCall = inCallIds.has(u.id);
              const isRinging = ringing.has(u.id);
              const isSelected = selected.has(u.id);
              const disabled = inCall || isRinging;
              return (
                <li key={u.id} className="call-fade-up" style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(u.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      isSelected ? "bg-(--brand-primary)/15 ring-1 ring-(--brand-primary)/50" : "hover:bg-white/5",
                      disabled && "cursor-default opacity-70 hover:bg-transparent",
                    )}
                  >
                    <PersonAvatar name={u.displayName} src={u.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.displayName || u.email}</span>
                      <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{u.email}</span>
                    </span>
                    {inCall ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">En la llamada</span>
                    ) : isRinging ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-(--brand-primary)/15 px-2.5 py-1 text-xs font-medium text-(--brand-primary)">
                        <PhoneCall className="h-3.5 w-3.5 animate-pulse" aria-hidden /> Sonando
                      </span>
                    ) : (
                      <>
                        {!memberIds.has(u.id) && (
                          <span className="hidden shrink-0 text-xs text-[hsl(var(--muted-foreground))] sm:inline">Se agregará al chat</span>
                        )}
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isSelected ? "border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)" : "border-white/25",
                          )}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!isLoading && hasMore && (
          <p className="px-3 pt-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
            {term ? "Hay más coincidencias: escribe un nombre más completo." : "Escribe un nombre o correo para buscar a más personas."}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-6 py-4">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {selected.size ? `${selected.size} seleccionada${selected.size === 1 ? "" : "s"}` : "Elige a quién llamar. Les sonará en la app."}
        </p>
        <button
          type="button"
          onClick={ringSelected}
          disabled={!selected.size || sending}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-(--brand-primary) px-5 text-sm font-semibold text-(--brand-primary-foreground) transition-colors hover:bg-(--brand-primary-hover) disabled:opacity-40"
        >
          <PhoneCall className="h-4 w-4" aria-hidden />
          {sending ? "Llamando…" : selected.size > 1 ? `Llamar a ${selected.size}` : "Llamar"}
        </button>
      </div>
    </div>
  );
}
