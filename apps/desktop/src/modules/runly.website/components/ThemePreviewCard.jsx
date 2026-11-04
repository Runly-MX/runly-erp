import { Eye } from 'lucide-react'

const FALLBACK = { primary: '#6366f1', secondary: '#64748b', accent: '#f59e0b', background: '#ffffff', surface: '#f8fafc', text: '#111827', muted: '#6b7280', border: '#e2e8f0' }

// Live mock-up of the public site painted with the unsaved draft, so edits are visible at once.
export function ThemePreviewCard({ tokens = {}, typography = {}, isDirty }) {
  const t = { ...FALLBACK, ...tokens }
  const heading = { fontFamily: typography.headingFont, fontWeight: typography.headingWeight }
  const body = { fontFamily: typography.bodyFont }
  const swatches = ['primary', 'secondary', 'accent', 'background', 'surface', 'text']

  return (
    <section aria-label="Vista previa del tema" className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />Vista previa</h3>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{isDirty ? 'Cambios sin guardar' : 'Al día'}</span>
      </div>
      <div className="p-4">
        <div className="overflow-hidden rounded-xl border shadow-sm" style={{ background: t.background, color: t.text, borderColor: t.border, ...body }} aria-hidden>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: t.border }}>
            <span className="text-sm" style={{ ...heading, color: t.primary }}>Tu marca</span>
            <span className="flex gap-3 text-xs" style={{ color: t.muted }}><span>Inicio</span><span>Servicios</span><span>Contacto</span></span>
          </div>
          <div className="space-y-3 px-4 py-6">
            <p className="text-2xl leading-tight" style={heading}>Un título que llama la atención</p>
            <p className="text-sm" style={{ color: t.muted }}>Así se verán los textos de tu sitio con los colores y fuentes elegidos.</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: t.primary, color: t.background }}>Botón principal</span>
              <span className="rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: t.secondary, color: t.secondary }}>Secundario</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            {['Producto', 'Servicio'].map((label, i) => (
              <div key={label} className="rounded-lg border p-3" style={{ background: t.surface, borderColor: t.border }}>
                <span className="mb-2 block h-1.5 w-8 rounded-full" style={{ background: i ? t.accent : t.primary }} />
                <p className="text-xs" style={heading}>{label}</p>
                <p className="text-[11px]" style={{ color: t.muted }}>Descripción breve</p>
              </div>
            ))}
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Paleta">
          {swatches.map((key) => (
            <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] py-0.5 pl-0.5 pr-2 text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
              <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: t[key] }} aria-hidden />{t[key]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
