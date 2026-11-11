import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseStats(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('---')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
      return {
        value: lines[0] || '',
        label: lines[1] || '',
        desc:  lines[2] || '',
      }
    })
    .filter((s) => s.value)
}

export const StatsBlock = defineBlock({
  type: 'StatsBlock',
  label: 'Estadísticas',
  category: 'atlas',
  defaultProps: {
    eyebrow: '',
    title: '',
    stats:
      '1,200+\nClientes atendidos\nEn toda la región\n---\n15 años\nDe experiencia\nEn el mercado\n---\n99%\nSatisfacción\nTasa de retención\n---\n50+\nPremios\nReconocimientos obtenidos',
    background: 'primary',
    align: 'center',
  },
  fields: {
    eyebrow:    { type: 'text',     label: 'Antetítulo' },
    title:      { type: 'text',     label: 'Título (opcional)' },
    stats:      { type: 'textarea', label: 'Estadísticas (valor, etiqueta, descripción opcional, separados por ---)' },
    background: { type: 'select',   label: 'Fondo', options: [
      { value: 'primary', label: 'Color primario' },
      { value: 'dark',    label: 'Oscuro' },
      { value: 'white',   label: 'Blanco' },
      { value: 'muted',   label: 'Gris suave' },
    ]},
    align: { type: 'select', label: 'Alineación', options: [
      { value: 'center', label: 'Centrado' },
      { value: 'left',   label: 'Izquierda' },
    ]},
  },
  render({ eyebrow, title, stats, background, align }) {
    const items = parseStats(stats)
    const isPrimary = background === 'primary'
    const isDark    = background === 'dark'
    const isLight   = background === 'white' || background === 'muted'

    const bg = isPrimary ? 'var(--runly-color-primary, #6D28D9)'
      : isDark ? '#0F172A'
      : background === 'muted' ? '#F8FAFC'
      : '#fff'

    const fg       = isLight ? 'var(--runly-color-fg, #0f172a)' : '#fff'
    const fgMuted  = isLight ? 'var(--runly-color-muted, #64748b)' : 'rgba(255,255,255,0.72)'
    const divider  = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'
    const isCenter = align === 'center'

    return (
      <section style={{ padding: '72px 24px', background: bg }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {(eyebrow || title) && (
            <div style={{ textAlign: isCenter ? 'center' : 'left', marginBottom: '48px' }}>
              {eyebrow && (
                <p style={{ margin: '0 0 8px', color: isLight ? 'var(--runly-color-primary, #6D28D9)' : 'rgba(255,255,255,0.65)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2 style={{ margin: 0, fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800, color: fg, lineHeight: 1.2 }}>
                  {title}
                </h2>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 200px), 1fr))`, gap: '0' }}>
            {items.map((item, i) => (
              <div key={i} style={{ textAlign: isCenter ? 'center' : 'left', padding: '32px 24px', borderLeft: i > 0 ? `1px solid ${divider}` : 'none' }}>
                <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, color: fg, margin: '0 0 6px', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {item.value}
                </p>
                <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '16px', fontWeight: 700, color: fg, margin: '0 0 6px' }}>
                  {item.label}
                </p>
                {item.desc && (
                  <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '13px', color: fgMuted, margin: 0, lineHeight: 1.5 }}>
                    {item.desc}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  },
})
