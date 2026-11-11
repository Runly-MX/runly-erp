import { defineBlock } from '@raulbellosom/atlas-web-builder'

const MARQUEE_STYLE = `@keyframes atlas-marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }`

export const MarqueeBlock = defineBlock({
  type:     'MarqueeBlock',
  label:    'Cinta animada (marquee)',
  category: 'atlas',
  defaultProps: {
    items:      'Sala · Comedor · Recámara · Jardín · Baño · Estudio',
    speed:      'normal',
    background: 'dark',
    size:       'md',
  },
  fields: {
    items:      { type: 'text',   label: 'Texto (separado por · o cualquier separador)' },
    speed:      { type: 'select', label: 'Velocidad', options: [{ value: 'slow', label: 'Lento (60s)' }, { value: 'normal', label: 'Normal (35s)' }, { value: 'fast', label: 'Rápido (20s)' }] },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'dark', label: 'Oscuro' }, { value: 'cream', label: 'Crema' }, { value: 'primary', label: 'Terracota' }] },
    size:       { type: 'select', label: 'Tamaño de texto', options: [{ value: 'sm', label: 'Pequeño' }, { value: 'md', label: 'Mediano' }, { value: 'lg', label: 'Grande' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['items'] },
    { label: 'Estilo',    fields: ['background', 'size', 'speed'] },
  ],
  render({ items, speed, background, size }) {
    const speedMap = { slow: 60, normal: 35, fast: 20 }
    const duration = speedMap[speed] || 35
    const sizeMap  = { sm: '13px', md: '16px', lg: '22px' }
    const fontSize = sizeMap[size] || '16px'
    const bgMap    = { dark: '#1A1410', cream: '#EDE5D8', primary: '#B5603A' }
    const bg       = bgMap[background] || '#1A1410'
    const fg       = background === 'cream' ? '#1A1410' : '#FAF7F2'
    const content  = `${items || 'Sala · Comedor · Recámara'}  ·  `
    const textStyle = {
      fontFamily: 'var(--runly-font-sans)',
      fontSize,
      color: fg,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      padding: '0 24px',
      whiteSpace: 'nowrap',
    }

    return (
      <div style={{ background: bg, overflow: 'hidden', paddingBlock: '14px' }}>
        <style>{MARQUEE_STYLE}</style>
        <div style={{
          display: 'flex',
          width: 'max-content',
          animation: `atlas-marquee ${duration}s linear infinite`,
        }}>
          <span style={textStyle}>{content}</span>
          <span style={textStyle}>{content}</span>
        </div>
      </div>
    )
  },
})
