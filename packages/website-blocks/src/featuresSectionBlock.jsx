import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseFeatures(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('---')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
      return { title: lines[0] || '', desc: lines.slice(1).join(' ').trim() }
    })
    .filter((f) => f.title)
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

export const FeaturesSectionBlock = defineBlock({
  type: 'FeaturesSectionBlock',
  label: 'Sección de características',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Por qué elegirnos',
    title: 'Todo lo que necesitas, en un solo lugar',
    subtitle: 'Hemos diseñado cada detalle para ofrecerte la mejor experiencia posible.',
    layout: 'grid-3',
    iconStyle: 'check',
    features:
      'Resultados garantizados\nNos comprometemos con métricas claras y te acompañamos hasta lograr los objetivos acordados.\n---\nEquipo especializado\nContarás con profesionales certificados en cada área de tu proyecto.\n---\nTecnología de punta\nUsamos las herramientas más modernas para optimizar cada proceso.\n---\nSoporte prioritario\nAccede a nuestro equipo de soporte 24/7 a través de múltiples canales.\n---\nPrecio transparente\nSin tarifas ocultas ni sorpresas. Sabes exactamente lo que pagas.\n---\nEntrega puntual\nCumplimos los plazos acordados. Tu tiempo es tan valioso como el nuestro.',
    background: 'white',
  },
  fields: {
    eyebrow:   { type: 'text',     label: 'Antetítulo' },
    title:     { type: 'text',     label: 'Título' },
    subtitle:  { type: 'textarea', label: 'Subtítulo' },
    layout:    { type: 'select',   label: 'Diseño', options: [
      { value: 'grid-2',  label: 'Lista de 2 columnas' },
      { value: 'grid-3',  label: 'Grilla de 3 columnas' },
      { value: 'list',    label: 'Lista vertical' },
    ]},
    iconStyle: { type: 'select', label: 'Estilo de icono', options: [
      { value: 'check',  label: 'Marca de verificación' },
      { value: 'arrow',  label: 'Flecha' },
      { value: 'number', label: 'Números' },
      { value: 'dot',    label: 'Punto' },
    ]},
    background: { type: 'select', label: 'Fondo', options: [
      { value: 'white', label: 'Blanco' },
      { value: 'muted', label: 'Gris suave' },
    ]},
    features: { type: 'textarea', label: 'Características (título, descripción, separados por ---)' },
  },
  groups: [
    { label: 'Encabezado',       fields: ['eyebrow', 'title', 'subtitle'] },
    { label: 'Características',  fields: ['features', 'layout', 'iconStyle', 'background'] },
  ],
  render({ eyebrow, title, subtitle, layout, iconStyle, background, features }) {
    const items = parseFeatures(features)
    const bg = background === 'muted' ? '#F8FAFC' : '#fff'

    const cols = layout === 'grid-3' ? 3 : layout === 'grid-2' ? 2 : 1
    const isList = layout === 'list'

    function FeatureIcon({ i }) {
      if (iconStyle === 'number') {
        return (
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--runly-color-primary, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--runly-font-sans)', fontWeight: 800, fontSize: '14px', color: '#fff' }}>
            {i + 1}
          </div>
        )
      }
      if (iconStyle === 'dot') {
        return (
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--runly-color-primary, #6D28D9)', flexShrink: 0, marginTop: '8px' }} />
        )
      }
      return (
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(109, 40, 217, 0.1)', color: 'var(--runly-color-primary, #6D28D9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {iconStyle === 'arrow' ? <ArrowIcon /> : <CheckIcon />}
        </div>
      )
    }

    return (
      <section style={{ padding: '80px 24px', background: bg }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {eyebrow && (
            <p style={{ textAlign: 'center', margin: '0 0 12px', color: 'var(--runly-color-primary, #6D28D9)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 style={{ textAlign: 'center', fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(26px, 3.5vw, 44px)', fontWeight: 800, color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 16px', lineHeight: 1.15 }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ textAlign: 'center', color: 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.7, maxWidth: '600px', marginInline: 'auto', marginBottom: '56px' }}>
              {subtitle}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isList ? '1fr' : `repeat(auto-fit, minmax(min(100%, ${Math.floor(1100 / cols)}px), 1fr))`, gap: isList ? '12px' : '28px' }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', padding: isList ? '20px 24px' : '0', background: isList ? '#fff' : 'transparent', borderRadius: isList ? '12px' : '0', border: isList ? '1px solid rgba(0,0,0,0.06)' : 'none', boxShadow: isList ? '0 1px 8px rgba(0,0,0,0.04)' : 'none' }}>
                <FeatureIcon i={i} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: isList ? '16px' : '17px', color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 6px', lineHeight: 1.3 }}>
                    {item.title}
                  </h4>
                  {item.desc && (
                    <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '14px', color: 'var(--runly-color-muted, #64748b)', margin: 0, lineHeight: 1.65 }}>
                      {item.desc}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  },
})
