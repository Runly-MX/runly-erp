import { defineBlock } from '@raulbellosom/atlas-web-builder'

const safeImg = (src) => (typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : '')
const BACKGROUNDS = {
  tint: 'linear-gradient(180deg, color-mix(in srgb, var(--runly-color-primary, #2563eb) 12%, #fff) 0%, var(--runly-color-bg, #fff) 100%)',
  white: 'var(--runly-color-bg, #fff)',
  dark: '#0f172a',
}
const BLOB = '58% 42% 55% 45% / 48% 55% 45% 52%'

const buttonStyle = (solid) => ({
  display: 'inline-flex', alignItems: 'center', padding: '14px 28px', borderRadius: '999px', fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '15px', textDecoration: 'none',
  background: solid ? 'var(--runly-color-primary, #2563eb)' : 'rgba(255,255,255,.9)',
  color: solid ? 'var(--runly-color-primaryFg, #fff)' : 'var(--runly-color-fg, #0f172a)',
  boxShadow: solid ? 'none' : '0 1px 3px rgba(0,0,0,.12)',
})

export const ShowcaseHeroBlock = defineBlock({
  type: 'ShowcaseHeroBlock',
  label: 'Hero con retrato y tarjeta flotante',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Diseñadora web freelance',
    title: 'Diseño sitios web',
    highlight: 'que inspiran y brillan',
    subtitle: 'Creo sitios hermosos y fáciles de usar que ayudan a las marcas a destacar y crecer en línea.',
    ctaLabel: 'Ver mi trabajo', ctaHref: '/trabajo',
    ctaSecondLabel: '', ctaSecondHref: '',
    imageSrc: '', imageAlt: '',
    badgeValue: '6+', badgeLabel: 'Años de experiencia',
    shape: 'accent', background: 'tint',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' },
    title: { type: 'text', label: 'Título' },
    highlight: { type: 'text', label: 'Título destacado (color de marca)' },
    subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' },
    ctaHref: { type: 'link', label: 'Enlace del botón principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' },
    ctaSecondHref: { type: 'link', label: 'Enlace del botón secundario' },
    imageSrc: { type: 'image', label: 'Imagen o retrato' },
    imageAlt: { type: 'text', label: 'Texto alternativo de la imagen' },
    badgeValue: { type: 'text', label: 'Tarjeta flotante: cifra' },
    badgeLabel: { type: 'text', label: 'Tarjeta flotante: texto' },
    shape: { type: 'select', label: 'Forma decorativa', options: [{ value: 'accent', label: 'Color de acento' }, { value: 'primary', label: 'Color principal' }, { value: 'none', label: 'Sin forma' }] },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'tint', label: 'Degradado suave' }, { value: 'white', label: 'Liso' }, { value: 'dark', label: 'Oscuro' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'subtitle'] },
    { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
    { label: 'Imagen', fields: ['imageSrc', 'imageAlt', 'badgeValue', 'badgeLabel'] },
    { label: 'Estilo', fields: ['shape', 'background'] },
  ],
  render({ eyebrow, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, imageSrc, imageAlt, badgeValue, badgeLabel, shape, background }) {
    const dark = background === 'dark'
    const image = safeImg(imageSrc)
    const shapeColor = shape === 'primary' ? 'var(--runly-color-primary, #2563eb)' : 'var(--runly-color-accent, #fbbf24)'
    const fg = dark ? '#fff' : 'var(--runly-color-fg, #0f172a)'
    return (
      <section style={{ background: BACKGROUNDS[background] ?? BACKGROUNDS.tint, padding: '72px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '48px', alignItems: 'center' }}>
          <div>
            {eyebrow && <p style={{ margin: '0 0 16px', color: 'var(--runly-color-primary, #2563eb)', fontFamily: 'var(--runly-font-sans)', fontSize: '13px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{eyebrow}</p>}
            <h1 style={{ margin: 0, color: fg, fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, lineHeight: 1.08 }}>
              {title}
              {highlight && <><br /><span style={{ color: 'var(--runly-color-primary, #2563eb)' }}>{highlight}</span></>}
            </h1>
            {subtitle && <p style={{ margin: '24px 0 0', maxWidth: '520px', color: dark ? 'rgba(255,255,255,.75)' : 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '18px', lineHeight: 1.65 }}>{subtitle}</p>}
            {(ctaLabel || ctaSecondLabel) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '32px' }}>
                {ctaLabel && <a href={ctaHref || '#'} style={buttonStyle(true)}>{ctaLabel}</a>}
                {ctaSecondLabel && <a href={ctaSecondHref || '#'} style={buttonStyle(false)}>{ctaSecondLabel}</a>}
              </div>
            )}
          </div>
          <div style={{ position: 'relative', minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {shape !== 'none' && <div aria-hidden="true" style={{ position: 'absolute', inset: '4% 6%', background: shapeColor, borderRadius: BLOB, opacity: 0.9 }} />}
            {image
              ? <img src={image} alt={imageAlt || ''} loading="eager" style={{ position: 'relative', width: '100%', maxWidth: '460px', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: BLOB, boxShadow: '0 24px 60px rgba(15,23,42,.2)' }} />
              : <div aria-hidden="true" style={{ position: 'relative', width: '100%', maxWidth: '420px', aspectRatio: '4 / 5', borderRadius: BLOB, background: 'rgba(255,255,255,.55)' }} />}
            {badgeValue && (
              <div style={{ position: 'absolute', right: 0, top: '12%', background: '#fff', borderRadius: '16px', padding: '14px 20px', boxShadow: '0 12px 32px rgba(15,23,42,.18)', fontFamily: 'var(--runly-font-sans)' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{badgeValue}</div>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', maxWidth: '110px' }}>{badgeLabel}</div>
              </div>
            )}
          </div>
        </div>
      </section>
    )
  },
})
