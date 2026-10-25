// A titled group inside the block inspector. Sections are separated by a rule so
// each part of a block (what it does, its data, its options) reads as its own thing.
export function InspectorSection({ title, description, children, className = "" }) {
  return (
    <section className={`space-y-3 border-t border-[hsl(var(--border))] pt-4 first:border-t-0 first:pt-0 ${className}`}>
      {(title || description) && (
        <header className="space-y-0.5">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {description && <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
