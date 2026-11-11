import { defineBlock } from '@raulbellosom/atlas-web-builder'

const STYLE = '.fin-close-btn{transition:transform .2s ease}.fin-close-btn:hover{transform:translateY(-2px)}.fin-close-btn:focus-visible{outline:3px solid #7BE0B2;outline-offset:3px}@media (prefers-reduced-motion:reduce){.fin-close-btn{transition:none}}'
const btn = (solid) => ({
  display: 'inline-flex', alignItems: 'center', minHeight: '52px', padding: '0 32px', borderRadius: '999px', fontWeight: 800, fontSize: '16px', textDecoration: 'none',
  background: solid ? '#fff' : 'transparent', color: solid ? '#083A2A' : '#fff', border: solid ? '2px solid #fff' : '2px solid rgba(255,255,255,.6)',
})

export const FinClosingBlock = defineBlock({
  type: 'FinClosingBlock',
  label: 'Cierre en verde oscuro',
  category: 'atlas',
  defaultProps: {
    eyebrow: '¿Listo para comenzar?', title: 'Tus metas financieras están más cerca de lo que crees',
    subtitle: 'Únete a miles de clientes satisfechos y da el primer paso hacia un futuro financiero más brillante.',
    ctaLabel: 'Comenzar hoy', ctaHref: '/contacto', ctaSecondLabel: 'Ver préstamos', ctaSecondHref: '/prestamos',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle'] }, { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] }],
  render({ eyebrow, title, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref }) {
    return (
      <section style={{ padding: 'clamp(56px, 8vw, 112px) 24px', background: '#F6FBF8', fontFamily: 'var(--runly-font-sans)' }}>
        <style>{STYLE}</style>
        <div style={{ position: 'relative', overflow: 'hidden', maxWidth: '1100px', marginInline: 'auto', padding: 'clamp(40px, 6vw, 80px) clamp(24px, 5vw, 64px)', borderRadius: '36px', textAlign: 'center', color: '#fff', background: 'linear-gradient(150deg,#0F6B4B 0%,#062E22 100%)', boxShadow: '0 40px 80px -36px rgba(6,46,34,.8)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', right: '-90px', top: '-120px', width: '340px', height: '340px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(123,224,178,.32), transparent)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', left: '-80px', bottom: '-140px', width: '320px', height: '320px', borderRadius: '50%', border: '1px solid rgba(123,224,178,.25)', boxShadow: '0 0 0 40px rgba(123,224,178,.05)' }} />
          <div style={{ position: 'relative' }}>
            {eyebrow && <p style={{ margin: '0 0 14px', color: '#9BE8C4', fontSize: '13px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{eyebrow}</p>}
            {title && <h2 style={{ margin: '0 auto', maxWidth: '18ch', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-.03em' }}>{title}</h2>}
            {subtitle && <p style={{ margin: '18px auto 0', maxWidth: '560px', fontSize: '18px', lineHeight: 1.6 }}>{subtitle}</p>}
            {(ctaLabel || ctaSecondLabel) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '34px' }}>
                {ctaLabel && <a className="fin-close-btn" href={ctaHref || '#'} style={btn(true)}>{ctaLabel}</a>}
                {ctaSecondLabel && <a className="fin-close-btn" href={ctaSecondHref || '#'} style={btn(false)}>{ctaSecondLabel}</a>}
              </div>
            )}
          </div>
        </div>
      </section>
    )
  },
})
