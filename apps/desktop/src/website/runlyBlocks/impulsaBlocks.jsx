import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { G, WRAP, cells, lines, safeHref, useReveal, usePointerVars, CountUp, ImStyle, Section, Heading, Btn, Icon, RocketScene, ServiceArt } from './impulsaArt.jsx'

// Home blocks of the "Impulsa" template. Copy lives in plain-text props (one item per line, cells split by " | ")
// so every list stays editable from the block panel.
const SERVICE_TONES = [G.mint, G.blue, G.violet, G.amber]
const ART_KINDS = ['seo', 'ads', 'social', 'email']

// ---------------------------------------------------------------------------------------------------------------
const NAV_CSS = `
.im-nav .nl{position:relative;display:inline-flex;align-items:center;min-height:44px;padding:0 2px;color:${G.ink};font-weight:600;font-size:15px;text-decoration:none;transition:color .2s}
.im-nav .nl::after{content:"";position:absolute;left:0;right:0;bottom:8px;height:2px;border-radius:2px;background:${G.leaf};transform:scaleX(0);transform-origin:right;transition:transform .3s ease}
.im-nav .nl:hover{color:${G.greenHex}}
.im-nav .nl:hover::after,.im-nav .nl[aria-current="page"]::after{transform:scaleX(1);transform-origin:left}
.im-nav .links{display:flex;align-items:center;gap:clamp(16px,2.6vw,34px)}
.im-nav .mob{display:none;position:relative}
@media (max-width:900px){.im-nav .links,.im-nav .cta{display:none}.im-nav .mob{display:block}}
.im-nav .mob summary{list-style:none;cursor:pointer;display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:${G.mint};color:${G.forest}}
.im-nav .mob summary::-webkit-details-marker{display:none}
.im-nav .mob[open] summary{background:${G.forest};color:#fff}
.im-nav .mob[open] .panel{animation:im-menu .28s cubic-bezier(.2,.8,.2,1);transform-origin:top right}
@keyframes im-menu{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.im-nav .mob[open] .panel{animation:none}}
.im-nav .panel{position:absolute;right:0;top:calc(100% + 10px);width:min(86vw,320px);background:#fff;border:1px solid ${G.line};border-radius:18px;padding:10px;box-shadow:0 24px 50px -20px rgba(15,59,34,.35);display:grid;gap:2px}
.im-nav .panel a{display:flex;align-items:center;min-height:48px;padding:0 14px;border-radius:12px;color:${G.ink};font-weight:600;text-decoration:none}
.im-nav .panel a:hover,.im-nav .panel a[aria-current="page"]{background:${G.mint};color:${G.forest}}
.im-nav .bars{display:block;width:20px;height:2px;background:currentColor;border-radius:2px;box-shadow:0 6px 0 currentColor,0 -6px 0 currentColor}
`
export const ImNavbarBlock = defineBlock({
  type: 'ImNavbarBlock',
  label: 'Barra de navegación Impulsa',
  category: 'navigation',
  defaultProps: { brand: 'Impulsa', links: 'Nosotros | /nosotros\nServicios | /servicios\nPrecios | /precios\nBlog | /blog\nContacto | /contacto', active: '/', ctaLabel: 'Pedir cotización', ctaHref: '/contacto' },
  fields: {
    brand: { type: 'text', label: 'Marca' }, links: { type: 'textarea', label: 'Enlaces (Etiqueta | /ruta, uno por línea)' }, active: { type: 'text', label: 'Ruta activa' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  groups: [{ label: 'Contenido', fields: ['brand', 'links', 'active'] }, { label: 'Botón', fields: ['ctaLabel', 'ctaHref'] }],
  render({ brand, links, active, ctaLabel, ctaHref }) {
    const items = cells(links).map(([label, href]) => ({ label, href: safeHref(href) }))
    return (
      <header className="im im-nav" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,.86)', backdropFilter: 'saturate(1.4) blur(12px)', borderBottom: `1px solid ${G.line}` }}>
        <ImStyle /><style>{NAV_CSS}</style>
        <div style={{ ...WRAP, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', minHeight: '76px' }}>
          <a href="/" aria-label={`${brand}, inicio`} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minHeight: '44px', color: G.ink, textDecoration: 'none', fontWeight: 800, fontSize: '22px', letterSpacing: '-0.03em' }}>
            <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32"><path d="M16 2 L20 12 L30 16 L20 20 L16 30 L12 20 L2 16 L12 12 Z" fill={G.greenHex} /><path d="M16 9 L18 14 L23 16 L18 18 L16 23 L14 18 L9 16 L14 14 Z" fill={G.lime} /></svg>
            {brand}
          </a>
          <nav className="links" aria-label="Principal">
            {items.map((item) => <a key={item.href + item.label} className="nl" href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>)}
          </nav>
          <div className="cta"><Btn href={ctaHref}>{ctaLabel}</Btn></div>
          <details className="mob">
            <summary aria-label="Abrir menú"><span className="bars" aria-hidden="true" /></summary>
            <nav className="panel" aria-label="Principal móvil">
              {items.map((item) => <a key={item.href + item.label} href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>)}
              {ctaLabel && <a href={safeHref(ctaHref)} style={{ background: G.greenHex, color: '#fff', justifyContent: 'center', marginTop: '6px' }}>{ctaLabel}</a>}
            </nav>
          </details>
        </div>
      </header>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const HERO_CSS = `
.im-hero .art{transform:translate(calc((var(--mx,.5) - .5) * -24px),calc((var(--my,.5) - .5) * -18px));transition:transform .4s ease-out}
.im-hero .chip{position:absolute;transform:translate(calc((var(--mx,.5) - .5) * 30px),calc((var(--my,.5) - .5) * 22px));transition:transform .5s ease-out}
.im-hero .chip>div{display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:1px solid ${G.line};border-radius:16px;box-shadow:0 18px 40px -18px rgba(15,59,34,.35)}
.im-hero .chip b{display:block;font-size:20px;letter-spacing:-.02em}
.im-hero .chip small{display:block;font-size:12px;color:${G.muted}}
.im-hero .chip i{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:${G.mint};color:${G.greenHex}}
@media (max-width:560px){.im-hero .chip>div{padding:8px 10px;gap:8px}.im-hero .chip b{font-size:16px}.im-hero .chip i{width:28px;height:28px}}
`
export const ImHeroBlock = defineBlock({
  type: 'ImHeroBlock',
  label: 'Portada Impulsa con cohete',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Socio de crecimiento digital', title: 'Impulsamos el crecimiento digital de', highlight: 'marcas ambiciosas',
    text: 'Somos tu agencia de marketing digital integral. Ayudamos a los negocios a crecer en línea con estrategias basadas en datos que entregan resultados reales.',
    ctaLabel: 'Agenda una consultoría gratis', ctaHref: '/contacto', ctaSecondLabel: 'Ver servicios', ctaSecondHref: '/servicios',
    stats: '+250% | Crecimiento | trend\n+180% | Tráfico | users\n98% | Clientes satisfechos | star',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado (verde)' }, text: { type: 'textarea', label: 'Texto' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' }, ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    stats: { type: 'textarea', label: 'Tarjetas flotantes (Cifra | texto | icono, hasta 3)' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'text'] }, { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] }, { label: 'Tarjetas', fields: ['stats'] }],
  render: (props) => <Hero {...props} />,
})

const CHIP_SPOTS = [{ left: '2%', top: '16%', delay: '0s' }, { right: '0%', top: '42%', delay: '-2s' }, { left: '22%', bottom: '6%', delay: '-4s' }]
function Hero({ eyebrow, title, highlight, text, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, stats }) {
  const [ref, rv] = useReveal(0.05)
  const pointer = usePointerVars()
  return (
    <section ref={(node) => { ref.current = node; pointer.current = node }} data-rv={rv} className="im im-hero" style={{ position: 'relative', overflow: 'hidden', background: `radial-gradient(1200px 500px at 85% -10%, ${G.mint}, transparent 60%), #fff`, padding: 'clamp(36px, 6vw, 80px) 0 clamp(40px, 6vw, 72px)' }}>
      <ImStyle /><style>{HERO_CSS}</style>
      <div aria-hidden="true" className="im-orb" style={{ position: 'absolute', left: '-120px', bottom: '-160px', width: '360px', height: '360px', borderRadius: '50%', background: `radial-gradient(circle, ${G.mintDeep}, transparent 70%)`, opacity: 0.8 }} />
      <div style={{ ...WRAP, position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 'clamp(28px, 4vw, 56px)', alignItems: 'center' }}>
        <div>
          {eyebrow && <p className="im-eyebrow im-rv" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderRadius: '999px', background: G.mint }}><span className="im-pulse" aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: G.leaf }} />{eyebrow}</p>}
          <h1 className="im-rv" style={{ '--i': 1, margin: '20px 0 0', fontSize: 'clamp(36px, 4.4vw, 58px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.06 }}>
            {title} <span className="im-hl">{highlight}</span>
          </h1>
          <p className="im-lead im-rv" style={{ '--i': 2, maxWidth: '50ch' }}>{text}</p>
          <div className="im-rv" style={{ '--i': 3, marginTop: '30px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <Btn href={ctaHref}>{ctaLabel}</Btn>
            <Btn href={ctaSecondHref} variant="ghost">{ctaSecondLabel}</Btn>
          </div>
        </div>
        <div className="im-rv z" style={{ '--i': 2, position: 'relative', maxWidth: '560px', width: '100%', justifySelf: 'center' }}>
          <div className="art"><RocketScene /></div>
          {cells(stats).slice(0, 3).map(([value, label, icon], index) => (
            <div key={value + label} className="chip" style={CHIP_SPOTS[index]}>
              <div className="im-float" style={{ animationDelay: CHIP_SPOTS[index].delay }}>
                <div><b>{value}</b><small>{label}</small></div>
                <i aria-hidden="true"><Icon name={icon} size={18} stroke={2.2} /></i>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const LOGO_STYLES = [{ fontWeight: 800, letterSpacing: '-0.04em' }, { fontWeight: 500, fontStyle: 'italic', fontFamily: 'Georgia, serif' }, { fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', fontSize: '17px' }, { fontWeight: 700, letterSpacing: '-0.02em' }, { fontWeight: 300, letterSpacing: '.18em', textTransform: 'uppercase', fontSize: '16px' }, { fontWeight: 800, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '18px' }]
const LOGOS_CSS = `
.im-logos .track{display:flex;width:max-content;gap:clamp(36px,6vw,72px);animation:im-marquee 32s linear infinite}
.im-logos:hover .track{animation-play-state:paused}
.im-logos .mask{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.im-logos .lg{display:inline-flex;align-items:center;gap:8px;font-size:21px;color:#8A968E;white-space:nowrap;transition:color .25s,transform .25s}
.im-logos .lg:hover{color:${G.forest};transform:scale(1.06)}
@media (prefers-reduced-motion:reduce){.im-logos .track{flex-wrap:wrap;justify-content:center;width:auto}}
`
export const ImLogosBlock = defineBlock({
  type: 'ImLogosBlock',
  label: 'Marcas que confían',
  category: 'atlas',
  defaultProps: { label: 'Marcas que confían en nosotros', brands: 'Nubora\nVértice\nCASA ALBA\nRumbo\nlumen lab\nkora.io\nSierra & Co\nOLA FRESCA' },
  fields: { label: { type: 'text', label: 'Texto' }, brands: { type: 'textarea', label: 'Marcas (una por línea)' } },
  render({ label, brands }) {
    const list = lines(brands)
    const row = (copy) => list.map((brand, index) => <span key={`${copy}${brand}`} className="lg" aria-hidden={copy ? 'true' : undefined} style={LOGO_STYLES[index % LOGO_STYLES.length]}>{index % 3 === 0 && <Icon name={['globe', 'bolt', 'shield'][(index / 3) % 3]} size={18} />}{brand}</span>)
    return (
      <section className="im im-logos" style={{ background: '#fff', padding: '8px 0 clamp(32px, 4vw, 56px)' }}>
        <ImStyle /><style>{LOGOS_CSS}</style>
        <div style={WRAP}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 36px)', flexWrap: 'wrap', padding: '20px clamp(18px, 3vw, 32px)', border: `1px solid ${G.line}`, borderRadius: '22px', boxShadow: '0 20px 40px -32px rgba(15,59,34,.45)' }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, lineHeight: 1.4, maxWidth: '150px', color: G.ink }}>{label}</p>
            <div className="mask" style={{ flex: '1 1 320px', minWidth: 0 }}><div className="track">{row('')}{row('b')}</div></div>
          </div>
        </div>
      </section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const SERVICES_CSS = `
.im-svc .card{position:relative;overflow:hidden;display:flex;flex-direction:column;height:100%;padding:26px 24px 22px;border-radius:24px;border:1px solid rgba(15,59,34,.06);text-decoration:none;color:${G.ink};transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s ease}
.im-svc .card::before{content:"";position:absolute;inset:0;background:radial-gradient(260px circle at calc(var(--mx,.5)*100%) calc(var(--my,.5)*100%),rgba(255,255,255,.85),transparent 60%);opacity:0;transition:opacity .3s}
.im-svc .card:hover{transform:translateY(-8px);box-shadow:0 30px 50px -30px rgba(15,59,34,.45)}
.im-svc .card:hover::before{opacity:1}
.im-svc .art{position:relative;width:118px;height:100px;margin-bottom:22px;transition:transform .5s cubic-bezier(.3,1.4,.5,1)}
.im-svc .card:hover .art{transform:translateY(-6px) rotate(-4deg) scale(1.06)}
.im-svc .more{margin-top:auto;padding-top:18px;display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:${G.forest}}
.im-svc .more svg{transition:transform .25s}
.im-svc .card:hover .more svg{transform:translateX(5px)}
`
function ServiceCard({ title, text, href, index }) {
  const pointer = usePointerVars()
  return (
    <a ref={pointer} className="card im-rv" href={safeHref(href)} style={{ '--i': index, background: SERVICE_TONES[index % 4] }}>
      <div className="art" aria-hidden="true"><ServiceArt kind={ART_KINDS[index % 4]} /></div>
      <h3 style={{ position: 'relative', margin: 0, fontSize: '19px', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h3>
      <p style={{ position: 'relative', margin: '10px 0 0', fontSize: '15px', lineHeight: 1.6, color: G.muted }}>{text}</p>
      <span className="more">Saber más <Icon name="arrow" size={16} stroke={2.4} /></span>
    </a>
  )
}
export const ImServicesBlock = defineBlock({
  type: 'ImServicesBlock',
  label: 'Servicios en tarjetas ilustradas',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Nuestros servicios', title: 'Soluciones que hacen', highlight: 'crecer tu negocio', lead: 'De la estrategia a la ejecución: marketing digital de punta a punta para que tu marca destaque.',
    services: 'Posicionamiento SEO | Mejora tu lugar en los buscadores y atrae tráfico orgánico que convierte. | /servicios\nPublicidad digital | Más visibilidad y mejor retorno con campañas pagadas medidas al peso. | /servicios\nRedes sociales | Conecta con tu audiencia y construye una comunidad leal alrededor de tu marca. | /servicios\nEmail marketing | Nutre prospectos y convierte suscriptores en clientes recurrentes. | /servicios',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, lead: { type: 'textarea', label: 'Descripción' },
    services: { type: 'textarea', label: 'Servicios (Título | texto | /enlace, uno por línea; ilustración por posición)' },
  },
  groups: [{ label: 'Encabezado', fields: ['eyebrow', 'title', 'highlight', 'lead'] }, { label: 'Servicios', fields: ['services'] }],
  render: (props) => <Services {...props} />,
})
function Services({ eyebrow, title, highlight, lead, services }) {
  const [ref, rv] = useReveal()
  return (
    <Section innerRef={ref} rv={rv}>
      <style>{SERVICES_CSS}</style>
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} lead={lead} />
      <div className="im-svc" style={{ marginTop: 'clamp(32px, 4vw, 52px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '18px' }}>
        {cells(services).map(([name, text, href], index) => <ServiceCard key={name + index} title={name} text={text} href={href} index={index} />)}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const parseNumber = (raw) => {
  const match = String(raw ?? '').match(/^([^\d-]*)(-?[\d.,]+)(.*)$/)
  if (!match) return null
  const decimals = (match[2].split('.')[1] ?? '').length
  return { prefix: match[1], value: Number(match[2].replace(/,/g, '')), suffix: match[3], decimals }
}
export function Stat({ raw, active }) {
  const parsed = parseNumber(raw)
  if (!parsed || Number.isNaN(parsed.value)) return <>{raw}</>
  return <>{parsed.prefix}<CountUp value={parsed.value} decimals={parsed.decimals} active={active} />{parsed.suffix}</>
}

export const ImResultsBlock = defineBlock({
  type: 'ImResultsBlock',
  label: 'Banda de resultados con contadores',
  category: 'atlas',
  defaultProps: {
    title: 'Resultados que', highlight: 'hablan por sí solos', text: 'No prometemos resultados: entregamos crecimiento medible, mes con mes.', ctaLabel: 'Ver casos de éxito', ctaHref: '/servicios',
    stats: '150+ | Clientes felices | users\n320+ | Proyectos entregados | briefcase\n95% | Tasa de éxito | chart\n10+ | Años de experiencia | star',
  },
  fields: {
    title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, text: { type: 'textarea', label: 'Texto' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' }, stats: { type: 'textarea', label: 'Cifras (Cifra | texto | icono, una por línea)' },
  },
  groups: [{ label: 'Contenido', fields: ['title', 'highlight', 'text', 'ctaLabel', 'ctaHref'] }, { label: 'Cifras', fields: ['stats'] }],
  render: (props) => <Results {...props} />,
})
function Results({ title, highlight, text, ctaLabel, ctaHref, stats }) {
  const [ref, rv] = useReveal(0.3)
  return (
    <Section innerRef={ref} rv={rv} pad="clamp(20px, 3vw, 36px)">
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '28px', background: `linear-gradient(120deg, ${G.forest} 0%, ${G.forest2} 55%, #1F6B3A 100%)`, color: '#fff', padding: 'clamp(28px, 4vw, 52px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(24px, 4vw, 48px)', alignItems: 'center' }}>
        <div aria-hidden="true" className="im-orb" style={{ position: 'absolute', right: '8%', top: '-40%', width: '340px', height: '340px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(143,217,154,.35), transparent 65%)' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'relative' }}>
          <h2 className="im-rv l" style={{ margin: 0, fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{title} <span style={{ color: G.lime }}>{highlight}</span></h2>
          <p className="im-rv l" style={{ '--i': 1, margin: '14px 0 22px', color: 'rgba(255,255,255,.78)', lineHeight: 1.65 }}>{text}</p>
          <div className="im-rv l" style={{ '--i': 2 }}><Btn href={ctaHref} variant="leaf">{ctaLabel}</Btn></div>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: '4px' }}>
          {cells(stats).map(([value, label, icon], index) => (
            <div key={label + index} className="im-rv" style={{ '--i': index + 1, textAlign: 'center', padding: '14px 8px', borderLeft: index ? '1px solid rgba(255,255,255,.14)' : 0 }}>
              <span className="im-popin" style={{ '--i': index, display: 'inline-grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(143,217,154,.16)', color: G.lime }}><Icon name={icon} size={22} /></span>
              <p style={{ margin: '12px 0 0', fontSize: 'clamp(30px, 3.4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}><Stat raw={value} active={rv === 'in'} /></p>
              <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'rgba(255,255,255,.72)' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const PROCESS_CSS = `
.im-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;position:relative}
.im-steps .step{position:relative;text-align:left}
.im-steps .tile{position:relative;width:76px;height:76px;border-radius:22px;background:${G.soft};border:1px solid ${G.line};display:grid;place-items:center;color:${G.greenHex};transition:transform .4s cubic-bezier(.3,1.4,.5,1),background .3s}
.im-steps .step:hover .tile{transform:translateY(-6px) rotate(-6deg);background:${G.mint}}
.im-steps .num{position:absolute;left:-12px;top:-12px;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:${G.forest};color:#fff;font-weight:800;font-size:13px;box-shadow:0 0 0 4px #fff}
.im-steps .link{position:absolute;top:38px;left:calc(76px + 18px);right:-6px;height:12px}
@media (max-width:860px){.im-steps{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:36px}.im-steps .step:nth-child(2n) .link{display:none}}
@media (max-width:520px){.im-steps{grid-template-columns:1fr}.im-steps .link{display:none}}
`
export const ImProcessBlock = defineBlock({
  type: 'ImProcessBlock',
  label: 'Proceso en pasos',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Nuestro proceso', title: 'Un proceso simple en', highlight: '4 pasos', lead: 'Seguimos un método probado para entregar resultados excepcionales.',
    steps: 'Descubrir | Analizamos tu negocio e identificamos oportunidades. | search\nEstrategia | Diseñamos un plan a la medida de tus metas. | target\nEjecutar | Lanzamos campañas que impulsan resultados reales. | rocket\nOptimizar | Medimos, analizamos y mejoramos de forma continua. | trend',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, lead: { type: 'textarea', label: 'Descripción' },
    steps: { type: 'textarea', label: 'Pasos (Título | texto | icono, uno por línea)' },
  },
  groups: [{ label: 'Encabezado', fields: ['eyebrow', 'title', 'highlight', 'lead'] }, { label: 'Pasos', fields: ['steps'] }],
  render: (props) => <Process {...props} />,
})
function Process({ eyebrow, title, highlight, lead, steps }) {
  const [ref, rv] = useReveal(0.25)
  const list = cells(steps)
  return (
    <Section innerRef={ref} rv={rv}>
      <style>{PROCESS_CSS}</style>
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} lead={lead} />
      <ol className="im-steps" style={{ listStyle: 'none', margin: 'clamp(36px, 4vw, 56px) 0 0', padding: 0 }}>
        {list.map(([name, text, icon], index) => (
          <li key={name + index} className="step im-rv" style={{ '--i': index }}>
            <div className="tile"><span className="num im-popin" style={{ '--i': index }}>{String(index + 1).padStart(2, '0')}</span><Icon name={icon} size={30} stroke={1.8} /></div>
            {index < list.length - 1 && (
              <svg className="link" aria-hidden="true" viewBox="0 0 200 12" preserveAspectRatio="none">
                <path className="im-draw" style={{ '--len': 200, '--i': index + 1 }} d="M0 6 H188" stroke={G.leaf} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
                <path d="M184 1 L192 6 L184 11" stroke={G.leaf} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <h3 style={{ margin: '18px 0 0', fontSize: '18px', fontWeight: 800 }}>{name}</h3>
            <p style={{ margin: '8px 0 0', fontSize: '15px', lineHeight: 1.6, color: G.muted, maxWidth: '26ch' }}>{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

