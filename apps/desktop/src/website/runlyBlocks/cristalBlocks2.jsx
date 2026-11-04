import { useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { cells, safeHref, useReveal, usePointerVars, useScrollVar, Icon } from './blockKit.jsx'
import { C, WRAP, CrStyle, Btn, Blobs, Section, Heading, SkyScene, Orb } from './cristalArt.jsx'

// Conversion, inner-page and footer blocks of the "Aura" template.
const splitList = (raw) => String(raw ?? '').split(';').map((item) => item.trim()).filter(Boolean)

// ---------------------------------------------------------------------------------------------------------------
const PRICE_CSS = `
.cr-price .switch{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:5px;border-radius:999px}
.cr-price .switch button{position:relative;z-index:1;min-height:42px;padding:0 20px;border:0;background:transparent;font:inherit;font-weight:700;font-size:14px;color:${C.muted};cursor:pointer;transition:color .3s}
.cr-price .switch button[aria-pressed="true"]{color:${C.ink}}
.cr-price .knob{position:absolute;top:5px;bottom:5px;left:5px;width:calc(50% - 5px);border-radius:999px;background:#fff;box-shadow:0 6px 16px -6px rgba(20,70,150,.45);transition:transform .45s cubic-bezier(.3,1.3,.5,1)}
.cr-price .plan{display:flex;flex-direction:column;padding:30px 26px;border-radius:30px;transition:transform .4s cubic-bezier(.2,.7,.2,1)}
.cr-price .plan:hover{transform:translateY(-8px)}
.cr-price .hot{position:relative;padding:2px;border-radius:32px;background:conic-gradient(from var(--a,0deg),${C.cyan},${C.sky},${C.violet},#FF8AD8,${C.cyan})}
.cr-price .hot>.plan{height:100%}
.cr-price .amount{display:inline-block;transition:opacity .25s,transform .25s,filter .25s}
.cr-price .amount.swap{opacity:0;transform:translateY(-10px);filter:blur(6px)}
@property --a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes cr-border{to{--a:360deg}}
@media (prefers-reduced-motion:no-preference){.cr-price .hot{animation:cr-border 6s linear infinite}}
`
export const CrPricingBlock = defineBlock({
  type: 'CrPricingBlock',
  label: 'Planes de vidrio',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Planes', title: 'Elige cómo quieres', highlight: 'cuidarte', lead: 'Empieza gratis. Cambia de plan o cancela cuando quieras.',
    currency: '$', period: '/mes', yearlyLabel: 'Anual · ahorra 20%',
    plans: 'Esencial | 0 | 0 | Para empezar a conocerte. | Conversación con Aura; Registro de sueño; Recordatorios básicos | Descargar gratis | /contacto\nPlus | 129 | 99 | Para avanzar con un plan diario. | Todo lo de Esencial; Plan personalizado; Modo voz ilimitado; Tendencias semanales | Probar 14 días | /contacto | popular\nFamilia | 249 | 199 | Hasta 5 personas en una sola cuenta. | Todo lo de Plus; 5 perfiles; Metas compartidas; Soporte prioritario | Elegir Familia | /contacto',
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
  const choose = (next) => { if (next === yearly) return; setSwap(true); setTimeout(() => { setYearly(next); setSwap(false) }, 200) }
  return (
    <Section innerRef={ref} rv={rv} blobs="day">
      <style>{PRICE_CSS}</style>
      <div className="cr-price">
        <Heading eyebrow={eyebrow} title={title} highlight={highlight} lead={lead} />
        <div className="cr-rv" style={{ '--i': 3, display: 'flex', justifyContent: 'center', marginTop: '28px' }}>
          <div className="switch cr-glass" role="group" aria-label="Forma de pago">
            <span className="knob" aria-hidden="true" style={{ transform: yearly ? 'translateX(100%)' : 'none' }} />
            <button type="button" aria-pressed={!yearly} onClick={() => choose(false)}>Mensual</button>
            <button type="button" aria-pressed={yearly} onClick={() => choose(true)}>{yearlyLabel}</button>
          </div>
        </div>
        <div style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px', alignItems: 'stretch' }}>
          {cells(plans).map(([name, monthly, annual, text, points, cta, href, flag], index) => {
            const hot = flag === 'popular'
            const card = (
              <article className="plan cr-glass" style={{ '--sheen': `${index * 1.5}s`, ...(hot ? { background: 'linear-gradient(150deg, rgba(255,255,255,.85), rgba(235,244,255,.6))' } : {}) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{name}</h3>
                  {hot && <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, color: '#fff', background: `linear-gradient(90deg, ${C.sky}, ${C.violet})` }}>Más elegido</span>}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: C.muted }}>{text}</p>
                <p aria-live="polite" style={{ margin: '22px 0 0', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className={`amount${swap ? ' swap' : ''}`} style={{ fontSize: '46px', fontWeight: 700, letterSpacing: '-0.04em' }}>{currency}{yearly ? annual : monthly}</span>
                  <span style={{ fontSize: '15px', color: C.muted }}>{period}</span>
                </p>
                <ul style={{ listStyle: 'none', margin: '22px 0 26px', padding: 0, display: 'grid', gap: '11px', fontSize: '15px' }}>
                  {splitList(points).map((point) => <li key={point} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(47,139,255,.14)', color: C.blueHex, flexShrink: 0 }}><Icon name="check" size={13} stroke={3} /></span>{point}</li>)}
                </ul>
                <div style={{ marginTop: 'auto' }}><Btn href={href} variant={hot ? 'solid' : 'glass'}>{cta}</Btn></div>
              </article>
            )
            return <div key={name + index} className={`cr-rv${hot ? ' hot' : ''}`} style={{ '--i': index + 3, display: 'grid' }}>{card}</div>
          })}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const FAQ_CSS = `
.cr-faq details{border-radius:22px;transition:background .3s}
.cr-faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:62px;padding:14px 22px;font-weight:700;font-size:16px}
.cr-faq summary::-webkit-details-marker{display:none}
.cr-faq summary i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.8);color:${C.blueHex};flex-shrink:0;transition:transform .4s cubic-bezier(.3,1.4,.5,1),background .3s,color .3s}
.cr-faq details[open] summary i{transform:rotate(135deg);background:${C.blueHex};color:#fff}
.cr-faq .ans{margin:0;padding:0 22px 20px;color:${C.muted};line-height:1.7}
`
export const CrFaqBlock = defineBlock({
  type: 'CrFaqBlock',
  label: 'Preguntas frecuentes de vidrio',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Preguntas frecuentes', title: 'Lo que más nos', highlight: 'preguntan',
    items: '¿Aura sustituye a un médico? | No. Aura te orienta y te ayuda a crear hábitos; ante cualquier síntoma o duda de salud consulta a un profesional.\n¿Mis datos están seguros? | Tus datos se cifran y nunca se venden. Puedes descargarlos o borrarlos cuando quieras.\n¿Funciona con mi reloj? | Sí, se conecta con los relojes y apps de salud más comunes para leer sueño y ritmo cardiaco.\n¿Puedo cancelar en cualquier momento? | Sí, desde la app y sin penalizaciones.',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, items: { type: 'textarea', label: 'Preguntas (Pregunta | respuesta)' } },
  render: (props) => <Faq {...props} />,
})
function Faq({ eyebrow, title, highlight, items }) {
  const [ref, rv] = useReveal()
  return (
    <Section innerRef={ref} rv={rv} blobs="day" bg="#EEF5FF">
      <style>{FAQ_CSS}</style>
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} />
      <div className="cr-faq" style={{ maxWidth: '820px', margin: '36px auto 0', display: 'grid', gap: '12px' }}>
        {cells(items).map(([question, answer], index) => (
          <details key={question + index} className="cr-glass cr-rv" style={{ '--i': index + 2, '--sheen': `${index * 1.4}s` }} open={index === 0}>
            <summary>{question}<i aria-hidden="true"><Icon name="plus" size={16} stroke={2.6} /></i></summary>
            <p className="ans">{answer}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Night-sky closing band with the big orb; `form` slot holds the newsletter ContactFormBlock.
export const CrClosingBlock = defineBlock({
  type: 'CrClosingBlock',
  label: 'Cierre con orbe y boletín',
  category: 'atlas',
  slots: { form: {} },
  defaultProps: {
    title: 'Empieza a sentirte mejor', highlight: 'desde hoy', text: 'Descarga Aura gratis y recibe tu primer plan en menos de dos minutos.',
    ctaLabel: 'Descargar para iPhone', ctaHref: '/precios', ctaSecondLabel: 'Descargar para Android', ctaSecondHref: '/precios', formTitle: 'Recibe ideas de bienestar cada semana',
  },
  fields: {
    title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, text: { type: 'textarea', label: 'Texto' },
    ctaLabel: { type: 'text', label: 'Botón 1' }, ctaHref: { type: 'link', label: 'Enlace 1' }, ctaSecondLabel: { type: 'text', label: 'Botón 2' }, ctaSecondHref: { type: 'link', label: 'Enlace 2' }, formTitle: { type: 'text', label: 'Título del boletín' },
  },
  groups: [{ label: 'Contenido', fields: ['title', 'highlight', 'text'] }, { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] }, { label: 'Boletín', fields: ['formTitle'] }],
  render: ({ ctx, ...props }) => <Closing {...props} form={ctx?.slot?.('form')} />,
})
function Closing({ title, highlight, text, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, formTitle, form }) {
  const [ref, rv] = useReveal(0.25)
  const pointer = usePointerVars()
  return (
    <section ref={(node) => { ref.current = node; pointer.current = node }} data-rv={rv} className="cr" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(72px, 9vw, 120px) 0', background: 'radial-gradient(900px 500px at 50% 0%, #1F4FA8 0%, #0D2557 55%, #081634 100%)', color: '#fff', textAlign: 'center' }}>
      <CrStyle />
      <Blobs tone="night" />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.7) 1px, transparent 1.4px)', backgroundSize: '90px 90px', opacity: 0.25 }} />
      <div style={{ ...WRAP, position: 'relative', maxWidth: '860px' }}>
        <div className="cr-rv" style={{ display: 'flex', justifyContent: 'center', transform: 'translate(calc((var(--mx,.5) - .5) * 26px), calc((var(--my,.5) - .5) * 26px))', transition: 'transform .6s ease-out' }}><Orb size={140} /></div>
        <h2 className="cr-rv" style={{ '--i': 1, margin: '34px 0 0', fontSize: 'clamp(32px, 4.6vw, 58px)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.06 }}>{title} <span style={{ background: `linear-gradient(90deg, ${C.cyan}, #A9C7FF, #D7B8FF)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{highlight}</span></h2>
        <p className="cr-rv" style={{ '--i': 2, margin: '16px auto 0', maxWidth: '54ch', fontSize: '18px', lineHeight: 1.6, color: 'rgba(255,255,255,.75)' }}>{text}</p>
        <div className="cr-rv" style={{ '--i': 3, marginTop: '30px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
          <Btn href={ctaHref} variant="white" icon="device">{ctaLabel}</Btn>
          <a className="cr-btn cr-glass dark" href={safeHref(ctaSecondHref)} style={{ color: '#fff' }}>{ctaSecondLabel}<Icon name="device" size={17} /></a>
        </div>
        {form && (
          <div className="cr-glass dark cr-rv" style={{ '--i': 4, margin: '44px auto 0', maxWidth: '620px', padding: '22px', borderRadius: '26px', textAlign: 'left' }}>
            <p style={{ margin: '0 0 12px', fontWeight: 700 }}>{formTitle}</p>
            <div style={{ background: '#fff', color: C.ink, borderRadius: '18px', padding: '14px' }}>{form}</div>
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const CrPageHeroBlock = defineBlock({
  type: 'CrPageHeroBlock',
  label: 'Encabezado de página con cielo',
  category: 'atlas',
  defaultProps: { eyebrow: 'Funciones', title: 'Diseñada para', highlight: 'acompañarte', text: 'Una app que escucha, aprende y te ayuda a sentirte mejor un día a la vez.', crumb: 'Funciones' },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, text: { type: 'textarea', label: 'Texto' }, crumb: { type: 'text', label: 'Nombre en la ruta' } },
  render: (props) => <PageHero {...props} />,
})
function PageHero({ eyebrow, title, highlight, text, crumb }) {
  const scroll = useScrollVar(500)
  return (
    <section ref={scroll} className="cr" style={{ position: 'relative', overflow: 'hidden', marginTop: '-78px', padding: 'calc(78px + clamp(56px, 8vw, 110px)) 0 clamp(72px, 9vw, 120px)', textAlign: 'center' }}>
      <CrStyle />
      <SkyScene clouds={5} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(243,248,255,.1) 0%, rgba(243,248,255,.35) 60%, #F5F9FF 100%)' }} />
      <div style={{ ...WRAP, position: 'relative', maxWidth: '860px' }}>
        <div className="cr-glass" style={{ display: 'inline-block', padding: 'clamp(26px, 4vw, 44px)', borderRadius: '36px' }}>
          {crumb && <nav aria-label="Ruta" style={{ fontSize: '13px', fontWeight: 600, color: C.muted }}><a href="/" style={{ color: C.blueHex, textDecoration: 'none' }}>Inicio</a> <span aria-hidden="true">/</span> <span aria-current="page">{crumb}</span></nav>}
          {eyebrow && <p className="cr-eyebrow" style={{ marginTop: '16px' }}>{eyebrow}</p>}
          <h1 style={{ margin: '10px 0 0', fontSize: 'clamp(34px, 5vw, 62px)', fontWeight: 500, letterSpacing: '-0.045em', lineHeight: 1.05 }}>{title} <span className="cr-grad" style={{ fontWeight: 700 }}>{highlight}</span></h1>
          {text && <p className="cr-lead" style={{ maxWidth: '54ch', marginInline: 'auto', color: '#3E5072' }}>{text}</p>}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const CrContactBlock = defineBlock({
  type: 'CrContactBlock',
  label: 'Contacto de vidrio con formulario',
  category: 'atlas',
  slots: { form: {} },
  defaultProps: {
    title: 'Escríbenos', text: 'Resolvemos dudas sobre la app, planes para empresas y prensa. Respondemos en menos de un día hábil.',
    channels: 'Correo | hola@example.com | mailto:hola@example.com | mail\nTeléfono | +52 55 1234 5678 | tel:+525512345678 | phone\nOficina | Ciudad de México | # | pin\nHorario | Lunes a viernes, 9:00 a 18:00 | # | clock',
  },
  fields: { title: { type: 'text', label: 'Título' }, text: { type: 'textarea', label: 'Texto' }, channels: { type: 'textarea', label: 'Canales (Título | dato | enlace | icono)' } },
  render: ({ ctx, ...props }) => <Contact {...props} form={ctx?.slot?.('form')} />,
})
function Contact({ title, text, channels, form }) {
  const [ref, rv] = useReveal(0.15)
  return (
    <Section innerRef={ref} rv={rv} blobs="day" pad="clamp(40px, 6vw, 80px)">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '24px', alignItems: 'start' }}>
        <div>
          <h2 className="cr-h2 cr-rv" style={{ marginTop: 0 }}>{title}</h2>
          <p className="cr-lead cr-rv" style={{ '--i': 1 }}>{text}</p>
          <div style={{ marginTop: '24px', display: 'grid', gap: '12px' }}>
            {cells(channels).map(([name, value, href, icon], index) => {
              const link = href && href !== '#'
              const Tag = link ? 'a' : 'div'
              return (
                <Tag key={name + index} href={link ? safeHref(href) : undefined} className="cr-glass cr-rv" style={{ '--i': index + 2, display: 'flex', gap: '14px', alignItems: 'center', padding: '16px 18px', borderRadius: '22px', color: C.ink, textDecoration: 'none' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: '44px', height: '44px', borderRadius: '14px', background: 'rgba(47,139,255,.14)', color: C.blueHex, flexShrink: 0 }}><Icon name={icon} size={20} /></span>
                  <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: '13px', color: C.muted }}>{name}</span><strong style={{ display: 'block', fontSize: '15px', overflowWrap: 'anywhere' }}>{value}</strong></span>
                </Tag>
              )
            })}
          </div>
        </div>
        <div className="cr-glass cr-rv" style={{ '--i': 2, padding: 'clamp(20px, 3vw, 32px)', borderRadius: '30px' }}>
          {form ? <div style={{ background: '#fff', borderRadius: '20px', padding: '18px' }}>{form}</div> : <Btn href="mailto:hola@example.com">Escríbenos por correo</Btn>}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const CrFooterBlock = defineBlock({
  type: 'CrFooterBlock',
  label: 'Pie de página de vidrio',
  category: 'navigation',
  defaultProps: {
    brand: 'Aura', tagline: 'Tu asistente de bienestar con IA. Orienta, no diagnostica: ante cualquier síntoma consulta a un profesional de la salud.',
    columns: 'Producto\nFunciones | /funciones\nPrecios | /precios\nContacto | /contacto\n---\nLegal\nPrivacidad | /contacto\nTérminos | /contacto\n---\nSíguenos\nInstagram | https://instagram.com\nLinkedIn | https://linkedin.com',
    copyright: '© Aura. Todos los derechos reservados.',
  },
  fields: { brand: { type: 'text', label: 'Marca' }, tagline: { type: 'textarea', label: 'Descripción' }, columns: { type: 'textarea', label: 'Columnas (Título, luego Etiqueta | enlace; separa columnas con ---)' }, copyright: { type: 'text', label: 'Derechos' } },
  render({ brand, tagline, columns, copyright }) {
    const groups = String(columns ?? '').split(/\n-{3,}\n/).map((chunk) => { const [head, ...rows] = chunk.split('\n').map((l) => l.trim()).filter(Boolean); return { head, rows: rows.map((r) => r.split('|').map((p) => p.trim())) } }).filter((g) => g.head)
    return (
      <footer className="cr" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(40px, 6vw, 72px) 0 28px', background: 'linear-gradient(180deg, #F5F9FF, #DCEBFF)' }}>
        <CrStyle />
        <Blobs />
        <div style={{ ...WRAP, position: 'relative' }}>
          <div className="cr-glass" style={{ padding: 'clamp(24px, 4vw, 44px)', borderRadius: '34px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '28px' }}>
            <div style={{ gridColumn: '1 / -1', minWidth: 0, maxWidth: '420px' }}>
              <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>{brand}</p>
              <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: 1.7, color: C.muted }}>{tagline}</p>
            </div>
            {groups.map((group) => (
              <nav key={group.head} aria-label={group.head}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.blueHex }}>{group.head}</p>
                <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: '4px' }}>
                  {group.rows.map(([label, href]) => <li key={label}><a href={safeHref(href)} style={{ display: 'inline-flex', minHeight: '36px', alignItems: 'center', color: C.ink, fontSize: '15px', textDecoration: 'none' }}>{label}</a></li>)}
                </ul>
              </nav>
            ))}
          </div>
          <p style={{ margin: '22px 0 0', textAlign: 'center', fontSize: '13px', color: C.muted }}>{copyright}</p>
        </div>
      </footer>
    )
  },
})
