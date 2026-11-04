import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { cells, lines, safeHref, useReveal, usePointerVars, useScrollVar, CountUp, Icon } from './blockKit.jsx'
import { C, WRAP, CrStyle, Btn, Blobs, Section, Heading, SkyScene, Orb, Phone, Stars } from './cristalArt.jsx'

// Home blocks of the "Aura" template (liquid glass). Lists are plain-text props: one item per line, cells split by " | ".

// ---------------------------------------------------------------------------------------------------------------
const NAV_CSS = `
.cr-nav{position:sticky;top:0;z-index:40;padding:14px 0;pointer-events:none}
.cr-nav>div>*{pointer-events:auto}
.cr-nav .bar{display:flex;align-items:center;justify-content:space-between;gap:14px}
.cr-nav .links{display:flex;align-items:center;gap:4px;padding:6px;border-radius:999px}
.cr-nav .links a{position:relative;display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;color:${C.ink};font-size:14px;font-weight:600;text-decoration:none;transition:background .25s,color .25s}
.cr-nav .links a:hover{background:rgba(255,255,255,.55)}
.cr-nav .links a[aria-current="page"]{background:#fff;box-shadow:0 6px 16px -8px rgba(20,70,150,.45)}
.cr-nav .mob{display:none;position:relative}
@media (max-width:900px){.cr-nav .links,.cr-nav .cta{display:none}.cr-nav .mob{display:block}}
.cr-nav .mob summary{list-style:none;cursor:pointer;display:grid;place-items:center;width:48px;height:48px;border-radius:50%}
.cr-nav .mob summary::-webkit-details-marker{display:none}
.cr-nav .panel{position:absolute;right:0;top:calc(100% + 10px);width:min(86vw,320px);padding:10px;border-radius:24px;display:grid;gap:2px}
.cr-nav .panel a{display:flex;align-items:center;min-height:48px;padding:0 16px;border-radius:16px;color:${C.ink};font-weight:600;text-decoration:none}
.cr-nav .panel a[aria-current="page"],.cr-nav .panel a:hover{background:rgba(255,255,255,.7)}
.cr-nav .bars{display:block;width:18px;height:2px;background:${C.ink};border-radius:2px;box-shadow:0 6px 0 ${C.ink},0 -6px 0 ${C.ink}}
`
const Logo = ({ brand }) => (
  <a href="/" aria-label={`${brand}, inicio`} className="cr-glass" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minHeight: '48px', padding: '0 18px 0 8px', borderRadius: '999px', color: C.ink, textDecoration: 'none', fontWeight: 700, fontSize: '19px', letterSpacing: '-0.02em' }}>
    <span aria-hidden="true" style={{ position: 'relative', width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: 'conic-gradient(from 200deg,#5CE1E6,#2F8BFF,#8B7CFF,#5CE1E6)', boxShadow: 'inset 0 0 8px rgba(255,255,255,.8)' }}>
      <span style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,.95), transparent 45%)' }} />
    </span>
    {brand}
  </a>
)
export const CrNavbarBlock = defineBlock({
  type: 'CrNavbarBlock',
  label: 'Barra de navegación de vidrio',
  category: 'navigation',
  defaultProps: { brand: 'Aura', links: 'Inicio | /\nFunciones | /funciones\nPrecios | /precios\nContacto | /contacto', active: '/', ctaLabel: 'Descargar app', ctaHref: '/precios' },
  fields: {
    brand: { type: 'text', label: 'Marca' }, links: { type: 'textarea', label: 'Enlaces (Etiqueta | /ruta, uno por línea)' }, active: { type: 'text', label: 'Ruta activa' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  groups: [{ label: 'Contenido', fields: ['brand', 'links', 'active'] }, { label: 'Botón', fields: ['ctaLabel', 'ctaHref'] }],
  render({ brand, links, active, ctaLabel, ctaHref }) {
    const items = cells(links).map(([label, href]) => ({ label, href: safeHref(href) }))
    return (
      <header className="cr cr-nav">
        <CrStyle /><style>{NAV_CSS}</style>
        <div className="bar" style={WRAP}>
          <Logo brand={brand} />
          <nav className="links cr-glass" aria-label="Principal">
            {items.map((item) => <a key={item.href + item.label} href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>)}
          </nav>
          <div className="cta"><Btn href={ctaHref}>{ctaLabel}</Btn></div>
          <details className="mob">
            <summary className="cr-glass" aria-label="Abrir menú"><span className="bars" aria-hidden="true" /></summary>
            <nav className="panel cr-glass" aria-label="Principal móvil">
              {items.map((item) => <a key={item.href + item.label} href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>)}
              {ctaLabel && <a href={safeHref(ctaHref)} style={{ justifyContent: 'center', marginTop: '6px', background: C.blueHex, color: '#fff' }}>{ctaLabel}</a>}
            </nav>
          </details>
        </div>
      </header>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const HERO_CSS = `
.cr-hero .stage{position:relative;display:flex;justify-content:center;margin-top:clamp(40px,6vw,72px)}
.cr-hero .phone{position:relative;z-index:2;margin-bottom:-120px;transform:translateY(calc(var(--sy,0) * -0.12px))}
.cr-hero .widget{position:absolute;z-index:3;display:flex;align-items:center;gap:14px;text-align:left;padding:14px 16px;border-radius:24px;min-width:200px;transform:translate(calc((var(--mx,.5) - .5) * var(--d,30px)),calc((var(--my,.5) - .5) * var(--d,30px)));transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.cr-hero .widget small{display:block;font-size:12px;color:${C.muted};font-weight:600}
.cr-hero .widget b{display:block;font-size:26px;letter-spacing:-.03em}
.cr-hero .widget b span{font-size:13px;font-weight:600;color:${C.muted};margin-left:3px}
.cr-hero .ico{display:grid;place-items:center;width:40px;height:40px;border-radius:14px;flex-shrink:0}
@media (max-width:900px){.cr-hero .stage{flex-direction:column;align-items:center}.cr-hero .widget{display:none}.cr-hero .widget.keep{display:flex;position:relative;left:auto!important;right:auto!important;top:auto!important;margin:0 0 22px;transform:none}}
`
export const CrHeroBlock = defineBlock({
  type: 'CrHeroBlock',
  label: 'Portada de vidrio con teléfono',
  category: 'atlas',
  defaultProps: {
    badge: 'Nuevo', badgeText: 'Asistente de bienestar con IA', title: 'Bienestar con IA', titleSoft: 'que entiende', titleStrong: 'cómo te sientes',
    text: 'Recibe orientación personal sobre tu sueño, tu energía y tus hábitos. Seguimiento de señales, recordatorios inteligentes y respuestas claras, en un solo lugar.',
    ctaLabel: 'Descargar app', ctaHref: '/precios', ctaSecondLabel: 'Probar el asistente', ctaSecondHref: '/funciones',
    phoneTitle: 'Asistente Aura', topics: 'Sueño\nEstrés\nEnergía\nÁnimo\nNutrición\nHábitos\nRespiración', activeTopic: 'Ánimo',
    widgets: 'Ritmo cardiaco | 72 | lpm | Rango 60-100 · Óptimo | heart\nSueño | 7 h 45 | min | Meta 7-9 h · Bien | moon\nAsistencia 24/7 | Habla ahora | | Respuesta en segundos | call',
  },
  fields: {
    badge: { type: 'text', label: 'Insignia' }, badgeText: { type: 'text', label: 'Texto de la insignia' }, title: { type: 'text', label: 'Título (degradado)' }, titleSoft: { type: 'text', label: 'Título (suave)' }, titleStrong: { type: 'text', label: 'Título (fuerte)' },
    text: { type: 'textarea', label: 'Texto' }, ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' }, ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    phoneTitle: { type: 'text', label: 'Título en el teléfono' }, topics: { type: 'textarea', label: 'Temas en el teléfono (uno por línea)' }, activeTopic: { type: 'text', label: 'Tema activo' },
    widgets: { type: 'textarea', label: 'Tarjetas flotantes (Título | cifra | unidad | nota | icono, hasta 3)' },
  },
  groups: [{ label: 'Texto', fields: ['badge', 'badgeText', 'title', 'titleSoft', 'titleStrong', 'text'] }, { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] }, { label: 'Teléfono y tarjetas', fields: ['phoneTitle', 'topics', 'activeTopic', 'widgets'] }],
  render: (props) => <Hero {...props} />,
})
const SPOTS = [{ left: '0', top: '18%', '--d': '40px' }, { left: '17%', top: '-4%', '--d': '24px' }, { right: '0', top: '10%', '--d': '36px' }]
const TONES = [['#FFE3E8', '#E5484D'], ['#EDE7FF', '#7B5CFF'], ['#E3F1FF', C.blueHex]]
function Hero({ badge, badgeText, title, titleSoft, titleStrong, text, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, phoneTitle, topics, activeTopic, widgets }) {
  const [ref, rv] = useReveal(0.05)
  const pointer = usePointerVars()
  const scroll = useScrollVar()
  const set = (node) => { ref.current = node; pointer.current = node; scroll.current = node }
  return (
    <section ref={set} data-rv={rv} className="cr cr-hero" style={{ position: 'relative', overflow: 'hidden', marginTop: '-78px', padding: 'calc(78px + clamp(40px, 6vw, 80px)) 0 0', background: 'radial-gradient(1100px 600px at 50% 110%, #9CCBFF 0%, #CFE5FF 45%, #F3F8FF 75%), #F3F8FF' }}>
      <CrStyle /><style>{HERO_CSS}</style>
      <Blobs />
      <div style={{ ...WRAP, position: 'relative', textAlign: 'center' }}>
        {badgeText && <p className="cr-pill cr-glass cr-rv" style={{ margin: 0 }}><b><Icon name="sparkle" size={13} />{badge}</b>{badgeText}</p>}
        <h1 className="cr-rv" style={{ '--i': 1, margin: '22px auto 0', maxWidth: '16ch', fontSize: 'clamp(40px, 6.4vw, 80px)', fontWeight: 500, letterSpacing: '-0.045em', lineHeight: 1.04 }}>
          <span className="cr-grad" style={{ fontWeight: 600 }}>{title}</span> <span style={{ color: '#5B6B84' }}>{titleSoft}</span> <strong style={{ fontWeight: 700 }}>{titleStrong}</strong>
        </h1>
        <p className="cr-lead cr-rv" style={{ '--i': 2, maxWidth: '58ch', marginInline: 'auto' }}>{text}</p>
        <div className="cr-rv" style={{ '--i': 3, marginTop: '30px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
          <Btn href={ctaHref}>{ctaLabel}</Btn>
          <Btn href={ctaSecondHref} variant="glass">{ctaSecondLabel}</Btn>
        </div>
        <div className="stage">
          {cells(widgets).slice(0, 3).map(([name, value, unit, note, icon], index) => (
            <div key={name + index} className={`widget cr-glass cr-rv${index === 2 ? ' keep' : ''}`} style={{ ...SPOTS[index], '--i': index + 4, '--sheen': `${index * 1.7}s`}}>
              <div style={{ flex: 1 }}><small>{name}</small><b>{value}{unit && <span>{unit}</span>}</b><small style={{ fontWeight: 500 }}>{note}</small></div>
              <span className="ico" style={{ background: index === 2 ? C.ink : TONES[index][0], color: index === 2 ? '#fff' : TONES[index][1] }}><Icon name={icon} size={20} /></span>
            </div>
          ))}
          <div className="phone cr-rv up" style={{ '--i': 3 }}><div className="cr-float" style={{ animationDuration: '8s' }}><Phone title={phoneTitle} topics={lines(topics)} active={activeTopic} /></div></div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const BENTO_CSS = `
.cr-bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px;margin-top:clamp(36px,5vw,60px)}
.cr-bento .card{grid-column:span 2;padding:24px;border-radius:28px;min-height:250px;display:flex;flex-direction:column;transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.cr-bento .card:hover{transform:translateY(-6px)}
.cr-bento .card.wide{grid-column:span 3}
.cr-bento .vis{flex:1;display:flex;align-items:center;justify-content:center;min-height:110px;margin-bottom:16px}
.cr-bento h3{margin:0;font-size:18px;font-weight:700;letter-spacing:-.02em}
.cr-bento p{margin:6px 0 0;font-size:15px;line-height:1.6;color:${C.muted}}
.cr-bento .bars span{display:block;width:8px;border-radius:8px;background:linear-gradient(${C.sky},${C.violet});transform-origin:bottom}
.cr-bento .dots i{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:${C.muted}}
@media (prefers-reduced-motion:no-preference){.cr-bento .bars span{animation:cr-bar 1.3s ease-in-out infinite}.cr-bento .dots i{animation:cr-dot 1.2s infinite}[data-rv="in"] .cr-bento .ring{animation:cr-ring 1.8s cubic-bezier(.3,.1,.2,1) both}}
@media (max-width:900px){.cr-bento{grid-template-columns:repeat(2,minmax(0,1fr))}.cr-bento .card,.cr-bento .card.wide{grid-column:span 2}}
@media (min-width:560px) and (max-width:900px){.cr-bento .card{grid-column:span 1}}
`
const Visual = ({ kind }) => {
  if (kind === 'chart') return (
    <svg viewBox="0 0 220 100" width="100%" style={{ maxWidth: '240px' }} aria-hidden="true">
      <defs><linearGradient id="crChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.sky} stopOpacity=".35" /><stop offset="1" stopColor={C.sky} stopOpacity="0" /></linearGradient></defs>
      <path d="M0 80 C30 70 40 40 70 46 S110 78 140 52 180 18 220 26 V100 H0Z" fill="url(#crChartFill)" />
      <path className="ring" style={{ '--len': 300 }} pathLength="300" strokeDasharray="300" d="M0 80 C30 70 40 40 70 46 S110 78 140 52 180 18 220 26" fill="none" stroke={C.sky} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="180" cy="22" r="6" fill="#fff" stroke={C.sky} strokeWidth="3" />
    </svg>
  )
  if (kind === 'ring') return (
    <svg viewBox="0 0 120 120" width="120" aria-hidden="true">
      <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="12" />
      <circle className="ring" style={{ '--len': 302 }} cx="60" cy="60" r="48" fill="none" stroke={C.violet} strokeWidth="12" strokeLinecap="round" strokeDasharray="302" strokeDashoffset="76" transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill={C.ink}>75%</text>
    </svg>
  )
  if (kind === 'chat') return (
    <div style={{ display: 'grid', gap: '8px', width: '100%', maxWidth: '260px' }}>
      <span style={{ justifySelf: 'end', padding: '9px 14px', borderRadius: '18px 18px 4px 18px', background: C.blueHex, color: '#fff', fontSize: '13px', fontWeight: 600 }}>Dormí mal toda la semana</span>
      <span style={{ justifySelf: 'start', padding: '9px 14px', borderRadius: '18px 18px 18px 4px', background: '#fff', fontSize: '13px', fontWeight: 600 }}>Revisemos tus horarios y tu rutina de noche.</span>
      <span className="dots" style={{ justifySelf: 'start', padding: '10px 14px', borderRadius: '18px', background: 'rgba(255,255,255,.7)' }}><i /><i style={{ animationDelay: '.15s' }} /><i style={{ animationDelay: '.3s' }} /></span>
    </div>
  )
  if (kind === 'wave') return (
    <div className="bars" style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '80px' }}>
      {Array.from({ length: 16 }, (_, index) => <span key={index} style={{ height: `${30 + ((index * 37) % 50)}px`, animationDelay: `${-index * 0.11}s` }} />)}
    </div>
  )
  if (kind === 'toggle') return (
    <div style={{ display: 'grid', gap: '10px', width: '100%', maxWidth: '240px' }}>
      {[['Recordar agua', true], ['Pausa activa', true], ['Modo descanso', false]].map(([label, on]) => (
        <span key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '14px', background: 'rgba(255,255,255,.7)', fontSize: '13px', fontWeight: 600 }}>
          {label}<span aria-hidden="true" style={{ width: '38px', height: '22px', borderRadius: '999px', padding: '3px', background: on ? C.blueHex : '#C9D4E5', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}><span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fff' }} /></span>
        </span>
      ))}
    </div>
  )
  return <Orb size={96} />
}
export const CrFeaturesBlock = defineBlock({
  type: 'CrFeaturesBlock',
  label: 'Funciones en mosaico de vidrio',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Funciones', title: 'Todo tu bienestar,', highlight: 'en un mismo lugar', lead: 'Herramientas sencillas que aprenden de ti y te ayudan a tomar mejores decisiones cada día.',
    items: 'Conversación natural | Cuéntale cómo te sientes con tus palabras; Aura entiende el contexto y responde claro. | chat | wide\nTendencias de tu semana | Sueño, ritmo y actividad en una sola vista, con alertas cuando algo cambia. | chart | wide\nMetas que se cumplen | Objetivos pequeños y medibles que se ajustan a tu ritmo. | ring\nModo voz | Habla con Aura mientras caminas o cocinas. | wave\nRecordatorios inteligentes | Agua, pausas y descanso en el momento justo. | toggle',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, lead: { type: 'textarea', label: 'Descripción' },
    items: { type: 'textarea', label: 'Tarjetas (Título | texto | visual: chat, chart, ring, wave, toggle u orb | wide para doble ancho)' },
  },
  groups: [{ label: 'Encabezado', fields: ['eyebrow', 'title', 'highlight', 'lead'] }, { label: 'Tarjetas', fields: ['items'] }],
  render: (props) => <Features {...props} />,
})
function FeatureCard({ name, text, kind, wide, index }) {
  const pointer = usePointerVars()
  return (
    <article ref={pointer} className={`card cr-glass cr-rv${wide === 'wide' ? ' wide' : ''}`} style={{ '--i': index, '--sheen': `${index * 1.3}s` }}>
      <div className="vis"><Visual kind={kind} /></div>
      <h3>{name}</h3><p>{text}</p>
    </article>
  )
}
function Features({ eyebrow, title, highlight, lead, items }) {
  const [ref, rv] = useReveal(0.12)
  return (
    <Section innerRef={ref} rv={rv} blobs="day">
      <style>{BENTO_CSS}</style>
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} lead={lead} />
      <div className="cr-bento">{cells(items).map(([name, text, kind, wide], index) => <FeatureCard key={name + index} name={name} text={text} kind={kind} wide={wide} index={index} />)}</div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const WINDOW_CSS = `
.cr-window .frame{position:relative;border-radius:clamp(36px,6vw,80px);padding:clamp(12px,1.6vw,20px);background:linear-gradient(145deg,#C9CED6,#7E8794 40%,#B8BEC8 60%,#6C7480);box-shadow:inset 0 2px 2px rgba(255,255,255,.7),inset 0 -3px 6px rgba(0,0,0,.35),0 50px 90px -40px rgba(10,30,60,.6)}
.cr-window .frame::before{content:"";position:absolute;inset:6px;border-radius:inherit;border:1px dashed rgba(255,255,255,.35);pointer-events:none}
.cr-window .pane{position:relative;overflow:hidden;border-radius:clamp(26px,4.6vw,62px);min-height:clamp(440px,52vw,620px);display:grid;place-items:center;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),inset 0 12px 40px rgba(0,0,0,.25)}
.cr-window .glare{position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.28) 0%,transparent 26%,transparent 62%,rgba(255,255,255,.14) 74%,transparent 82%);pointer-events:none}
.cr-window .rivet{position:absolute;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#7E8794)}
`
export const CrWindowBlock = defineBlock({
  type: 'CrWindowBlock',
  label: 'Ventana con paisaje',
  category: 'atlas',
  defaultProps: {
    badge: 'Más de 10,000 personas en la lista', title: 'Enfócate en un mundo', titleStrong: 'lleno de distracciones',
    text: 'Silencia el ruido de las notificaciones y recupera tu atención para lo que de verdad importa.', ctaLabel: 'Únete a la lista', ctaHref: '/contacto',
  },
  fields: {
    badge: { type: 'text', label: 'Insignia' }, title: { type: 'text', label: 'Título' }, titleStrong: { type: 'text', label: 'Título fuerte' }, text: { type: 'textarea', label: 'Texto' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  render: (props) => <Window {...props} />,
})
function Window({ badge, title, titleStrong, text, ctaLabel, ctaHref }) {
  const [ref, rv] = useReveal(0.2)
  const scroll = useScrollVar(600)
  return (
    <Section innerRef={(node) => { ref.current = node; scroll.current = node }} rv={rv} bg="linear-gradient(180deg,#F5F9FF,#E6EEF8)">
      <style>{WINDOW_CSS}</style>
      <div className="cr-window cr-rv" style={{ '--i': 0 }}>
        <div className="frame">
          {[['18px', '50%'], ['calc(100% - 26px)', '50%'], ['50%', '10px'], ['50%', 'calc(100% - 18px)']].map(([left, top]) => <span key={left + top} className="rivet" aria-hidden="true" style={{ left, top, translate: '-50% -50%' }} />)}
          <div className="pane">
            <SkyScene />
            <div className="glare" aria-hidden="true" />
            <div style={{ position: 'relative', textAlign: 'center', padding: '40px 20px', maxWidth: '760px' }}>
              {badge && <p className="cr-pill cr-glass cr-rv" style={{ '--i': 1, margin: 0, padding: '6px 14px', color: C.ink }}>{badge}</p>}
              <h2 className="cr-rv" style={{ '--i': 2, margin: '18px 0 0', fontSize: 'clamp(32px, 5vw, 64px)', fontWeight: 500, letterSpacing: '-0.045em', lineHeight: 1.04, color: '#13233D', textShadow: '0 1px 18px rgba(255,255,255,.6)' }}>{title} <strong style={{ fontWeight: 700 }}>{titleStrong}</strong></h2>
              <p className="cr-rv" style={{ '--i': 3, margin: '16px auto 0', maxWidth: '54ch', fontSize: 'clamp(15px, 1.4vw, 18px)', lineHeight: 1.6, color: '#1E3150', textShadow: '0 1px 12px rgba(255,255,255,.7)' }}>{text}</p>
              <div className="cr-glass cr-rv" style={{ '--i': 4, display: 'inline-flex', marginTop: '26px', padding: '6px', borderRadius: '999px' }}><Btn href={ctaHref} variant="white">{ctaLabel}</Btn></div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
export const CrStepsBlock = defineBlock({
  type: 'CrStepsBlock',
  label: 'Pasos de vidrio',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Cómo funciona', title: 'Empieza en', highlight: 'tres pasos',
    steps: 'Cuéntale cómo estás | Responde unas preguntas sobre tu rutina, tu sueño y tus metas. | chat\nRecibe tu plan | Aura arma un plan diario que se ajusta a ti. | sparkle\nAvanza cada día | Sigue tu progreso y celebra cada meta cumplida. | trend',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' }, steps: { type: 'textarea', label: 'Pasos (Título | texto | icono)' } },
  render: (props) => <Steps {...props} />,
})
function Steps({ eyebrow, title, highlight, steps }) {
  const [ref, rv] = useReveal(0.25)
  const list = cells(steps)
  return (
    <Section innerRef={ref} rv={rv} blobs="day">
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} />
      <div style={{ position: 'relative', marginTop: 'clamp(40px, 5vw, 64px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '18px' }}>
        <div aria-hidden="true" style={{ position: 'absolute', left: '8%', right: '8%', top: '52px', height: '3px', borderRadius: '3px', background: 'rgba(255,255,255,.7)', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: `linear-gradient(90deg, ${C.cyan}, ${C.sky}, ${C.violet})`, transformOrigin: 'left', transform: rv === 'wait' ? 'scaleX(0)' : 'scaleX(1)', transition: 'transform 1.6s cubic-bezier(.4,.1,.2,1) .4s' }} />
        </div>
        {list.map(([name, text, icon], index) => (
          <article key={name + index} className="cr-glass cr-rv" style={{ '--i': index + 1, '--sheen': `${index * 2}s`, padding: '26px', borderRadius: '28px' }}>
            <div style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', background: `linear-gradient(145deg, ${C.sky}, ${C.blueHex})`, boxShadow: '0 10px 24px -8px rgba(10,102,232,.7), inset 0 1px 2px rgba(255,255,255,.7)' }}>
              <Icon name={icon} size={24} />
              <span style={{ position: 'absolute', right: '-6px', top: '-6px', width: '24px', height: '24px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#fff', color: C.blueHex, fontSize: '12px', fontWeight: 800 }}>{index + 1}</span>
            </div>
            <h3 style={{ margin: '20px 0 0', fontSize: '19px', fontWeight: 700 }}>{name}</h3>
            <p style={{ margin: '8px 0 0', fontSize: '15px', lineHeight: 1.6, color: C.muted }}>{text}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
const VOICES_CSS = `
.cr-voices .row{display:flex;gap:16px;width:max-content}
.cr-voices .mask{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.cr-voices .mask:hover .row{animation-play-state:paused}
@media (prefers-reduced-motion:no-preference){.cr-voices .row.a{animation:cr-marquee 60s linear infinite}.cr-voices .row.b{animation:cr-marquee-r 70s linear infinite}}
@media (prefers-reduced-motion:reduce){.cr-voices .row{flex-wrap:wrap;width:auto;justify-content:center}}
`
const parseNumber = (raw) => {
  const match = String(raw ?? '').match(/^([^\d-]*)(-?[\d.,]+)(.*)$/)
  return match ? { prefix: match[1], value: Number(match[2].replace(/,/g, '')), suffix: match[3], decimals: (match[2].split('.')[1] ?? '').length } : null
}
export const CrVoicesBlock = defineBlock({
  type: 'CrVoicesBlock',
  label: 'Cifras y opiniones en carrusel',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Opiniones', title: 'Personas que ya', highlight: 'se sienten mejor',
    stats: '4.9 | calificación promedio\n120,000+ | personas activas\n87% | duerme mejor en 30 días',
    voices: 'Lucía Fernández | Diseñadora | Por fin entiendo por qué amanezco cansada. Los recordatorios cambiaron mis noches.\nJorge Ramírez | Maestro | Hablarle a Aura mientras camino es lo mejor de mi día.\nAna Castillo | Enfermera | Claro, amable y sin rodeos. Me ayuda a cuidar mis turnos.\nDiego Morales | Programador | Las pausas activas me salvaron la espalda.\nSofía Herrera | Estudiante | Mis metas pequeñas ahora sí las cumplo.\nPablo Núñez | Chef | La vista semanal me muestra lo que antes no veía.',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' },
    stats: { type: 'textarea', label: 'Cifras (Cifra | texto)' }, voices: { type: 'textarea', label: 'Opiniones (Nombre | ocupación | texto)' },
  },
  render: (props) => <Voices {...props} />,
})
const Voice = ({ name, role, text, hidden }) => (
  <figure className="cr-glass" aria-hidden={hidden || undefined} style={{ margin: 0, width: '320px', flexShrink: 0, padding: '20px', borderRadius: '24px' }}>
    <Stars />
    <blockquote style={{ margin: '10px 0 0', fontSize: '15px', lineHeight: 1.6 }}>{text}</blockquote>
    <figcaption style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span aria-hidden="true" style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: 800, color: '#fff', background: `linear-gradient(145deg, ${C.cyan}, ${C.violet})` }}>{name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
      <span><strong style={{ display: 'block', fontSize: '14px' }}>{name}</strong><span style={{ fontSize: '13px', color: C.muted }}>{role}</span></span>
    </figcaption>
  </figure>
)
function Voices({ eyebrow, title, highlight, stats, voices }) {
  const [ref, rv] = useReveal(0.2)
  const list = cells(voices)
  const half = Math.ceil(list.length / 2)
  // Each half of a marquee row must be wider than the widest screen, or a gap shows while it loops.
  const row = (items, cls) => {
    const half = items.length ? Array.from({ length: Math.ceil(6 / items.length) }, () => items).flat() : []
    return <div className="mask"><div className={`row ${cls}`}>{[...half, ...half].map(([name, role, text], index) => <Voice key={cls + index} name={name} role={role} text={text} hidden={index >= items.length} />)}</div></div>
  }
  return (
    <Section innerRef={ref} rv={rv} blobs="day" bg="#EEF5FF">
      <style>{VOICES_CSS}</style>
      <Heading eyebrow={eyebrow} title={title} highlight={highlight} />
      <div className="cr-rv" style={{ '--i': 3, margin: '32px auto 0', maxWidth: '820px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {cells(stats).map(([value, label]) => {
          const parsed = parseNumber(value)
          return (
            <div key={label} className="cr-glass" style={{ padding: '18px', borderRadius: '22px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '34px', fontWeight: 700, letterSpacing: '-0.03em' }}>{parsed ? <>{parsed.prefix}<CountUp value={parsed.value} decimals={parsed.decimals} active={rv === 'in'} />{parsed.suffix}</> : value}</p>
              <p style={{ margin: '2px 0 0', fontSize: '14px', color: C.muted }}>{label}</p>
            </div>
          )
        })}
      </div>
      <div className="cr-voices cr-rv" style={{ '--i': 4, marginTop: '36px', display: 'grid', gap: '16px', marginInline: 'calc(-1 * clamp(18px, 4vw, 40px))' }}>
        {row(list.slice(0, half), 'a')}
        {row(list.slice(half), 'b')}
      </div>
    </Section>
  )
}
