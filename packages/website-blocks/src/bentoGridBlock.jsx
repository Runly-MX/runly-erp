import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseBentoItems(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('---')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
      return { title: lines[0] || '', desc: lines[1] || '', size: lines[2] || 'normal' }
    })
    .filter((s) => s.title)
    .slice(0, 6)
}

export const BentoGridBlock = defineBlock({
  type:     'BentoGridBlock',
  label:    'Cuadrícula editorial (Bento)',
  category: 'atlas',
  defaultProps: {
    items: 'Sala de estar\nSofás, mesas y textiles que definen el corazón del hogar.\nlarge\n---\nComedor\nMesas y sillas para los momentos que importan.\nnormal\n---\nJardín\nPiezas que llevan el diseño al exterior.\ntall\n---\nRecámara\nTextiles y objetos para el descanso.\nnormal',
    background: 'cream',
  },
  fields: {
    items:      { type: 'textarea', label: 'Celdas (título, descripción, tamaño — separados por ---)\nTamaños: normal | wide | tall | large' },
    background: { type: 'select',   label: 'Fondo', options: [{ value: 'cream', label: 'Crema' }, { value: 'white', label: 'Blanco' }, { value: 'dark', label: 'Oscuro' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['items'] },
    { label: 'Estilo',    fields: ['background'] },
  ],
  render({ items, background }) {
    const parsed = parseBentoItems(items)
    const isDark = background === 'dark'
    const bgMap  = { white: '#FFFFFF', cream: '#FAF7F2', dark: '#1A1410' }
    const bg     = bgMap[background] || '#FAF7F2'
    const fg     = isDark ? '#FAF7F2' : '#1A1410'

    const cellBgs = isDark
      ? ['#2A2420', '#1F1B18']
      : background === 'cream'
        ? ['#FAF7F2', '#EDE5D8']
        : ['#FFFFFF', '#FAF7F2']

    const sizeMap = {
      normal: { gridColumn: 'span 1', gridRow: 'span 1' },
      wide:   { gridColumn: 'span 2', gridRow: 'span 1' },
      tall:   { gridColumn: 'span 1', gridRow: 'span 2' },
      large:  { gridColumn: 'span 2', gridRow: 'span 2' },
    }

    return (
      <section style={{ background: bg, padding: '80px 24px' }}>
        <div style={{
          maxWidth: '1200px',
          marginInline: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridAutoRows: '220px',
          gridAutoFlow: 'dense',
          gap: '16px',
        }}>
          {parsed.map((item, i) => {
            const sizeStyle = sizeMap[item.size] || sizeMap.normal
            const isLarge   = item.size === 'large' || item.size === 'tall'
            return (
              <div key={i} style={{
                ...sizeStyle,
                background: cellBgs[i % 2],
                borderRadius: '20px',
                padding: isLarge ? '40px' : '28px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#B5603A', marginBottom: '24px', flexShrink: 0 }} />
                <h3 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: isLarge ? '28px' : '18px', fontWeight: 400, color: fg, margin: '0 0 12px', lineHeight: 1.2 }}>
                  {item.title}
                </h3>
                <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '14px', lineHeight: 1.65, color: '#8C7E72', margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    )
  },
})
