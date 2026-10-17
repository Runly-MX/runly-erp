import { Eye, PencilLine, ShieldCheck, ArrowRight, Check, Link2 } from 'lucide-react';
import { Checkbox } from '@runly/ui';
import { ThemeToggle } from '../components/ThemeToggle';
import { useThemeStore } from '../stores/theme';

const DOMAINS = { hr: 'Recursos Humanos', fleet: 'Flota', notes: 'Notas', pfm: 'Finanzas personales', ledger: 'Libro de cuentas', projects: 'Proyectos', calendar: 'Calendario', contacts: 'Contactos', purchases: 'Compras', canvas: 'Canvas', attendance: 'Asistencia', files: 'Archivos', documents: 'Documentos', identity: 'Identidad', activity: 'Actividad propia', chat: 'Conversaciones propias', inventory: 'Inventario' };

const SCOPE_LABELS = { 'runly:read': 'Ver tu identidad, empresas y módulos autorizados', 'inventory:read': 'Consultar equipos y catálogos de inventario', 'inventory:write': 'Preparar y ejecutar altas y ediciones con tu aprobación en Runly' };
for (const [domain, label] of Object.entries(DOMAINS)) {
  SCOPE_LABELS[`${domain}:read`] ??= `Consultar ${label} con tus permisos actuales`;
  SCOPE_LABELS[`${domain}:write`] ??= `Preparar cambios en ${label}; requieren tu aprobación en Runly`;
}

export const scopeLabel = scope => SCOPE_LABELS[scope] ?? scope;

/** Full-height scroll container: the page owns its scroll, independent of the app shell. */
export function McpPage({ children }) {
  const isDark = useThemeStore(s => s.isDark);
  const logo = isDark ? '/runly/runly-logo-dark.png' : '/runly/runly-logo-light.png';
  return <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-[hsl(var(--muted)/0.4)] text-[hsl(var(--foreground))]">
    <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/0.9)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
        <img src={logo} alt="Runly" className="h-7 w-auto" />
        <ThemeToggle />
      </div>
    </header>
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">{children}</main>
  </div>;
}

export function Panel({ children, className = '' }) {
  return <section className={`overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm ${className}`}>{children}</section>;
}

export function PanelHeader({ icon: Icon, title, subtitle, tone = 'primary' }) {
  const toneClass = tone === 'warning' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]';
  return <div className="flex items-start gap-3 border-b border-[hsl(var(--border))] p-4 sm:p-5">
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}><Icon size={20} aria-hidden="true" /></span>
    <div className="min-w-0">
      <h2 className="text-base font-semibold leading-snug break-words sm:text-lg">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p>}
    </div>
  </div>;
}

export function SectionLabel({ children }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{children}</h3>;
}

export function ScopeList({ scopes }) {
  const write = scopes.filter(s => s.endsWith(':write'));
  const read = scopes.filter(s => !s.endsWith(':write'));
  const group = (items, Icon, title, hint) => items.length > 0 && <div className="space-y-2">
    <div className="flex items-center gap-2"><Icon size={14} className="text-[hsl(var(--muted-foreground))]" aria-hidden="true" /><SectionLabel>{title}</SectionLabel></div>
    <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
    <ul className="space-y-1.5">{items.map(scope => <li key={scope} className="flex items-start gap-2 text-sm leading-relaxed"><Check size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /><span>{scopeLabel(scope)}</span></li>)}</ul>
  </div>;
  return <div className="space-y-4">
    {group(read, Eye, 'Lectura', 'Solo consulta, nunca modifica datos.')}
    {group(write, PencilLine, 'Cambios con tu aprobación', 'Cada cambio se te mostrará para aprobarlo antes de ejecutarse.')}
  </div>;
}

function initials(name) {
  return (name ?? 'E').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function CompanyOption({ company, checked, onChange }) {
  return <label className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${checked ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'}`}>
    <Checkbox checked={checked} onCheckedChange={onChange} aria-label={company.name} />
    {company.logoUrl ? <img src={company.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md bg-white object-contain" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ backgroundColor: company.primaryColor ?? 'hsl(var(--muted-foreground))' }} aria-hidden="true">{initials(company.name)}</span>}
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{company.name}</span>
  </label>;
}

/** Fixed action bar at the bottom of a panel so the decision is always reachable. */
export function ActionBar({ children }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-4 sm:flex-row sm:justify-end sm:p-5 [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:w-auto">{children}</div>;
}

export function Notice({ icon: Icon = ShieldCheck, tone = 'info', children }) {
  const cls = tone === 'warning' ? 'border-amber-500/40 bg-amber-500/10' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.6)]';
  return <div className={`flex items-start gap-3 rounded-md border p-3 text-sm leading-relaxed ${cls}`}><Icon size={18} className="mt-0.5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /><p>{children}</p></div>;
}

export function Destination({ uri }) {
  let host = uri;
  try { host = new URL(uri).host; } catch { /* keep raw value */ }
  return <div className="flex items-center gap-2 rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
    <Link2 size={14} className="shrink-0" aria-hidden="true" /><span className="shrink-0">Destino</span><span className="min-w-0 break-all font-medium text-[hsl(var(--foreground))]" title={uri}>{host}</span>
  </div>;
}

export function FieldChanges({ fields }) {
  return <dl className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
    {fields.map((field, index) => <div key={index} className="grid gap-1 p-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{field.label}</dt>
      <dd className="min-w-0 break-words text-sm">
        {field.before !== undefined && <span className="mr-1 inline-flex flex-wrap items-center gap-1.5"><span className="text-[hsl(var(--muted-foreground))] line-through">Antes: {String(field.before)}</span><ArrowRight size={14} aria-hidden="true" /></span>}
        <span className="font-medium">Nuevo: {String(field.value)}</span>
      </dd>
    </div>)}
  </dl>;
}

export function SensitiveCheck({ checked, onChange }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed">
    <Checkbox className="mt-0.5" checked={checked} onCheckedChange={onChange} />
    <span>Confirmo los importes, relaciones, vínculos de identidad, destinatarios y avisos indicados en esta propuesta.</span>
  </label>;
}


