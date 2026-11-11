import { defineBlock } from '@raulbellosom/atlas-web-builder'

export const SplitFeatureBlock = defineBlock({
  type:     'SplitFeatureBlock',
  label:    'Sección dividida imagen + texto',
  category: 'atlas',
  defaultProps: {
    variant:     'image-right',
    eyebrow:     'Nuestra historia',
    title:       'Diseño con propósito',
    body:        'Cada pieza que ofrecemos pasa por un proceso de selección riguroso. Buscamos objetos que tengan historia, que estén hechos para durar y que mejoren la vida diaria.',
    ctaLabel:    'Conocer más',
    ctaHref:     '#',
    imageSrc:    '',
    imageAlt:    '',
    background:  'white',
    imageHeight: 'full',
  },
  fields: {
    variant:     { type: 'select', label: 'Posición de imagen', options: [{ value: 'image-left', label: 'Imagen izquierda' }, { value: 'image-right', label: 'Imagen derecha' }] },
    eyebrow:     { type: 'text',   label: 'Antetítulo' },
    title:       { type: 'text',   label: 'Título' },
    body:        { type: 'textarea', label: 'Cuerpo de texto' },
    ctaLabel:    { type: 'text',   label: 'Texto del enlace (dejar vacío para ocultar)' },
    ctaHref:     { type: 'text',   label: 'URL del enlace' },
    imageSrc:    { type: 'image',  label: 'Imagen' },
    imageAlt:    { type: 'text',   label: 'Texto alternativo' },
    background:  { type: 'select', label: 'Fondo', options: [{ value: 'white', label: 'Blanco' }, { value: 'cream', label: 'Crema' }, { value: 'dark', label: 'Oscuro' }] },
    imageHeight: { type: 'select', label: 'Estilo de imagen', options: [{ value: 'full', label: 'Sin margen (llena la mitad)' }, { value: 'contained', label: 'Con margen y esquinas redondeadas' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'body', 'ctaLabel', 'ctaHref'] },
    { label: 'Imagen',    fields: ['imageSrc', 'imageAlt', 'variant', 'imageHeight'] },
    { label: 'Estilo',    fields: ['background'] },
  ],
  render({ variant, eyebrow, title, body, ctaLabel, ctaHref, imageSrc, imageAlt, background, imageHeight }) {
    const isImgLeft  = variant === 'image-left'
    const isDark     = background === 'dark'
    const bgMap      = { white: '#FFFFFF', cream: '#EDE5D8', dark: '#1A1410' }
    const bg         = bgMap[background] || '#FFFFFF'
    const fg         = isDark ? '#FAF7F2' : '#1A1410'
    const isContained = imageHeight === 'contained'

    const imgBox = (
      <div key="img" style={{ flex: '1 1 55%', minWidth: '300px', overflow: 'hidden', minHeight: '500px', position: 'relative' }}>
        {imageSrc ? (
          <img
            src={imageSrc} alt={imageAlt || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              ...(isContained ? { padding: '40px', boxSizing: 'border-box', borderRadius: '16px' } : {}) }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', minHeight: '500px', background: '#C9B99A', display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...(isContained ? { margin: '40px', width: 'calc(100% - 80px)', borderRadius: '16px' } : {}) }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FAF7F2" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </div>
    )

    const textBox = (
      <div key="text" style={{ flex: '1 1 45%', minWidth: '280px', padding: '80px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
        {eyebrow && (
          <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B5603A', margin: '0 0 16px' }}>
            {eyebrow}
          </p>
        )}
        {title && (
          <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'clamp(28px, 3vw, 44px)', fontWeight: 400, color: fg, margin: '0 0 24px', lineHeight: 1.2 }}>
            {title}
          </h2>
        )}
        {body && (
          <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.75, color: '#8C7E72', margin: '0 0 32px' }}>
            {body}
          </p>
        )}
        {ctaLabel && (
          <a href={ctaHref || '#'} style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '15px', fontWeight: 600, color: fg, textDecoration: 'underline', textUnderlineOffset: '4px', textDecorationColor: '#B5603A', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {ctaLabel} →
          </a>
        )}
      </div>
    )

    return (
      <section style={{ background: bg, display: 'flex', flexWrap: 'wrap' }}>
        {isImgLeft ? [imgBox, textBox] : [textBox, imgBox]}
      </section>
    )
  },
})
