// Detail value for fields of type "document-link": a related record of another
// module shown as a monospace number linking to it, a small status chip and the
// counterpart (e.g. supplier) as muted subtitle. Value shape:
// { number, href|path, status?, statusLabel?, sublabel|supplierName? } or null.
export function DocumentLinkValue({ value, emptyLabel = "Sin documento", hrefPrefix = "/app/m/runly.purchases" }) {
  if (!value || typeof value !== "object" || !value.number) {
    return <span className="font-normal text-[hsl(var(--muted-foreground))]">{emptyLabel}</span>;
  }
  const href = value.href ?? (value.path ? `${hrefPrefix}${value.path}` : null);
  const sublabel = value.sublabel ?? value.supplierName ?? null;
  const label = value.statusLabel ?? null;
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {href ? (
          <a href={href} className="font-mono text-[13px] font-semibold text-(--brand-primary) hover:underline">{value.number}</a>
        ) : (
          <span className="font-mono text-[13px] font-semibold">{value.number}</span>
        )}
        {label ? (
          <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
        ) : null}
      </div>
      {sublabel ? <p className="truncate text-xs font-normal text-[hsl(var(--muted-foreground))]">{sublabel}</p> : null}
    </div>
  );
}
