import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseMenu(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  const categories = raw.split('---').map((b) => b.trim()).filter(Boolean)
  return categories.map((cat) => {
    const lines = cat.split('\n').map((l) => l.trim()).filter(Boolean)
    const name  = lines[0] || ''
    const items = lines.slice(1).map((line) => {
      const parts = line.split('|').map((p) => p.trim())
      return {
        name:  parts[0] || '',
        desc:  parts[1] || '',
        price: parts[2] || '',
      }
    }).filter((item) => item.name)
    return { name, items }
  }).filter((cat) => cat.name)
}

export const MenuGridBlock = defineBlock({
  type: 'MenuGridBlock',
  label: 'Menu de restaurante',
  category: 'atlas-restaurant',
  defaultProps: {
    eyebrow: 'Lo que servimos',
    title: 'Nuestro Menú',
    subtitle: 'Ingredientes frescos y sabores auténticos en cada platillo.',
    currency: '$',
    showPrices: true,
    columns: '2',
    menu:
      'Entradas\nEnsalada César | Lechuga romana, crotones y aderezo especial | 8.50\nSopa del Día | Consulta con tu mesero | 6.00\nCeviche de Camarón | Camarón, limón, cilantro y chile serrano | 12.00\n---\nPlatos Fuertes\nFilete a la Parrilla | Corte premium 300g con guarnición a elegir | 28.00\nPasta Alfredo | Fettuccine con salsa cremosa y champiñones | 16.00\nPollo al Limón | Pechuga a las brasas con papas y ensalada | 18.00\n---\nPostres\nTarta de Chocolate | Pastel artesanal con helado de vainilla | 7.00\nFlan de Cajeta | Receta tradicional de la casa | 5.50',
  },
  fields: {
    eyebrow:    { type: 'text',     label: 'Antetítulo' },
    title:      { type: 'text',     label: 'Título' },
    subtitle:   { type: 'textarea', label: 'Subtítulo' },
    currency:   { type: 'text',     label: 'Símbolo de moneda' },
    showPrices: { type: 'toggle',   label: 'Mostrar precios' },
    columns:    { type: 'select',   label: 'Columnas de categorías', options: [
      { value: '1', label: '1 columna' },
      { value: '2', label: '2 columnas' },
      { value: '3', label: '3 columnas' },
    ]},
    menu: { type: 'textarea', label: 'Menú (Categoría, luego Plato|Descripción|Precio, separados por ---)' },
  },
  groups: [
    { label: 'Encabezado', fields: ['eyebrow', 'title', 'subtitle'] },
    { label: 'Menú',       fields: ['menu', 'columns', 'currency', 'showPrices'] },
  ],
  render({ eyebrow, title, subtitle, currency, showPrices, columns, menu }) {
    const cats = parseMenu(menu)
    const cols = Math.max(1, Math.min(3, Number(columns) || 2))
    const curr = currency || '$'

    return (
      <section style={{ padding: '80px 24px', background: 'var(--runly-color-bg, #fff)' }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {eyebrow && (
            <p style={{ textAlign: 'center', margin: '0 0 12px', color: 'var(--runly-color-primary, #6D28D9)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 style={{ textAlign: 'center', fontFamily: 'var(--runly-font-serif, Georgia, serif)', fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 700, color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 16px', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ textAlign: 'center', color: 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.7, maxWidth: '560px', marginInline: 'auto', marginBottom: '64px' }}>
              {subtitle}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(1150 / cols)}px), 1fr))`, gap: '48px 64px' }}>
            {cats.map((cat, ci) => (
              <div key={ci}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                  <h3 style={{ fontFamily: 'var(--runly-font-serif, Georgia, serif)', fontSize: '22px', fontWeight: 700, color: 'var(--runly-color-fg, #0f172a)', margin: 0, whiteSpace: 'nowrap' }}>
                    {cat.name}
                  </h3>
                  <div style={{ flex: 1, height: '1px', background: 'var(--runly-color-primary, #6D28D9)', opacity: 0.25 }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {cat.items.map((item, ii) => (
                    <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', padding: '16px 0', borderBottom: ii < cat.items.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--runly-font-sans)', fontWeight: 600, fontSize: '16px', color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 4px' }}>
                          {item.name}
                        </p>
                        {item.desc && (
                          <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '13px', color: 'var(--runly-color-muted, #64748b)', margin: 0, lineHeight: 1.5 }}>
                            {item.desc}
                          </p>
                        )}
                      </div>
                      {showPrices !== false && item.price && (
                        <span style={{ fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '16px', color: 'var(--runly-color-primary, #6D28D9)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {curr}{item.price}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  },
})
