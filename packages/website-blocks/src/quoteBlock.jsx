import { defineBlock } from '@raulbellosom/atlas-web-builder'

export const QuoteBlock = defineBlock({
  type:     'QuoteBlock',
  label:    'Cita editorial',
  category: 'atlas',
  defaultProps: {
    quote:       'Un hogar no se construye con paredes. Se construye con los objetos que elegimos, las texturas que tocamos y la luz que dejamos entrar.',
    attribution: '— Tu marca',
    background:  'cream',
    size:        'large',
    ornament:    'true',
  },
  fields: {
    quote:       { type: 'textarea', label: 'Cita' },
    attribution: { type: 'text',    label: 'Atribución (autor, fuente)' },
    background:  { type: 'select',  label: 'Fondo', options: [{ value: 'cream', label: 'Crema' }, { value: 'white', label: 'Blanco' }, { value: 'dark', label: 'Oscuro' }] },
    size:        { type: 'select',  label: 'Tamaño', options: [{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Grande' }] },
    ornament:    { type: 'select',  label: 'Mostrar comillas decorativas', options: [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['quote', 'attribution'] },
    { label: 'Estilo',    fields: ['background', 'size', 'ornament'] },
  ],
  render({ quote, attribution, background, size, ornament }) {
    const isLarge      = size === 'large'
    const isDark       = background === 'dark'
    const bgMap        = { white: '#FFFFFF', cream: '#EDE5D8', dark: '#1A1410' }
    const bg           = bgMap[background] || '#EDE5D8'
    const fg           = isDark ? '#FAF7F2' : '#1A1410'
    const showOrnament = ornament === 'true' || ornament === true

    return (
      <section style={{ background: bg, padding: isLarge ? '100px 24px' : '72px 24px' }}>
        <div style={{ maxWidth: '760px', marginInline: 'auto', textAlign: 'center', position: 'relative' }}>
          {showOrnament && (
            <div style={{
              position: 'absolute',
              top: '-60px',
              left: '-20px',
              fontSize: '180px',
              lineHeight: 1,
              color: '#B5603A',
              opacity: 0.12,
              fontFamily: 'Georgia, "Times New Roman", serif',
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 0,
            }}>
              &ldquo;
            </div>
          )}
          <p style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: isLarge ? 'clamp(28px, 4vw, 52px)' : '28px',
            fontWeight: 400,
            lineHeight: 1.45,
            color: fg,
            margin: 0,
            position: 'relative',
            zIndex: 1,
          }}>
            {quote}
          </p>
          {attribution && (
            <p style={{
              fontFamily: 'var(--runly-font-sans)',
              fontSize: '13px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#8C7E72',
              marginTop: '32px',
              marginBottom: 0,
            }}>
              {attribution}
            </p>
          )}
        </div>
      </section>
    )
  },
})
