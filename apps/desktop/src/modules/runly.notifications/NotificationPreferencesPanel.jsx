import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  SearchInput,
  SegmentedControl,
  Skeleton,
  Switch,
} from "@runly/ui";
import { BellRing, ChevronDown, Mail, Monitor, Smartphone } from "lucide-react";
import { moduleOf } from "./notificationCatalog";

// Events declared by an installed module carry its real name; the rest fall back to the prefix.
const moduleOfRow = (row) =>
  row.moduleName ? { id: row.moduleKey ?? row.moduleName, label: row.moduleName } : moduleOf(row.eventType);

const CHANNELS = [
  { key: "inAppEnabled", label: "Plataforma", short: "App", icon: Monitor },
  { key: "emailEnabled", label: "Correo", short: "Correo", icon: Mail },
  { key: "pushEnabled", label: "Push web", short: "Push", icon: Smartphone },
];

const isOn = (pref, channels = CHANNELS) => channels.some((c) => pref[c.key]);

function ChannelToggle({ channel, checked, busy, onChange, rowLabel }) {
  const Icon = channel.icon;
  return (
    <label className="flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-[hsl(var(--border))] px-2 py-1.5 sm:min-h-0 sm:flex-none sm:flex-row sm:gap-2 sm:px-3">
      <span className="flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))] sm:text-xs">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sm:hidden">{channel.short}</span>
        <span className="hidden sm:inline">{channel.label}</span>
      </span>
      <Switch
        checked={checked}
        disabled={busy}
        aria-label={`${channel.label}: ${rowLabel}`}
        onCheckedChange={onChange}
      />
    </label>
  );
}

function EventRow({ row, pref, pendingKey, onChange, showModule, channels }) {
  const Icon = row.icon ?? BellRing;
  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
          <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{row.title}</p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{row.description}</p>
          {showModule ? (
            <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
              {moduleOfRow(row).label}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2 sm:shrink-0">
        {channels.map((channel) => (
          <ChannelToggle
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
    <div className="flex flex-wrap gap-2">
      {channels.map((channel) => {
        const allOn = rows.every((r) => getPreference(r.eventType)[channel.key]);
        return (
          <button
            key={channel.key}
            type="button"
            onClick={() => onChange(rows.map((r) => r.eventType), { [channel.key]: !allOn })}
            className="min-h-9 rounded-md border border-[hsl(var(--border))] px-3 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            {allOn ? "Silenciar" : "Activar"} {channel.short.toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}

function Group({ title, rows, channels, open, onToggle, getPreference, pendingKey, onChange, showModule }) {
  const activeCount = rows.filter((r) => isOn(getPreference(r.eventType), channels)).length;
  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between gap-3 bg-[hsl(var(--muted))]/40 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:px-4"
      >
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</span>
        <span className="flex items-center gap-2">
          <Badge variant={activeCount ? "default" : "outline"}>
            {activeCount}/{rows.length} activas
          </Badge>
          <ChevronDown
            className={`h-4 w-4 text-[hsl(var(--muted-foreground))] transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      {open ? (
        <div className="divide-y divide-[hsl(var(--border))]">
          <div className="px-3 py-2 sm:px-4">
            <BulkBar rows={rows} channels={channels} getPreference={getPreference} onChange={onChange} />
          </div>
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
    </section>
  );
}

function Skeletons() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
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
      return `${row.title} ${row.description} ${moduleOfRow(row).label}`
        .toLowerCase()
        .includes(q);
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
  }, [filtered, view, getPreference]);

  const toggle = (id) =>
    setClosed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totalActive = rows.filter((r) => isOn(getPreference(r.eventType))).length;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">
              Preferencias por evento
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {totalActive} de {rows.length} eventos con algún canal activo
            </p>
          </div>
        </div>

        <div className="space-y-2">
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
        </div>

        {isLoading ? (
          <Skeletons />
        ) : isError ? (
          <ErrorState title="No se pudieron cargar las preferencias" onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="Sin resultados"
            description="Ningún evento coincide con la búsqueda o el filtro."
          />
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
                <Group
                  key={`${view}:${group.id}`}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
