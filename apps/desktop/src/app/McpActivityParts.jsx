import { useMemo, useState } from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger, Button, EmptyState } from '@runly/ui';
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Clock, History, PencilLine, Search, ShieldCheck, XCircle } from 'lucide-react';
import { DOMAINS, Notice, ScopeBadges, groupScopes } from './McpConnectionParts.jsx';

const TOOL_LABELS = { runly_whoami: 'Consultó su identidad', runly_companies_list: 'Listó las empresas autorizadas', runly_modules_list: 'Listó los módulos disponibles', runly_module_schema: 'Consultó las operaciones de un módulo' };
const MODE_VERB = { query: 'Consultó', prepare: 'Preparó un cambio en', commit: 'Ejecutó un cambio aprobado en' };

export function relativeTime(iso) {
  if (!iso) return 'sin actividad reciente';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  const [size, name] = seconds >= 86400 ? [86400, 'día'] : seconds >= 3600 ? [3600, 'hora'] : [60, 'minuto'];
  const n = Math.floor(seconds / size);
  return `hace ${n} ${name}${n === 1 ? '' : 's'}`;
}

const moduleName = key => DOMAINS[key.slice(6)] ?? key;

function describe(entry) {
  if (entry.type === 'approval') return `${entry.status === 'approved' ? 'Aprobó' : 'Rechazó'} una propuesta${entry.moduleKey ? ` en ${moduleName(entry.moduleKey)}` : ''}`;
  if (TOOL_LABELS[entry.tool]) return TOOL_LABELS[entry.tool];
  if (entry.moduleKey) return `${MODE_VERB[entry.mode] ?? 'Usó'} ${moduleName(entry.moduleKey)}`;
  return (entry.tool ?? 'Acción').replace(/^runly_/, '').replaceAll('_', ' ');
}

function outcome(entry) {
  if (entry.status === 'ok' || entry.status === 'approved') return { label: entry.status === 'ok' ? 'Correcto' : 'Aprobado', Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' };
  if (entry.status === 'rejected') return { label: 'Rechazado', Icon: XCircle, cls: 'text-amber-600 dark:text-amber-400' };
  return { label: 'Error', Icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400', hint: entry.status };
}

const isChange = entry => entry.type === 'approval' || entry.mode === 'prepare' || entry.mode === 'commit';
const FILTERS = [['all', 'Todo'], ['read', 'Consultas'], ['write', 'Cambios'], ['error', 'Errores']];
const matches = (entry, filter) => filter === 'all' || filter === 'read' && !isChange(entry) || filter === 'write' && isChange(entry)
  || filter === 'error' && !['ok', 'approved', 'rejected'].includes(entry.status);

export function ActivityList({ items, companies, empty }) {
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const names = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
  if (!items.length) return <EmptyState title={empty.title} description={empty.description} />;
  const needle = query.trim().toLowerCase();
  const visible = items.filter(entry => matches(entry, filter) && `${describe(entry)} ${entry.clientName ?? ''} ${names.get(entry.companyId) ?? ''}`.toLowerCase().includes(needle));
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar actividad">{FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`min-h-9 rounded-md border px-3 text-sm transition-colors ${filter === key ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)] font-medium' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'}`}>{label}</button>)}</div>
      <label className="relative block sm:w-64"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar actividad" aria-label="Buscar actividad" className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-transparent pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.4)]" /></label>
    </div>
    {visible.length === 0 ? <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Ninguna actividad coincide con el filtro.</p> :
      <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">{visible.map(entry => { const { label, Icon, cls, hint } = outcome(entry); return <li key={entry.id} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]" aria-hidden="true">{entry.type === 'approval' ? <ShieldCheck size={16} /> : isChange(entry) ? <PencilLine size={16} /> : <History size={16} />}</span>
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{describe(entry)}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))]">{entry.clientName && <span>{entry.clientName}</span>}{names.get(entry.companyId) && <span className="inline-flex items-center gap-1"><Building2 size={12} aria-hidden="true" />{names.get(entry.companyId)}</span>}<time dateTime={entry.at} title={new Date(entry.at).toLocaleString('es-MX')} className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />{relativeTime(entry.at)}</time></p></div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 text-sm ${cls}`} title={hint}><Icon size={16} aria-hidden="true" />{label}</span>
      </li>; })}</ul>}
  </div>;
}

const heading = 'text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]';
const DAY_MS = 86400000;
const formatDate = iso => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

/** Sliding expiry: each token refresh extends the connection up to its maximum lifetime. */
export function connectionExpiry(grant, now = Date.now()) {
  if (!grant.expiresAt) return null;
  const daysLeft = Math.max(0, Math.ceil((new Date(grant.expiresAt).getTime() - now) / DAY_MS));
  const atMaximum = Boolean(grant.maxExpiresAt) && new Date(grant.maxExpiresAt).getTime() - new Date(grant.expiresAt).getTime() < DAY_MS;
  return { daysLeft, atMaximum, soon: daysLeft <= 7, label: daysLeft === 0 ? 'Vence hoy' : `Vence en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` };
}

function ExpiryNotice({ grant, expiry }) {
  const text = expiry.atMaximum
    ? `Esta conexión alcanzó su vigencia máxima y vence el ${formatDate(grant.expiresAt)}. Después tendrás que volver a conectarla desde la aplicación.`
    : `Se renueva sola mientras la aplicación la use. Sin actividad vence el ${formatDate(grant.expiresAt)}; su vigencia máxima termina el ${formatDate(grant.maxExpiresAt)}.`;
  return <Notice icon={CalendarClock} tone={expiry.soon ? 'warning' : 'info'}>{text}</Notice>;
}

export function ConnectionItem({ grant, companies, onRevoke }) {
  const groups = groupScopes(grant.scopes), granted = companies.filter(c => grant.companyIds?.includes(c.id)), expiry = connectionExpiry(grant);
  return <AccordionItem value={grant.id} className="bg-[hsl(var(--card))]">
    <AccordionTrigger className="px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"><span className="break-words text-sm font-semibold">{grant.clientName}</span>
        <span className="flex flex-wrap items-center gap-x-3 text-xs font-normal text-[hsl(var(--muted-foreground))]"><span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />{grant.lastActivityAt ? `Última actividad ${relativeTime(grant.lastActivityAt)}` : 'Sin actividad reciente'}</span><span>{groups.length} módulos · {granted.length} {granted.length === 1 ? 'empresa' : 'empresas'}</span>
          {expiry?.soon && <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400"><CalendarClock size={12} aria-hidden="true" />{expiry.label}</span>}</span></span>
    </AccordionTrigger>
    <AccordionContent className="space-y-4 border-t border-[hsl(var(--border))] p-4">
      {expiry && <ExpiryNotice grant={grant} expiry={expiry} />}
      <div className="space-y-2"><h4 className={heading}>Empresas autorizadas</h4><div className="flex flex-wrap gap-1.5">{granted.map(c => <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--muted))] px-2 py-1 text-xs"><Building2 size={12} aria-hidden="true" />{c.name}</span>)}</div></div>
      <div className="space-y-2"><h4 className={heading}>Permisos</h4><ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{groups.map(g => <li key={g.domain} className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm"><span className="min-w-0 truncate">{g.label}</span><ScopeBadges read={g.read} write={g.write} /></li>)}</ul></div>
      <div className="flex justify-end"><Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => onRevoke(grant)}>Revocar</Button></div>
    </AccordionContent>
  </AccordionItem>;
}
