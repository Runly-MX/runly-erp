import { useState, useEffect, useRef } from "react";
import { LayoutTemplate, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

function applyVars(body, vars = {}) {
  return body.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

export function ChatTemplatePopover({ onSelect, vars = {} }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { session } = useAuth();
  const token = session?.access_token;
  const containerRef = useRef(null);

  const { data } = useQuery({
    queryKey: ["chat-templates"],
    queryFn: () => runly.chat.listTemplates(token),
    enabled: open && Boolean(token),
    staleTime: 60_000,
  });

  const templates = data?.data ?? [];
  const filtered = search
    ? templates.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.body.toLowerCase().includes(search.toLowerCase()),
      )
    : templates;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleSelect(template) {
    onSelect(applyVars(template.body, vars));
    runly.chat.recordTemplateUse(template.id, token).catch(() => {});
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "h-8 w-8 shrink-0 flex items-center justify-center rounded-full transition-colors touch-manipulation",
          open
            ? "text-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]",
        ].join(" ")}
        title="Plantillas de respuesta"
      >
        <LayoutTemplate className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-80 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))]">
            <Search className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar plantilla..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                <X className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-center py-6 px-3">
                {templates.length === 0 ? "No hay plantillas creadas aun." : "Sin resultados."}
              </p>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelect(t)}
                className="w-full text-left px-3 py-2.5 hover:bg-[hsl(var(--muted))] transition-colors border-b border-[hsl(var(--border))] last:border-0"
              >
                <p className="text-xs font-medium">{t.title}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">{t.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
