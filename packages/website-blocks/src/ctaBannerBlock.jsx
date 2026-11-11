import { defineBlock } from '@raulbellosom/atlas-web-builder'

function isSafeHref(u) {
  return typeof u === 'string' && u !== '' && /^(https?:|mailto:|tel:|\/|#)/i.test(u)
}

export const CtaBannerBlock = defineBlock({
  type: 'CtaBannerBlock',
  label: 'Banner de llamada a acción',
  category: 'atlas',
  defaultProps: {
    eyebrow: '',
    title: '¿Listo para comenzar?',
    subtitle: 'Únete a miles de clientes que ya confían en nosotros. Sin compromisos.',
    ctaLabel: 'Empezar ahora',
    ctaHref: '#',
    ctaSecondLabel: 'Saber más',
    ctaSecondHref: '#',
    variant: 'gradient-primary',
    size: 'normal',
    align: 'center',
  },
  fields: {
    eyebrow:        { type: 'text',   label: 'Antetítulo' },
    title:          { type: 'text',   label: 'Título' },
    subtitle:       { type: 'textarea', label: 'Subtítulo' },
    ctaLabel:       { type: 'text',   label: 'Botón principal' },
    ctaHref:        { type: 'link',   label: 'Enlace botón principal' },
    ctaSecondLabel: { type: 'text',   label: 'Botón secundario (opcional)' },
    ctaSecondHref:  { type: 'link',   label: 'Enlace botón secundario' },
    variant: { type: 'select', label: 'Estilo de fondo', options: [
      { value: 'gradient-primary', label: 'Gradiente primario' },
      { value: 'solid-primary',    label: 'Color primario sólido' },
      { value: 'dark',             label: 'Oscuro' },
      { value: 'gradient-dark',    label: 'Gradiente oscuro' },
      { value: 'muted',            label: 'Gris suave' },
    ]},
    size: { type: 'select', label: 'Tamaño de la sección', options: [
      { value: 'compact', label: 'Compacto' },
      { value: 'normal',  label: 'Normal' },
      { value: 'large',   label: 'Grande' },
    ]},
    align: { type: 'select', label: 'Alineación', options: [
      { value: 'center', label: 'Centrado' },
      { value: 'left',   label: 'Izquierda' },
    ]},
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle', 'ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
    { label: 'Diseño',    fields: ['variant', 'size', 'align'] },
  ],
  render({ eyebrow, title, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, variant, size, align }) {
    const safeCta  = isSafeHref(ctaHref)       ? ctaHref       : '#'
    const safeCta2 = isSafeHref(ctaSecondHref) ? ctaSecondHref : '#'

    const paddingY = size === 'compact' ? '56px' : size === 'large' ? '120px' : '80px'
    const isCenter = align === 'center'
    const isLight  = variant === 'muted'

    const backgrounds = {
      'gradient-primary': 'linear-gradient(135deg, var(--runly-color-primary, #6D28D9) 0%, color-mix(in srgb, var(--runly-color-primary, #6D28D9) 60%, #1E40AF) 100%)',
      'solid-primary':    'var(--runly-color-primary, #6D28D9)',
      'dark':             '#0F172A',
      'gradient-dark':    'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      'muted':            '#F1F5F9',
    }
    const bg = backgrounds[variant] || backgrounds['gradient-primary']
    const fg       = isLight ? 'var(--runly-color-fg, #0f172a)'       : '#fff'
    const fgMuted  = isLight ? 'var(--runly-color-muted, #64748b)'    : 'rgba(255,255,255,0.78)'
    const eyebrowC = isLight ? 'var(--runly-color-primary, #6D28D9)'  : 'rgba(255,255,255,0.65)'

    const ctaBg       = isLight ? 'var(--runly-color-primary, #6D28D9)' : '#fff'
    const ctaFg       = isLight ? '#fff' : 'var(--runly-color-primary, #6D28D9)'
    const ctaSecondFg = isLight ? 'var(--runly-color-fg, #0f172a)'      : 'rgba(255,255,255,0.85)'
    const ctaSecondBorder = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)'

    return (
      <section style={{ background: bg, padding: `${paddingY} 24px` }}>
        <div style={{ maxWidth: '800px', marginInline: 'auto', textAlign: isCenter ? 'center' : 'left' }}>
          {eyebrow && (
            <p style={{ margin: '0 0 12px', color: eyebrowC, fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 style={{ fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900, color: fg, margin: '0 0 16px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '18px', color: fgMuted, lineHeight: 1.7, margin: '0 0 36px', maxWidth: isCenter ? '580px' : '100%', marginInline: isCenter ? 'auto' : undefined }}>
              {subtitle}
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: isCenter ? 'center' : 'flex-start' }}>
            {ctaLabel && (
              <a href={safeCta} style={{ display: 'inline-block', background: ctaBg, color: ctaFg, border: 'none', padding: '14px 32px', borderRadius: '10px', fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '16px', textDecoration: 'none', letterSpacing: '-0.01em' }}>
                {ctaLabel}
              </a>
            )}
            {ctaSecondLabel && (
              <a href={safeCta2} style={{ display: 'inline-block', background: 'transparent', color: ctaSecondFg, border: `1.5px solid ${ctaSecondBorder}`, padding: '14px 32px', borderRadius: '10px', fontFamily: 'var(--runly-font-sans)', fontWeight: 600, fontSize: '16px', textDecoration: 'none' }}>
                {ctaSecondLabel}
              </a>
            )}
          </div>
        </div>
      </section>
    )
  },
})
