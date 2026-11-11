import { defineBlock } from '@raulbellosom/atlas-web-builder'

const STYLE = '.runly-foot a{transition:color 160ms ease,opacity 160ms ease}.runly-foot a:hover,.runly-foot a:focus-visible{opacity:1;text-decoration:underline;text-underline-offset:4px}.runly-foot a:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:2px}'
const safeHref = (value) => (/^(https?:|mailto:|tel:|\/|#)/i.test(value) ? value : '#')

// Columns are separated by "---"; the first line of a column is its title (a trailing "| ..." is ignored, older
// templates wrote "Title | Title"), the rest are "Label | /path".
export function parseColumns(raw) {
  if (typeof raw !== 'string') return []
  return raw.split('---').map((chunk) => chunk.split('\n').map((line) => line.trim()).filter(Boolean)).filter((lines) => lines.length).map(([title, ...rest]) => ({
    title: title.split('|')[0].trim(),
    links: rest.map((line) => {
      const cut = line.lastIndexOf('|')
      return cut === -1 ? { label: line, href: '#' } : { label: line.slice(0, cut).trim(), href: safeHref(line.slice(cut + 1).trim()) }
    }),
  }))
}

// bg, text, muted text, hairline
const TONES = {
  ink: ['var(--runly-color-fg, #111827)', 'var(--runly-color-bg, #ffffff)', 'color-mix(in srgb, var(--runly-color-bg, #ffffff) 74%, transparent)', 'color-mix(in srgb, var(--runly-color-bg, #ffffff) 16%, transparent)'],
  primary: ['var(--runly-color-primary, #2563eb)', 'var(--runly-color-primaryFg, #ffffff)', 'color-mix(in srgb, var(--runly-color-primaryFg, #ffffff) 82%, transparent)', 'color-mix(in srgb, var(--runly-color-primaryFg, #ffffff) 22%, transparent)'],
  light: ['var(--runly-color-bg, #ffffff)', 'var(--runly-color-fg, #111827)', 'var(--runly-color-muted, #52606d)', 'color-mix(in srgb, var(--runly-color-fg, #111827) 14%, transparent)'],
}

export const SiteFooterBlock = defineBlock({
  type: 'SiteFooterBlock',
  label: 'Pie de página con colores del tema',
  category: 'navigation',
  defaultProps: { tone: 'ink', brand: 'Mi sitio', tagline: '', columns: 'Explorar\nInicio | /\nContacto | /contacto', copyright: '', showBrand: true, backToTop: true },
  fields: {
    tone: { type: 'select', label: 'Fondo', options: [{ value: 'ink', label: 'Tinta del tema' }, { value: 'primary', label: 'Color principal' }, { value: 'light', label: 'Claro' }] },
    brand: { type: 'text', label: 'Nombre' },
    tagline: { type: 'text', label: 'Lema' },
    columns: { type: 'textarea', label: 'Columnas (título en la primera línea; Etiqueta | /ruta; separadas por ---)' },
    copyright: { type: 'text', label: 'Derechos' },
    showBrand: { type: 'toggle', label: 'Mostrar nombre y lema' },
    backToTop: { type: 'toggle', label: 'Enlace "Volver arriba"' },
  },
  groups: [{ label: 'Contenido', fields: ['brand', 'tagline', 'columns', 'copyright'] }, { label: 'Estilo', fields: ['tone', 'showBrand', 'backToTop'] }],
  render({ tone, brand, tagline, columns, copyright, showBrand, backToTop }) {
    const [bg, fg, muted, line] = TONES[tone] ?? TONES.ink
    const cols = parseColumns(columns)
    return (
      <footer className="runly-foot" style={{ position: 'relative', background: bg, color: fg, fontFamily: 'var(--runly-font-sans)' }}>
        <style>{STYLE}</style>
        <div aria-hidden="true" style={{ height: '4px', background: 'linear-gradient(90deg, var(--runly-color-accent, #f97316), var(--runly-color-primary, #2563eb))' }} />
        <div style={{ maxWidth: '1200px', marginInline: 'auto', padding: 'clamp(48px, 7vw, 88px) 24px 28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '40px 48px' }}>
            {showBrand && (
              <div style={{ flex: '2 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{brand}</div>
                {tagline && <p style={{ margin: '14px 0 0', maxWidth: '34ch', color: muted, fontSize: '16px', lineHeight: 1.6 }}>{tagline}</p>}
              </div>
            )}
            {cols.map((column, index) => (
              <nav key={index} aria-label={column.title || undefined} style={{ flex: '1 1 160px', minWidth: 0 }}>
                {column.title && <div style={{ marginBottom: '16px', color: muted, fontSize: '12px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>{column.title}</div>}
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '4px' }}>
                  {column.links.map((link, i) => (
                    <li key={i}><a href={link.href} style={{ display: 'inline-block', padding: '6px 0', color: fg, opacity: 0.86, textDecoration: 'none', fontSize: '15px' }}>{link.label}</a></li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: `1px solid ${line}`, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 24px', color: muted, fontSize: '13px' }}>
            <span>{copyright}</span>
            {backToTop && <a href="#" style={{ color: fg, opacity: 0.86, textDecoration: 'none', fontWeight: 600 }}>Volver arriba <span aria-hidden="true">↑</span></a>}
          </div>
        </div>
      </footer>
    )
  },
})
