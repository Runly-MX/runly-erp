import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { HAND, BOLD, BLUE, YELLOW, INK, NAVY, CSS_BASE, marker, Squiggle } from './mayaBlocks.jsx'

// Pricing packages as stickers; the plan with a badge is raised and filled with solid navy.
const PLANS_CSS = `${CSS_BASE}
.mya-plans .plan{transition:transform .25s cubic-bezier(.2,1.2,.4,1)}
.mya-plans .plan:hover{transform:translateY(-8px) rotate(var(--r,0deg))}
.mya-plans .cta{transition:transform .2s ease}
.mya-plans .cta:hover{transform:translate(-2px,-2px)}
.mya-plans .cta:focus-visible{outline:3px solid #0F2347;outline-offset:3px}`

function Plans({ eyebrow, title, highlight, subtitle, plans, currency, ctaLabel, ctaHref }) {
  const items = String(plans ?? '').split(/\n---\n/).map((chunk) => {
    const [head, description, ...features] = chunk.split('\n').map((l) => l.trim())
    const [name, price, badge] = String(head ?? '').split('|').map((s) => s.trim())
    return { name, price, badge, description, features: features.filter(Boolean) }
  }).filter((p) => p.name)
  return (
    <section className="mya mya-plans" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 8vw, 104px) 24px', background: 'linear-gradient(180deg, #FFF3C4 0%, #F5F9FF 100%)' }}>
      <style>{PLANS_CSS}</style>
      <Squiggle width={150} style={{ position: 'absolute', left: '4%', top: '44px' }} />
      <div style={{ maxWidth: '1100px', marginInline: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          {eyebrow && <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: '20px', color: BLUE }}>{eyebrow}</span>}
          <h2 style={{ margin: '6px 0 0', fontFamily: BOLD, fontWeight: 900, fontSize: 'clamp(32px, 4.6vw, 54px)', lineHeight: 1.05, letterSpacing: '-.02em', color: INK }}>{title} {highlight && <span style={marker}>{highlight}</span>}</h2>
          {subtitle && <p style={{ margin: '14px auto 0', maxWidth: '46ch', fontSize: '18px', lineHeight: 1.6, color: '#3B4A68', fontFamily: 'var(--runly-font-sans)' }}>{subtitle}</p>}
        </div>
        <div style={{ marginTop: '64px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '28px', alignItems: 'start' }}>
          {items.map((p, i) => {
            const hot = Boolean(p.badge)
            return (
              <div key={`${p.name}-${i}`} className="plan" style={{ '--r': hot ? '0deg' : i % 2 ? '1deg' : '-1deg', position: 'relative', marginTop: hot ? '-20px' : 0, padding: '34px 28px 28px', background: hot ? NAVY : '#fff', color: hot ? '#fff' : INK, border: '3px solid #0F2347', borderRadius: '26px', boxShadow: hot ? '10px 11px 0 #FBBF24' : '7px 8px 0 #0F2347', transform: 'rotate(var(--r))' }}>
                {hot && <span style={{ position: 'absolute', top: '-18px', right: '22px', fontFamily: HAND, fontWeight: 700, fontSize: '16px', background: YELLOW, color: '#0F2347', border: '2px solid #0F2347', borderRadius: '999px', padding: '5px 16px', transform: 'rotate(3deg)' }}>{p.badge}</span>}
                <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: '20px', color: hot ? '#FBBF24' : BLUE }}>{p.name}</div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'flex-start', gap: '4px', fontFamily: BOLD, fontWeight: 900, lineHeight: 1 }}>
                  <span style={{ fontSize: '24px', marginTop: '8px' }}>{currency}</span><span style={{ fontSize: '60px', letterSpacing: '-.03em' }}>{p.price}</span>
                </div>
                {p.description && <p style={{ margin: '12px 0 0', fontFamily: 'var(--runly-font-sans)', fontSize: '15px', color: hot ? 'rgba(255,255,255,.85)' : '#47536B' }}>{p.description}</p>}
                <a className="cta" href={ctaHref || '#'} style={{ display: 'block', margin: '22px 0', textAlign: 'center', padding: '13px 18px', borderRadius: '999px', fontFamily: BOLD, fontWeight: 900, fontSize: '16px', textDecoration: 'none', background: hot ? YELLOW : BLUE, color: hot ? '#0F2347' : '#fff', border: `2px solid ${hot ? '#fff' : '#0F2347'}`, boxShadow: `3px 3px 0 ${hot ? '#fff' : '#0F2347'}` }}>{ctaLabel}</a>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px', fontFamily: 'var(--runly-font-sans)', fontSize: '15px' }}>
                  {p.features.map((f) => <li key={f} style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}><span aria-hidden="true" style={{ fontWeight: 900, color: hot ? '#FBBF24' : BLUE }}>✓</span>{f}</li>)}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const MayaPlansBlock = defineBlock({
  type: 'MayaPlansBlock',
  label: 'Maya: paquetes de precios',
  category: 'atlas',
  defaultProps: { eyebrow: 'Paquetes', title: 'Simples, con gran', highlight: 'impacto', subtitle: 'Soluciones flexibles para negocios en cada etapa.', currency: '$', ctaLabel: 'Empezar', ctaHref: '/contacto', plans: 'Inicial|750\nIdeal para proyectos pequeños\nSitio de 3 páginas\nSEO básico\n---\nCrecimiento|1,350|Más popular\nPara negocios en crecimiento\nHasta 7 páginas\nSEO completo' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra resaltada' }, subtitle: { type: 'textarea', label: 'Descripción' },
    currency: { type: 'text', label: 'Moneda' }, ctaLabel: { type: 'text', label: 'Texto del botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
    plans: { type: 'textarea', label: 'Planes (Nombre|Precio|Insignia opcional, descripción y características por línea; separa con ---)' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'subtitle'] }, { label: 'Planes', fields: ['plans', 'currency', 'ctaLabel', 'ctaHref'] }],
  render: (props) => <Plans {...props} />,
})
