import { useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  SearchInput,
  SegmentedControl,
  Skeleton,
} from "@runly/ui";
import {
  BellRing,
  CalendarClock,
  CheckSquare2,
  ChevronDown,
  Globe2,
  Mail,
  MessageCircle,
  Monitor,
  Package,
  ShieldAlert,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { moduleOf } from "./notificationCatalog";

const CHANNELS = [
  { key: "inAppEnabled", label: "Plataforma", short: "App", icon: Monitor },
  { key: "emailEnabled", label: "Correo", short: "Correo", icon: Mail },
  { key: "pushEnabled", label: "Push web", short: "Push", icon: Smartphone },
];

const MODULE_ICONS = {
  calendar: CalendarClock,
  growth: TrendingUp,
  ledger: Wallet,
  pfm: Wallet,
  projects: CheckSquare2,
  inventory: Package,
  chat: MessageCircle,
  notes: Users,
  files: Users,
  website: Globe2,
  system: ShieldAlert,
};

// Events declared by an installed module carry its real name; the rest fall back to the prefix.
const moduleOfRow = (row) =>
  row.moduleName
    ? { id: row.moduleKey ?? row.moduleName, label: row.moduleName }
    : moduleOf(row.eventType);

const isOn = (pref, channels = CHANNELS) => channels.some((c) => pref[c.key]);

// Flat brand-tinted fill when on, quiet text when off (no ring, glow or pill).
function ChannelChip({ channel, checked, busy, onChange, rowLabel }) {
  const Icon = channel.icon;
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={`${channel.label}: ${rowLabel}`}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={[
        "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-60 sm:min-h-9 sm:flex-none",
        checked
          ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
          : "bg-[hsl(var(--muted))]/60 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{channel.short}</span>
    </button>
  );
}

function EventRow({ row, pref, pendingKey, onChange, showModule, channels }) {
  const Icon = row.icon ?? BellRing;
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{row.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            {row.description}
          </p>
          {showModule ? (
            <p className="mt-1 text-[11px] font-medium text-[hsl(var(--muted-foreground))]">
              {moduleOfRow(row).label}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-1.5 sm:shrink-0">
        {channels.map((channel) => (
          <ChannelChip
            key={channel.key}
            channel={channel}
            rowLabel={row.title}
            checked={Boolean(pref[channel.key])}
            busy={pendingKey === `${row.eventType}:${channel.key}`}
            onChange={(checked) => onChange([row.eventType], { [channel.key]: checked })}
          />
        ))}
      </div>
    </div>
  );
}

function BulkBar({ rows, getPreference, onChange, channels }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
      <span>Todo el grupo:</span>
      {channels.map((channel) => {
        const allOn = rows.every((r) => getPreference(r.eventType)[channel.key]);
        return (
          <button
            key={channel.key}
            type="button"
            onClick={() => onChange(rows.map((r) => r.eventType), { [channel.key]: !allOn })}
            className="min-h-9 rounded-md px-2 font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            {allOn ? "Silenciar" : "Activar"} {channel.short.toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}

function Group({ id, title, rows, channels, open, onToggle, getPreference, pendingKey, onChange, showModule }) {
  const Icon = MODULE_ICONS[id] ?? BellRing;
  const activeCount = rows.filter((r) => isOn(getPreference(r.eventType), channels)).length;
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--muted))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[hsl(var(--foreground))]">{title}</span>
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">
            {activeCount === 0 ? "Todo silenciado" : `${activeCount} de ${rows.length} con aviso activo`}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="divide-y divide-[hsl(var(--border))]/70 border-t border-[hsl(var(--border))]/70">
          <BulkBar rows={rows} channels={channels} getPreference={getPreference} onChange={onChange} />
          {rows.map((row) => (
            <EventRow
              key={row.eventType}
              row={row}
              pref={getPreference(row.eventType)}
              pendingKey={pendingKey}
              onChange={onChange}
              showModule={showModule}
              channels={channels}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export default function NotificationPreferencesPanel({
  rows,
  getPreference,
  pendingKey,
  onChange,
  isLoading,
  isError,
  onRetry,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState("module");
  const [closed, setClosed] = useState(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const pref = getPreference(row.eventType);
      if (status === "active" && !isOn(pref)) return false;
      if (status === "muted" && isOn(pref)) return false;
      if (!q) return true;
      return `${row.title} ${row.description} ${moduleOfRow(row).label}`.toLowerCase().includes(q);
    });
  }, [rows, query, status, getPreference]);

  const groups = useMemo(() => {
    if (view === "channel") {
      return CHANNELS.map((c) => ({ id: c.key, title: c.label, rows: filtered, channels: [c] }));
    }
    const map = new Map();
    for (const row of filtered) {
      const m = moduleOfRow(row);
      if (!map.has(m.id)) map.set(m.id, { id: m.id, title: m.label, rows: [], channels: CHANNELS });
      map.get(m.id).rows.push(row);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
  }, [filtered, view]);

  const toggle = (id) =>
    setClosed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totalActive = rows.filter((r) => isOn(getPreference(r.eventType))).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Qué te avisamos</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {totalActive} de {rows.length} eventos con algún canal activo
          </p>
        </div>
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar evento o módulo..."
          aria-label="Buscar notificaciones"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <SegmentedControl
            ariaLabel="Agrupar por"
            size="lg"
            variant="subtle"
            value={view}
            onChange={setView}
            options={[
              { value: "module", label: "Por módulo" },
              { value: "channel", label: "Por canal" },
            ]}
          />
          <SegmentedControl
            ariaLabel="Filtrar por estado"
            size="lg"
            variant="subtle"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Todas" },
              { value: "active", label: "Activas" },
              { value: "muted", label: "Silenciadas" },
            ]}
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="No se pudieron cargar las preferencias" onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Sin resultados"
          description="Ningún evento coincide con la búsqueda o el filtro."
        />
      ) : (
        groups.map((group) => (
          <Group
            key={`${view}:${group.id}`}
            id={group.id}
            title={group.title}
            rows={group.rows}
            channels={group.channels}
            open={!closed.has(`${view}:${group.id}`)}
            onToggle={() => toggle(`${view}:${group.id}`)}
            getPreference={getPreference}
            pendingKey={pendingKey}
            onChange={onChange}
            showModule={view === "channel"}
          />
        ))
      )}
    </div>
  );
}
