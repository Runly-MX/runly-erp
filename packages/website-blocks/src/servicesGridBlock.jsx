import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseServices(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('---')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
      return { title: lines[0] || '', desc: lines.slice(1).join(' ').trim() }
    })
    .filter((s) => s.title)
}

const ICON_PATHS = [
  // Zap
  'm13 2-10 12h9l-1 8 10-12h-9l1-8z',
  // Shield
  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  // Star
  'M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z',
  // Check circle
  'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  // Target
  'M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0M12 12m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  // Package
  'M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
]

function ServiceIcon({ i }) {
  const pathCmds = [
    [{ type: 'polyline', points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }],
    [{ type: 'path', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }],
    [{ type: 'polygon', points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }],
    [{ type: 'path', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }, { type: 'polyline', points: '22 4 12 14.01 9 11.01' }],
    [{ type: 'circle', cx: '12', cy: '12', r: '10' }, { type: 'circle', cx: '12', cy: '12', r: '6' }, { type: 'circle', cx: '12', cy: '12', r: '2' }],
    [{ type: 'path', d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' }, { type: 'polyline', points: '3.27 6.96 12 12.01 20.73 6.96' }, { type: 'line', x1: '12', y1: '22.08', x2: '12', y2: '12' }],
  ]
  const shapes = pathCmds[i % pathCmds.length]
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {shapes.map((s, j) => {
        if (s.type === 'polyline') return <polyline key={j} points={s.points} />
        if (s.type === 'polygon') return <polygon key={j} points={s.points} />
        if (s.type === 'circle') return <circle key={j} cx={s.cx} cy={s.cy} r={s.r} />
        if (s.type === 'line') return <line key={j} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        return <path key={j} d={s.d} />
      })}
    </svg>
  )
}

export const ServicesGridBlock = defineBlock({
  type: 'ServicesGridBlock',
  label: 'Grilla de servicios',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Lo que ofrecemos',
    title: 'Nuestros Servicios',
    subtitle: 'Descubre todo lo que tenemos para ti y tu negocio.',
    columns: '3',
    services:
      'Asesoría Personalizada\nTe acompañamos en cada paso del proceso con expertos dedicados a tu éxito.\n---\nSoluciones a Medida\nDiseñamos estrategias únicas adaptadas a las necesidades específicas de tu negocio.\n---\nSoporte Continuo\nEstamos disponibles para ti en todo momento, garantizando resultados óptimos.',
    cardStyle: 'card',
    align: 'left',
  },
  fields: {
    eyebrow:   { type: 'text',     label: 'Antetítulo' },
    title:     { type: 'text',     label: 'Título de sección' },
    subtitle:  { type: 'textarea', label: 'Subtítulo' },
    columns:   { type: 'select',   label: 'Columnas', options: [
      { value: '1', label: '1 columna' },
      { value: '2', label: '2 columnas' },
      { value: '3', label: '3 columnas' },
      { value: '4', label: '4 columnas' },
    ]},
    services:  { type: 'textarea', label: 'Servicios (título, descripción, separados por ---)' },
    cardStyle: { type: 'select',   label: 'Estilo de tarjeta', options: [
      { value: 'card',     label: 'Tarjeta con sombra' },
      { value: 'bordered', label: 'Con borde' },
      { value: 'minimal',  label: 'Minimalista' },
    ]},
    align: { type: 'select', label: 'Alineación del contenido', options: [
      { value: 'left',   label: 'Izquierda' },
      { value: 'center', label: 'Centro' },
    ]},
  },
  groups: [
    { label: 'Encabezado', fields: ['eyebrow', 'title', 'subtitle', 'align'] },
    { label: 'Servicios',  fields: ['services', 'columns', 'cardStyle'] },
  ],
  render({ eyebrow, title, subtitle, columns, services, cardStyle, align }) {
    const cols = Math.max(1, Math.min(4, Number(columns) || 3))
    const items = parseServices(services)
    const isCenter = align === 'center'

    const cardBase = {
      borderRadius: '16px',
      padding: '32px 28px',
      transition: 'box-shadow 200ms ease',
      height: '100%',
      boxSizing: 'border-box',
    }
    const cardVariants = {
      card:     { ...cardBase, background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.05)' },
      bordered: { ...cardBase, background: 'transparent', border: '2px solid var(--runly-color-primary, #6D28D9)' },
      minimal:  { ...cardBase, background: 'transparent', padding: '24px 4px' },
    }
    const style = cardVariants[cardStyle] || cardVariants.card

    return (
      <section style={{ padding: '80px 24px', background: 'var(--runly-color-bg, #fff)' }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {eyebrow && (
            <p style={{ textAlign: isCenter ? 'center' : 'left', margin: '0 0 12px', color: 'var(--runly-color-primary, #6D28D9)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 style={{ textAlign: isCenter ? 'center' : 'left', fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 800, color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 16px', lineHeight: 1.15 }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ textAlign: isCenter ? 'center' : 'left', color: 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.7, maxWidth: isCenter ? '600px' : '700px', marginInline: isCenter ? 'auto' : undefined, marginBottom: '56px' }}>
              {subtitle}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(1100 / cols)}px), 1fr))`, gap: '24px' }}>
            {items.map((item, i) => (
              <div key={i} style={style}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--runly-color-primary, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', flexShrink: 0 }}>
                  <ServiceIcon i={i} />
                </div>
                <h3 style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '18px', fontWeight: 700, color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 10px', lineHeight: 1.3 }}>
                  {item.title}
                </h3>
                {item.desc && (
                  <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '15px', color: 'var(--runly-color-muted, #64748b)', lineHeight: 1.7, margin: 0 }}>
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
