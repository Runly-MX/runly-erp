import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseTestimonials(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('---')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
      const meta = lines[0] || ''
      const parts = meta.split('|').map((p) => p.trim())
      const quote = lines.slice(1).join(' ').trim()
      return {
        name:  parts[0] || '',
        role:  parts[1] || '',
        stars: Math.max(1, Math.min(5, parseInt(parts[2], 10) || 5)),
        quote,
      }
    })
    .filter((t) => t.name)
}

function StarRow({ count }) {
  return (
    <div style={{ display: 'flex', gap: '3px', marginBottom: '16px' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="16" height="16" viewBox="0 0 24 24" fill={n <= count ? '#F59E0B' : 'none'} stroke={n <= count ? '#F59E0B' : '#D1D5DB'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
}

function InitialsAvatar({ name }) {
  const words = (name || '').split(' ').filter(Boolean)
  const initials = words.length >= 2
    ? words[0][0] + words[1][0]
    : (words[0] || '?')[0]
  const colors = ['#6D28D9', '#0369A1', '#047857', '#B45309', '#BE185D', '#1D4ED8']
  const idx = (name || '').charCodeAt(0) % colors.length
  return (
    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: colors[idx], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '16px', color: '#fff', flexShrink: 0 }}>
      {initials.toUpperCase()}
    </div>
  )
}

export const TestimonialsBlock = defineBlock({
  type: 'TestimonialsBlock',
  label: 'Testimonios',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Lo que dicen de nosotros',
    title: 'Clientes que confían en nosotros',
    columns: '3',
    background: 'muted',
    testimonials:
      'María González|Fundadora de Bloom Studio|5\nTrabajaron con nosotros de principio a fin, siempre atentos a los detalles y comprometidos con el resultado. Superaron todas nuestras expectativas.\n---\nCarlos Mendoza|Director de Operaciones|5\nUn equipo excepcional. La calidad de su trabajo y la atención al cliente son incomparables. Los recomendaría sin dudarlo.\n---\nSofía Ramírez|Emprendedora|4\nExperiencia increíble. El proceso fue sencillo, transparente y los resultados hablan por sí solos. Definitivamente volvería a trabajar con ellos.',
  },
  fields: {
    eyebrow:      { type: 'text',     label: 'Antetítulo' },
    title:        { type: 'text',     label: 'Título' },
    columns:      { type: 'select',   label: 'Columnas', options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
    ]},
    background:   { type: 'select',   label: 'Fondo de sección', options: [
      { value: 'white', label: 'Blanco' },
      { value: 'muted', label: 'Gris suave' },
      { value: 'dark',  label: 'Oscuro' },
    ]},
    testimonials: { type: 'textarea', label: 'Testimonios (Nombre|Cargo|Estrellas, luego el texto, separados por ---)' },
  },
  render({ eyebrow, title, columns, background, testimonials }) {
    const cols = Math.max(1, Math.min(3, Number(columns) || 3))
    const items = parseTestimonials(testimonials)
    const isDark = background === 'dark'
    const bg = background === 'muted' ? '#F8FAFC' : background === 'dark' ? '#0F172A' : '#fff'
    const fg = isDark ? 'rgba(255,255,255,0.95)' : 'var(--runly-color-fg, #0f172a)'
    const fgMuted = isDark ? 'rgba(255,255,255,0.6)' : 'var(--runly-color-muted, #64748b)'
    const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#fff'
    const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

    return (
      <section style={{ padding: '80px 24px', background: bg }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {eyebrow && (
            <p style={{ textAlign: 'center', margin: '0 0 12px', color: 'var(--runly-color-primary, #6D28D9)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 style={{ textAlign: 'center', fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800, color: fg, margin: '0 0 48px', lineHeight: 1.2 }}>
              {title}
            </h2>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(1100 / cols)}px), 1fr))`, gap: '24px' }}>
            {items.map((t, i) => (
              <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: '20px', padding: '32px', boxShadow: isDark ? 'none' : '0 2px 20px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                <StarRow count={t.stars} />
                <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '15px', lineHeight: 1.75, color: fgMuted, margin: '0 0 24px', flex: 1, fontStyle: 'italic' }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderTop: `1px solid ${cardBorder}`, paddingTop: '20px' }}>
                  <InitialsAvatar name={t.name} />
                  <div>
                    <p style={{ fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '14px', color: fg, margin: 0 }}>{t.name}</p>
                    {t.role && <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '13px', color: fgMuted, margin: '2px 0 0' }}>{t.role}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  },
})
