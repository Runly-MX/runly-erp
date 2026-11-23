// Phone layout for the Growth tables (DataTable `mobileCards`): one stacked card per row.
export function GrowthCard({ title, subtitle, badge, rows = [], actions }) {
  return (
    <div className="min-w-0 space-y-3 rounded-2xl surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{title}</p>
          {subtitle ? <p className="break-all text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {rows.length ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
              <dd className="break-words">{value ?? "-"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-3">{actions}</div> : null}
    </div>
  );
}
