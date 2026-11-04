import { ArrowRight, FileText } from 'lucide-react'

// Built-in template card: a miniature of the site drawn from the template's own theme colors,
// name and page list, so each card reads as a real preview instead of a placeholder.
export function TemplatesCard({ template, onPreview }) {
  const c = template.themeTokens?.color ?? {}
  const primary = c.primary ?? template.color
  const bg = c.bg ?? '#ffffff'
  const fg = c.fg ?? '#0f172a'
  const muted = c.muted ?? '#64748b'
  const accent = c.accent ?? primary
  const font = template.themeTokens?.font?.sans
  const pageCount = template.pages.length
  const navPages = template.pages.slice(1, 4)

  return (
    <button
      type="button"
      onClick={onPreview}
      aria-label={`Previsualizar plantilla ${template.label}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--ring))]/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:transform-none"
    >
      <div className="relative bg-[hsl(var(--muted))]/50 p-3 pb-0">
        <div className="overflow-hidden rounded-t-lg border border-b-0 border-black/10 shadow-sm" style={{ background: bg, color: fg, fontFamily: font }} aria-hidden>
          <div className="flex items-center gap-1 border-b border-black/5 bg-black/[0.03] px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate text-[10px] font-bold" style={{ color: primary }}>{template.label}</span>
            <span className="flex min-w-0 gap-2 overflow-hidden text-[8px]" style={{ color: muted }}>
              {navPages.map((page) => <span key={page.id} className="truncate">{page.label}</span>)}
            </span>
          </div>
          <div className="space-y-1.5 px-3 pb-3 pt-2" style={{ background: `linear-gradient(135deg, ${primary}14, ${accent}1f)` }}>
            <p className="line-clamp-2 text-[11px] font-semibold leading-tight">{template.description}</p>
            <span className="h-1 w-3/4 rounded-full" style={{ background: muted, opacity: 0.35, display: 'block' }} />
            <span className="inline-block rounded px-2 py-0.5 text-[8px] font-semibold" style={{ background: primary, color: c.primaryFg ?? '#fff' }}>Ver más</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
            {[0, 1, 2].map((i) => <span key={i} className="h-6 rounded" style={{ background: i === 1 ? `${accent}33` : `${primary}1a` }} />)}
          </div>
        </div>
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--card))]/95 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[hsl(var(--foreground))] shadow-sm ring-1 ring-[hsl(var(--border))]">
          <FileText className="h-3 w-3" aria-hidden />{pageCount} {pageCount === 1 ? 'página' : 'páginas'}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-[hsl(var(--border))] p-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-[hsl(var(--card))]" style={{ background: primary }} aria-hidden />
          <h3 className="truncate font-semibold">{template.label}</h3>
        </div>
        <p className="line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">{template.description}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-[hsl(var(--ring))]">
          Previsualizar<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </button>
  )
}
