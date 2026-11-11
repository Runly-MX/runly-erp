import { useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { G, WRAP, cells, lines, safeHref, useReveal, ImStyle, Section, Heading, Btn, Icon, Avatar, CurlyArrow, ServiceArt } from './impulsaArt.jsx'
import { Stat } from './impulsaBlocks.jsx'

// Closing, inner-page and conversion blocks of the "Impulsa" template.

// ---------------------------------------------------------------------------------------------------------------
export const ImTestimonialCtaBlock = defineBlock({
  type: 'ImTestimonialCtaBlock',
  label: 'Testimonio con llamado a la acción',
  category: 'atlas',
  defaultProps: {
    quote: 'Impulsa transformó nuestra presencia en línea: en solo tres meses generamos 200% más prospectos. Totalmente recomendados.',
    name: 'Mariana López', role: 'Directora, Grupo Sereno',
    ctaTitle: '¿Listo para hacer crecer tu negocio?', ctaText: 'Construyamos juntos algo extraordinario.', ctaLabel: 'Pide tu propuesta gratis', ctaHref: '/contacto',
  },
  fields: {
    quote: { type: 'textarea', label: 'Testimonio' }, name: { type: 'text', label: 'Nombre' }, role: { type: 'text', label: 'Cargo y empresa' },
    ctaTitle: { type: 'text', label: 'Título del llamado' }, ctaText: { type: 'text', label: 'Texto del llamado' }, ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  groups: [{ label: 'Testimonio', fields: ['quote', 'name', 'role'] }, { label: 'Llamado a la acción', fields: ['ctaTitle', 'ctaText', 'ctaLabel', 'ctaHref'] }],
  render: (props) => <TestimonialCta {...props} />,
})
function TestimonialCta({ quote, name, role, ctaTitle, ctaText, ctaLabel, ctaHref }) {
  const [ref, rv] = useReveal(0.3)
  return (
    <Section innerRef={ref} rv={rv} pad="clamp(20px, 3vw, 36px)">
      <div style={{ position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', borderRadius: '28px', background: `linear-gradient(110deg, #2C8A3F 0%, ${G.greenHex} 48%, ${G.forest} 52%, ${G.forest2} 100%)`, color: '#fff' }}>
        <figure className="im-rv l" style={{ margin: 0, display: 'flex', gap: '22px', alignItems: 'center', padding: 'clamp(26px, 4vw, 44px)' }}>
          <Avatar name={name} size={92} />
          <div>
            <Icon name="quote" size={28} color={G.lime} stroke={1.6} />
            <blockquote style={{ margin: '8px 0 0', fontSize: 'clamp(16px, 1.6vw, 19px)', fontWeight: 600, lineHeight: 1.55 }}>{quote}</blockquote>
            <figcaption style={{ marginTop: '14px', fontSize: '14px' }}><strong>{name}</strong><span style={{ display: 'block', color: 'rgba(255,255,255,.72)' }}>{role}</span></figcaption>
          </div>
        </figure>
        <div className="im-rv r" style={{ '--i': 1, position: 'relative', padding: 'clamp(26px, 4vw, 44px)' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(24px, 2.6vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{ctaTitle}</h2>
          <p style={{ margin: '10px 0 22px', color: 'rgba(255,255,255,.78)' }}>{ctaText}</p>
          <Btn href={ctaHref} variant="light">{ctaLabel}</Btn>
          <CurlyArrow color={G.lime} style={{ position: 'absolute', right: 'clamp(16px, 4vw, 48px)', bottom: '26%', width: 'clamp(70px, 9vw, 110px)' }} />
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The form itself is a ContactFormBlock in the `form` slot ('@newsletter' in the template becomes a site form).
export const ImNewsletterBlock = defineBlock({
  type: 'ImNewsletterBlock',
  label: 'Boletín con formulario',
  category: 'atlas',
  slots: { form: {} },
  defaultProps: { title: 'Mantente al día con ideas digitales', text: 'Suscríbete y recibe cada mes los últimos consejos, tendencias y estrategias en tu correo.' },
  fields: { title: { type: 'text', label: 'Título' }, text: { type: 'textarea', label: 'Texto' } },
  render: ({ title, text, ctx }) => <Newsletter title={title} text={text} form={ctx?.slot?.('form')} />,
})
function Newsletter({ title, text, form }) {
  const [ref, rv] = useReveal(0.3)
  return (
    <Section innerRef={ref} rv={rv} pad="clamp(20px, 3vw, 36px)">
      <div className="im-rv" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px', alignItems: 'center', padding: 'clamp(22px, 3vw, 34px)', borderRadius: '24px', background: G.soft, border: `1px solid ${G.line}` }}>
        <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
          <div aria-hidden="true" style={{ position: 'relative', flexShrink: 0, width: '74px', height: '64px' }}>
            <ServiceArt kind="email" />
            <svg className="im-plane" viewBox="0 0 24 24" width="22" style={{ position: 'absolute', right: '-18px', top: '-10px' }}><path d="M3 11.5L21 3l-6 18-3.5-7.5z" fill={G.leaf} /></svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2vw, 22px)', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h2>
            <p style={{ margin: '6px 0 0', fontSize: '15px', lineHeight: 1.6, color: G.muted }}>{text}</p>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>{form}</div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const ImPageHeroBlock = defineBlock({
  type: 'ImPageHeroBlock',
  label: 'Encabezado de página Impulsa',
  category: 'atlas',
  defaultProps: { eyebrow: 'Servicios', title: 'Todo lo que necesitas para', highlight: 'crecer en línea', text: 'Estrategia, contenido, campañas y medición en un solo equipo.', crumb: 'Servicios' },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, text: { type: 'textarea', label: 'Texto' }, crumb: { type: 'text', label: 'Nombre en la ruta de navegación' } },
  render({ eyebrow, title, highlight, text, crumb }) {
    return (
      <section className="im" data-rv="in" style={{ position: 'relative', overflow: 'hidden', background: `radial-gradient(900px 380px at 50% -20%, ${G.mint}, transparent 65%), #fff`, padding: 'clamp(48px, 7vw, 96px) 0 clamp(36px, 5vw, 64px)', textAlign: 'center' }}>
        <ImStyle />
        <div aria-hidden="true" className="im-float" style={{ position: 'absolute', left: '8%', top: '22%', width: '64px', height: '64px', borderRadius: '20px', background: G.mintDeep, transform: 'rotate(12deg)', opacity: 0.7 }} />
        <div aria-hidden="true" className="im-float" style={{ position: 'absolute', right: '10%', top: '30%', width: '38px', height: '38px', borderRadius: '50%', border: `3px solid ${G.lime}`, animationDelay: '-3s' }} />
        <div aria-hidden="true" className="im-orb" style={{ position: 'absolute', right: '-80px', bottom: '-120px', width: '280px', height: '280px', borderRadius: '50%', background: `radial-gradient(circle, ${G.mintDeep}, transparent 70%)` }} />
        <div style={{ ...WRAP, position: 'relative', maxWidth: '820px' }}>
          {crumb && <nav aria-label="Ruta" style={{ fontSize: '13px', color: G.muted }}><a href="/" style={{ color: G.greenHex, fontWeight: 600, textDecoration: 'none' }}>Inicio</a> <span aria-hidden="true">/</span> <span aria-current="page">{crumb}</span></nav>}
          {eyebrow && <p className="im-eyebrow" style={{ marginTop: '18px' }}>{eyebrow}</p>}
          <h1 style={{ margin: '12px 0 0', fontSize: 'clamp(34px, 5vw, 58px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.06 }}>{title} <span className="im-hl">{highlight}</span></h1>
          {text && <p className="im-lead" style={{ maxWidth: '60ch', marginInline: 'auto' }}>{text}</p>}
        </div>
      </section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
export const ImAboutBlock = defineBlock({
  type: 'ImAboutBlock',
  label: 'Nosotros con valores',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Quiénes somos', title: 'Un equipo obsesionado con', highlight: 'tu crecimiento',
    body: 'Nacimos en 2015 con una idea sencilla: el marketing digital debe medirse en ventas, no en «me gusta». Hoy somos estrategas, creativos y analistas que trabajan como una extensión de tu equipo.',
    checks: 'Estrategias basadas en datos, no en corazonadas\nReportes claros cada mes, sin letra pequeña\nUn equipo dedicado que conoce tu negocio',
    values: 'Transparencia | Sabes qué hacemos, cuánto cuesta y qué resultados trae. | shield\nVelocidad | Probamos rápido, aprendemos y escalamos lo que funciona. | bolt\nCercanía | Hablas con personas, no con tickets. | chat',
    figures: '10+ | años\n150+ | clientes\n24 | especialistas',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, body: { type: 'textarea', label: 'Texto' },
    checks: { type: 'textarea', label: 'Puntos destacados (uno por línea)' }, values: { type: 'textarea', label: 'Valores (Título | texto | icono)' }, figures: { type: 'textarea', label: 'Cifras (Cifra | texto)' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'body', 'checks'] }, { label: 'Valores y cifras', fields: ['values', 'figures'] }],
  render: (props) => <About {...props} />,
})
function About({ eyebrow, title, highlight, body, checks, values, figures }) {
  const [ref, rv] = useReveal()
  return (
    <Section innerRef={ref} rv={rv}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'clamp(28px, 5vw, 64px)', alignItems: 'center' }}>
        <div>
          <Heading eyebrow={eyebrow} title={title} highlight={highlight} center={false} />
          <p className="im-lead im-rv" style={{ '--i': 2 }}>{body}</p>
          <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'grid', gap: '12px' }}>
            {lines(checks).map((item, index) => (
              <li key={item} className="im-rv l" style={{ '--i': index + 3, display: 'flex', gap: '12px', alignItems: 'flex-start', fontWeight: 600 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: '26px', height: '26px', borderRadius: '50%', background: G.mint, color: G.greenHex, flexShrink: 0 }}><Icon name="check" size={15} stroke={3} /></span>{item}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '28px', display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px, 4vw, 40px)' }}>
            {cells(figures).map(([value, label], index) => (
              <div key={label + index} className="im-rv" style={{ '--i': index + 5 }}>
                <p style={{ margin: 0, fontSize: '34px', fontWeight: 800, letterSpacing: '-0.03em', color: G.greenHex }}><Stat raw={value} active={rv === 'in'} /></p>
                <p style={{ margin: 0, fontSize: '14px', color: G.muted }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: '14px' }}>
          {cells(values).map(([name, text, icon], index) => (
            <article key={name + index} className="im-rv r" style={{ '--i': index + 1, display: 'flex', gap: '16px', padding: '20px 22px', borderRadius: '20px', background: [G.mint, G.blue, G.amber][index % 3], marginLeft: `${(index % 2) * 28}px`, transition: 'transform .3s ease' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '46px', height: '46px', borderRadius: '14px', background: '#fff', color: G.greenHex, flexShrink: 0 }}><Icon name={icon} size={22} /></span>
              <div><h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>{name}</h3><p style={{ margin: '4px 0 0', fontSize: '15px', lineHeight: 1.55, color: G.muted }}>{text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const ImServiceDetailBlock = defineBlock({
  type: 'ImServiceDetailBlock',
  label: 'Detalle de servicios alternado',
  category: 'atlas',
  defaultProps: {
    items: 'Posicionamiento SEO | Auditoría técnica, contenido que responde lo que tu cliente busca y enlaces de calidad. | Auditoría técnica completa; Estrategia de palabras clave; Contenido optimizado cada mes\nPublicidad digital | Campañas en buscadores y redes con presupuesto controlado y retorno medido. | Campañas en Google y Meta; Pruebas A/B de anuncios; Reporte de retorno semanal\nRedes sociales | Calendario editorial, diseño y comunidad para que tu marca converse todos los días. | Calendario y diseño de piezas; Gestión de comunidad; Colaboraciones con creadores\nEmail marketing | Flujos automáticos que nutren prospectos y recuperan ventas. | Bienvenida y carritos abandonados; Segmentación por comportamiento; Boletines con diseño propio',
  },
  fields: { items: { type: 'textarea', label: 'Servicios (Título | texto | punto; punto; punto)' } },
  render: (props) => <ServiceDetail {...props} />,
})
const KINDS = ['seo', 'ads', 'social', 'email']
const TONES = [G.mint, G.blue, G.violet, G.amber]
function ServiceDetailRow({ name, text, points, index }) {
  const [ref, rv] = useReveal(0.25)
  const flip = index % 2 === 1
  return (
    <div ref={ref} data-rv={rv} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'clamp(24px, 5vw, 64px)', alignItems: 'center' }}>
      <div className={`im-rv ${flip ? 'r' : 'l'}`} style={{ order: flip ? 2 : 0, display: 'grid', placeItems: 'center', aspectRatio: '4 / 3', borderRadius: '28px', background: TONES[index % 4] }}>
        <div className="im-float" style={{ width: '46%', animationDelay: `${-index * 1.3}s` }}><ServiceArt kind={KINDS[index % 4]} /></div>
      </div>
      <div className={`im-rv ${flip ? 'l' : 'r'}`} style={{ '--i': 1 }}>
        <p className="im-eyebrow">{String(index + 1).padStart(2, '0')}</p>
        <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(24px, 2.6vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em' }}>{name}</h2>
        <p className="im-lead">{text}</p>
        <ul style={{ listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'grid', gap: '10px' }}>
          {points.map((point) => <li key={point} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 600 }}><Icon name="check" size={18} stroke={3} color={G.leaf} />{point}</li>)}
        </ul>
      </div>
    </div>
  )
}
function ServiceDetail({ items }) {
  return (
    <Section>
      <div style={{ display: 'grid', gap: 'clamp(48px, 7vw, 96px)' }}>
        {cells(items).map(([name, text, points], index) => <ServiceDetailRow key={name + index} name={name} text={text} points={String(points ?? '').split(';').map((p) => p.trim()).filter(Boolean)} index={index} />)}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const PRICING_CSS = `
.im-price .switch{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:5px;border-radius:999px;background:${G.soft};border:1px solid ${G.line}}
.im-price .switch button{position:relative;z-index:1;min-height:42px;padding:0 20px;border:0;background:transparent;font:inherit;font-weight:700;font-size:14px;color:${G.muted};cursor:pointer;transition:color .3s}
.im-price .switch button[aria-pressed="true"]{color:#fff}
.im-price .knob{position:absolute;top:5px;bottom:5px;left:5px;width:calc(50% - 5px);border-radius:999px;background:${G.greenHex};transition:transform .4s cubic-bezier(.3,1.3,.5,1)}
.im-price .plan{position:relative;display:flex;flex-direction:column;padding:30px 26px;border-radius:26px;background:#fff;border:1px solid ${G.line};transition:transform .35s ease,box-shadow .35s ease}
.im-price .plan:hover{transform:translateY(-8px);box-shadow:0 34px 60px -36px rgba(15,59,34,.5)}
.im-price .plan.hot{background:linear-gradient(160deg,${G.forest},${G.forest2});color:#fff;border-color:transparent;box-shadow:0 30px 60px -30px rgba(15,59,34,.7)}
.im-price .amount{display:inline-block;transition:opacity .25s,transform .25s}
.im-price .amount.swap{opacity:0;transform:translateY(-8px)}
`
export const ImPricingBlock = defineBlock({
  type: 'ImPricingBlock',
  label: 'Planes y precios',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Planes', title: 'Planes claros para', highlight: 'cada etapa', lead: 'Sin contratos forzosos. Cambia o cancela cuando quieras.',
    currency: '$', period: '/mes', yearlyLabel: 'Anual · 2 meses gratis',
    plans: 'Despegue | 9,900 | 8,250 | Para negocios que empiezan en digital. | SEO local; 2 redes sociales; Reporte mensual | Empezar | /contacto\nCrecimiento | 18,900 | 15,750 | El favorito para acelerar ventas. | SEO completo; Publicidad digital; 3 redes sociales; Email marketing | Elegir plan | /contacto | popular\nEscala | 34,900 | 29,080 | Para marcas que quieren dominar su mercado. | Todo lo de Crecimiento; Estratega dedicado; Reportes semanales; Pruebas y optimización continua | Hablar con ventas | /contacto',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, lead: { type: 'textarea', label: 'Descripción' },
    currency: { type: 'text', label: 'Moneda' }, period: { type: 'text', label: 'Periodo' }, yearlyLabel: { type: 'text', label: 'Etiqueta del pago anual' },
    plans: { type: 'textarea', label: 'Planes (Nombre | precio mensual | precio anual por mes | texto | punto; punto | botón | /enlace | popular)' },
  },
  groups: [{ label: 'Encabezado', fields: ['eyebrow', 'title', 'highlight', 'lead'] }, { label: 'Planes', fields: ['currency', 'period', 'yearlyLabel', 'plans'] }],
  render: (props) => <Pricing {...props} />,
})
function Pricing({ eyebrow, title, highlight, lead, currency, period, yearlyLabel, plans }) {
  const [ref, rv] = useReveal()
  const [yearly, setYearly] = useState(false)
  const [swap, setSwap] = useState(false)
  const choose = (next) => { if (next === yearly) return; setSwap(true); setTimeout(() => { setYearly(next); setSwap(false) }, 180) }
  return (
    <Section innerRef={ref} rv={rv}>
      <style>{PRICING_CSS}</style>
      <div className="im-price">
        <Heading eyebrow={eyebrow} title={title} highlight={highlight} lead={lead} />
        <div className="im-rv" style={{ '--i': 3, display: 'flex', justifyContent: 'center', marginTop: '26px' }}>
          <div className="switch" role="group" aria-label="Forma de pago">
            <span className="knob" aria-hidden="true" style={{ transform: yearly ? 'translateX(100%)' : 'none' }} />
            <button type="button" aria-pressed={!yearly} onClick={() => choose(false)}>Mensual</button>
            <button type="button" aria-pressed={yearly} onClick={() => choose(true)}>{yearlyLabel}</button>
          </div>
        </div>
        <div style={{ marginTop: '38px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px', alignItems: 'stretch' }}>
          {cells(plans).map(([name, monthly, annual, text, points, cta, href, flag], index) => {
            const hot = flag === 'popular'
            return (
              <article key={name + index} className={`plan im-rv${hot ? ' hot' : ''}`} style={{ '--i': index + 3 }}>
                {hot && <span className="im-pulse" style={{ position: 'absolute', top: '-13px', left: '50%', translate: '-50% 0', padding: '6px 14px', borderRadius: '999px', background: G.leaf, color: G.forest, fontSize: '12px', fontWeight: 800 }}>Más popular</span>}
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>{name}</h3>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: hot ? 'rgba(255,255,255,.75)' : G.muted }}>{text}</p>
                <p aria-live="polite" style={{ margin: '22px 0 0', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className={`amount${swap ? ' swap' : ''}`} style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '-0.04em' }}>{currency}{yearly ? annual : monthly}</span>
                  <span style={{ fontSize: '15px', color: hot ? 'rgba(255,255,255,.75)' : G.muted }}>{period}</span>
                </p>
                <ul style={{ listStyle: 'none', margin: '22px 0 26px', padding: 0, display: 'grid', gap: '11px', fontSize: '15px' }}>
                  {String(points ?? '').split(';').map((p) => p.trim()).filter(Boolean).map((point) => (
                    <li key={point} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '50%', background: hot ? 'rgba(143,217,154,.2)' : G.mint, color: hot ? G.lime : G.greenHex, flexShrink: 0 }}><Icon name="check" size={13} stroke={3} /></span>{point}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 'auto' }}><Btn href={href} variant={hot ? 'leaf' : 'solid'}>{cta}</Btn></div>
              </article>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const FAQ_CSS = `
.im-faq details{border:1px solid ${G.line};border-radius:18px;background:#fff;transition:background .3s,border-color .3s}
.im-faq details[open]{background:${G.soft};border-color:${G.mintDeep}}
.im-faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:60px;padding:14px 20px;font-weight:700;font-size:16px}
.im-faq summary::-webkit-details-marker{display:none}
.im-faq summary i{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:${G.mint};color:${G.greenHex};flex-shrink:0;transition:transform .35s cubic-bezier(.3,1.4,.5,1),background .3s}
.im-faq details[open] summary i{transform:rotate(135deg);background:${G.greenHex};color:#fff}
.im-faq .ans{padding:0 20px 18px;color:${G.muted};line-height:1.7}
@media (prefers-reduced-motion:no-preference){.im-faq details[open] .ans{animation:im-pop .4s ease both}}
`
export const ImFaqBlock = defineBlock({
  type: 'ImFaqBlock',
  label: 'Preguntas frecuentes',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Preguntas frecuentes', title: 'Resolvemos tus', highlight: 'dudas',
    items: '¿En cuánto tiempo veo resultados? | La publicidad da resultados desde la primera semana; el SEO suele mostrar crecimiento sostenido entre el tercer y el sexto mes.\n¿Hay plazo forzoso? | No. Los planes son mensuales y puedes cancelar con 30 días de aviso.\n¿El presupuesto de anuncios está incluido? | No: el presupuesto de pauta lo pagas directo a cada plataforma y nosotros lo administramos.\n¿Cómo me entero de los avances? | Recibes un reporte claro cada mes y tienes una reunión de seguimiento con tu estratega.',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, items: { type: 'textarea', label: 'Preguntas (Pregunta | respuesta, una por línea)' } },
  render: (props) => <Faq {...props} />,
})
function Faq({ eyebrow, title, highlight, items }) {
  const [ref, rv] = useReveal()
  return (
    <Section innerRef={ref} rv={rv} bg={G.soft}>
      <style>{FAQ_CSS}</style>
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} />
      <div className="im-faq" style={{ maxWidth: '820px', margin: '36px auto 0', display: 'grid', gap: '12px' }}>
        {cells(items).map(([question, answer], index) => (
          <details key={question + index} className="im-rv" style={{ '--i': index + 2 }} open={index === 0}>
            <summary>{question}<i aria-hidden="true"><Icon name="plus" size={16} stroke={2.6} /></i></summary>
            <p className="ans" style={{ margin: 0 }}>{answer}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const ImChannelsBlock = defineBlock({
  type: 'ImChannelsBlock',
  label: 'Canales de contacto',
  category: 'atlas',
  defaultProps: { channels: 'Correo | hola@example.com | mailto:hola@example.com | mail\nTeléfono | +52 33 1234 5678 | tel:+523312345678 | phone\nOficina | Av. Chapultepec 123, Guadalajara | # | pin\nHorario | Lunes a viernes, 9:00 a 18:00 | # | clock' },
  fields: { channels: { type: 'textarea', label: 'Canales (Título | dato | enlace | icono, uno por línea)' } },
  render: (props) => <Channels {...props} />,
})
function Channels({ channels }) {
  const [ref, rv] = useReveal()
  return (
    <Section innerRef={ref} rv={rv} pad="clamp(32px, 4vw, 56px)">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '16px' }}>
        {cells(channels).map(([name, value, href, icon], index) => {
          const link = href && href !== '#'
          const Tag = link ? 'a' : 'div'
          return (
            <Tag key={name + index} href={link ? safeHref(href) : undefined} className="im-rv" style={{ '--i': index, display: 'flex', gap: '14px', alignItems: 'center', padding: '20px', borderRadius: '20px', border: `1px solid ${G.line}`, background: '#fff', color: G.ink, textDecoration: 'none', transition: 'transform .3s ease, box-shadow .3s ease' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '16px', background: G.mint, color: G.greenHex, flexShrink: 0 }}><Icon name={icon} size={22} /></span>
              <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: '13px', color: G.muted }}>{name}</span><strong style={{ display: 'block', fontSize: '15px', overflowWrap: 'anywhere' }}>{value}</strong></span>
            </Tag>
          )
        })}
      </div>
    </Section>
  )
}
