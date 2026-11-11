import { useEffect, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { D, SANS, MONO, DEV_CSS, WRAP, lines, cells, safeHref, Stroke, Icon, BeanbagScene, WindowScene, DeskScene, Device } from './devfolioArt.jsx'

// Blocks of the "Portafolio Dev" template: warm paper background, near-black ink and one orange accent, with
// hand-drawn inline-SVG scenes. System fonts only; motion is CSS (or off) and every effect respects reduced motion.
const BG = 'var(--runly-color-bg, #FBF6EE)'
const INK = 'var(--runly-color-fg, #1A1A1A)'
const MUTED = 'var(--runly-color-muted, #5B5249)'

export const Eyebrow = ({ children }) => (children ? <p style={{ margin: 0, fontFamily: MONO, fontSize: '13px', fontWeight: 600, letterSpacing: '.04em', color: D.orangeText }}>{children}</p> : null)
export const SectionTitle = ({ children, eyebrow, as: Tag = 'h2', size = 'clamp(26px, 3vw, 36px)', style }) => (
  <div style={style}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <Tag style={{ margin: eyebrow ? '8px 0 0' : 0, fontFamily: SANS, fontSize: size, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: INK }}>{children}</Tag>
    <Stroke style={{ marginTop: '10px' }} />
  </div>
)
export const Btn = ({ href, children, variant = 'solid', icon = 'arrow' }) => (children
  ? <a className="dv-btn" href={safeHref(href)} style={variant === 'solid' ? { background: D.orange, color: D.ink } : { background: 'transparent', color: D.ink }}>{children}<Icon name={icon} size={18} stroke={2.2} /></a>
  : null)
export const Section = ({ children, id, pad = 'clamp(48px, 6vw, 84px)', bg = BG, ...rest }) => (
  <section id={id} className="dv" style={{ background: bg, padding: `${pad} 0`, fontFamily: SANS, color: INK }} {...rest}><style>{DEV_CSS}</style><div style={WRAP}>{children}</div></section>
)

// ---------------------------------------------------------------------------------------------------------------
const NAV_CSS = `
.dv-nav a.nl{position:relative;display:inline-flex;align-items:center;min-height:44px;padding:0 4px;color:${D.ink};font-weight:600;font-size:15px;text-decoration:none}
.dv-nav a.nl::after{content:"";position:absolute;left:4px;right:4px;bottom:6px;height:3px;border-radius:3px;background:${D.orange};transform:scaleX(0);transform-origin:left;transition:transform .22s ease}
.dv-nav a.nl:hover::after,.dv-nav a.nl[aria-current="page"]::after{transform:scaleX(1)}
.dv-nav .dn-links{display:flex;align-items:center;gap:clamp(14px,2.4vw,32px)}
.dv-nav .dn-m{display:none}
@media (max-width:860px){.dv-nav .dn-links{display:none}.dv-nav .dn-m{display:block}}
.dv-nav .dn-m summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:2px solid ${D.ink};border-radius:8px;font-weight:700;font-size:14px}
.dv-nav .dn-m summary::-webkit-details-marker{display:none}
.dv-nav .dn-m[open] summary{background:${D.ink};color:${D.cream}}
.dv-nav .dn-panel{position:absolute;left:auto;right:0;width:min(100vw,360px);top:100%;background:${D.cream};border-bottom:2px solid ${D.ink};padding:8px clamp(20px,4vw,40px) 20px;display:grid;gap:2px}
.dv-nav .dn-panel a{display:flex;align-items:center;min-height:48px;color:${D.ink};font-weight:600;text-decoration:none;border-bottom:1px solid ${D.line}}
.dv-nav .dn-panel a[aria-current="page"]{color:${D.orangeText}}
`
export const DevNavbarBlock = defineBlock({
  type: 'DevNavbarBlock',
  label: 'Barra de navegación dev',
  category: 'navigation',
  defaultProps: { brand: 'DR', links: 'Inicio | /\nSobre mí | /sobre-mi\nProyectos | /proyectos\nExperiencia | /experiencia\nContacto | /contacto', active: '/', ctaLabel: 'Hablemos', ctaHref: '/contacto' },
  fields: {
    brand: { type: 'text', label: 'Iniciales o nombre' }, links: { type: 'textarea', label: 'Enlaces (Etiqueta | /ruta, uno por línea)' }, active: { type: 'text', label: 'Ruta activa' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  groups: [{ label: 'Contenido', fields: ['brand', 'links', 'active'] }, { label: 'Botón', fields: ['ctaLabel', 'ctaHref'] }],
  render({ brand, links, active, ctaLabel, ctaHref }) {
    const items = cells(links).map(([label, href]) => ({ label, href: safeHref(href) }))
    return (
      <header className="dv dv-nav" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'color-mix(in srgb, var(--runly-color-bg, #FBF6EE) 92%, transparent)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${D.line}`, fontFamily: SANS }}>
        <style>{`${DEV_CSS}${NAV_CSS}`}</style>
        <div style={{ ...WRAP, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', minHeight: '72px' }}>
          <a href="/" aria-label={`${brand}, inicio`} style={{ display: 'inline-flex', alignItems: 'baseline', minHeight: '44px', alignContent: 'center', color: D.ink, textDecoration: 'none', fontWeight: 900, fontSize: '30px', letterSpacing: '-0.06em', lineHeight: 1 }}>
            {brand}<span aria-hidden="true" style={{ display: 'inline-block', width: '9px', height: '9px', marginLeft: '2px', background: D.orange, borderRadius: '2px' }} />
          </a>
          <nav className="dn-links" aria-label="Principal">
            {items.map((item) => <a key={item.href + item.label} className="nl" href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>)}
            {ctaLabel && <a className="dv-btn" href={safeHref(ctaHref)} style={{ minHeight: '44px', padding: '0 20px', background: D.ink, color: D.cream, fontSize: '14px' }}>{ctaLabel}</a>}
          </nav>
          <details className="dn-m">
            <summary>Menú</summary>
            <nav className="dn-panel" aria-label="Principal móvil">
              {items.map((item) => <a key={item.href + item.label} href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>)}
              {ctaLabel && <a href={safeHref(ctaHref)} style={{ color: D.orangeText, fontWeight: 800, borderBottom: 0 }}>{ctaLabel} &rarr;</a>}
            </nav>
          </details>
        </div>
      </header>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
function Typed({ phrases, prefix }) {
  const list = phrases.length ? phrases : ['']
  const [text, setText] = useState(list[0])
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || list.length < 1) return undefined
    let index = 0, count = list[0].length, deleting = true, timer
    const tick = () => {
      const word = list[index]
      if (deleting) { count -= 1; setText(word.slice(0, Math.max(count, 0))); if (count <= 0) { deleting = false; index = (index + 1) % list.length } timer = setTimeout(tick, 40) }
      else { count += 1; setText(list[index].slice(0, count)); if (count >= list[index].length) { deleting = true; timer = setTimeout(tick, 1900) } else timer = setTimeout(tick, 75) }
    }
    timer = setTimeout(tick, 1900)
    return () => clearTimeout(timer)
  }, [phrases.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <p style={{ margin: 0, fontFamily: MONO, fontSize: 'clamp(14px, 1.6vw, 17px)', color: INK, minHeight: '1.6em' }}>
      <span style={{ color: D.orangeText }}>{'> '}</span>{prefix} <strong style={{ fontWeight: 700 }}>{text}</strong><span aria-hidden="true" className="dv-cursor" style={{ display: 'inline-block', width: '9px', height: '1.1em', marginLeft: '3px', verticalAlign: '-0.18em', background: D.orange }} />
      <style>{'@media (prefers-reduced-motion:no-preference){.dv-cursor{animation:dv-blink 1.1s steps(1) infinite}}'}</style>
    </p>
  )
}

function Hero({ greeting, firstName, lastName, role, typedPrefix, phrases, description, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, status }) {
  return (
    <section className="dv" style={{ position: 'relative', overflow: 'hidden', background: BG, fontFamily: SANS, color: INK, padding: 'clamp(24px, 4vw, 56px) 0 clamp(40px, 5vw, 72px)' }}>
      <style>{DEV_CSS}</style>
      <div aria-hidden="true" className="dv-par" style={{ position: 'absolute', right: '-6%', top: '2%', width: 'min(62vw, 640px)', aspectRatio: '1', borderRadius: '50%', background: `radial-gradient(circle at 50% 50%, ${D.peach} 0%, ${D.peach} 55%, transparent 72%)`, opacity: 0.9 }} />
      <div style={{ ...WRAP, position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 'clamp(24px, 4vw, 64px)', alignItems: 'center' }}>
        <div>
          <p className="dv-in" style={{ '--i': 0, margin: 0, fontSize: '18px', fontWeight: 700 }}>{greeting}</p>
          <Stroke className="dv-in" width={46} style={{ margin: '6px 0 14px' }} />
          <h1 className="dv-in" style={{ '--i': 1, margin: 0, fontSize: 'clamp(44px, 6.4vw, 88px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.98 }}>
            {firstName} <span style={{ color: D.display }}>{lastName}</span>
          </h1>
          <p className="dv-in" style={{ '--i': 2, margin: '18px 0 0', fontSize: 'clamp(17px, 1.7vw, 21px)', fontWeight: 700, color: MUTED, lineHeight: 1.35, maxWidth: '30ch' }}>{role}</p>
          <div className="dv-in" style={{ '--i': 3, margin: '18px 0 0', padding: '12px 14px', background: D.white, border: `1.5px solid ${D.line}`, borderRadius: '8px', maxWidth: '440px' }}><Typed phrases={phrases} prefix={typedPrefix} /></div>
          <p className="dv-in" style={{ '--i': 4, margin: '18px 0 0', maxWidth: '46ch', fontSize: '17px', lineHeight: 1.7, color: MUTED }}>{description}</p>
          <div className="dv-in" style={{ '--i': 5, marginTop: '28px', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            <Btn href={ctaHref}>{ctaLabel}</Btn>
            <Btn href={ctaSecondHref} variant="outline" icon="download">{ctaSecondLabel}</Btn>
          </div>
          {status && <p className="dv-in" style={{ '--i': 6, margin: '24px 0 0', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: MONO, fontSize: '13px', color: MUTED }}><span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: D.orange }} />{status}</p>}
        </div>
        <div className="dv-par" style={{ maxWidth: '620px', justifySelf: 'center', width: '100%' }}><BeanbagScene /></div>
      </div>
    </section>
  )
}

export const DevHeroBlock = defineBlock({
  type: 'DevHeroBlock',
  label: 'Portada de portafolio',
  category: 'atlas',
  defaultProps: {
    greeting: 'Hola, soy', firstName: 'Daniel', lastName: 'Ramos', role: 'Ingeniero de software y desarrollador full stack',
    typedPrefix: 'Hoy construyo', phrases: 'APIs rápidas y fiables\ninterfaces claras y accesibles\nproductos que se pueden mantener',
    description: 'Creo productos digitales que resuelven problemas reales. De la idea al despliegue, convierto retos complejos en soluciones simples y bien cuidadas.',
    ctaLabel: 'Ver mi trabajo', ctaHref: '/proyectos', ctaSecondLabel: 'Descargar CV', ctaSecondHref: '#', status: 'Disponible para nuevos proyectos desde enero',
  },
  fields: {
    greeting: { type: 'text', label: 'Saludo' }, firstName: { type: 'text', label: 'Nombre' }, lastName: { type: 'text', label: 'Apellido (en naranja)' }, role: { type: 'text', label: 'Puesto' },
    typedPrefix: { type: 'text', label: 'Texto antes de la máquina de escribir' }, phrases: { type: 'textarea', label: 'Frases animadas (una por línea)' }, description: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' }, ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario (CV)' },
    status: { type: 'text', label: 'Estado de disponibilidad' },
  },
  groups: [{ label: 'Presentación', fields: ['greeting', 'firstName', 'lastName', 'role', 'description', 'status'] }, { label: 'Máquina de escribir', fields: ['typedPrefix', 'phrases'] }, { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] }],
  render: (props) => <Hero {...props} phrases={lines(props.phrases)} />,
})

const SCENES = { escritorio: DeskScene, ventana: WindowScene, puf: BeanbagScene }
// ---------------------------------------------------------------------------------------------------------------
export const DevAboutBlock = defineBlock({
  type: 'DevAboutBlock',
  label: 'Sobre mí con rasgos',
  category: 'atlas',
  defaultProps: {
    eyebrow: '01 / sobre mí', title: 'Sobre mí', body: 'Me apasiona crear soluciones limpias, eficientes y escalables con buenas experiencias de usuario. Disfruto trabajar con tecnologías que empujan la web hacia adelante y con equipos que cuidan los detalles.',
    traits: 'Resuelvo problemas | bulb\nDetallista | target\nCódigo limpio | code\nSiempre aprendiendo | book\nTrabajo en equipo | users\nMente curiosa | spark', linkLabel: 'Conoce mi historia', linkHref: '/sobre-mi', scene: 'ventana',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, body: { type: 'textarea', label: 'Texto' },
    traits: { type: 'textarea', label: 'Rasgos (Texto | icono, uno por línea)' }, linkLabel: { type: 'text', label: 'Enlace' }, linkHref: { type: 'link', label: 'Destino del enlace' },
    scene: { type: 'select', label: 'Ilustración', options: [{ value: 'ventana', label: 'Ventana y taza' }, { value: 'puf', label: 'Puf y laptop' }, { value: 'escritorio', label: 'Escritorio' }] },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'body', 'traits', 'scene'] }, { label: 'Enlace', fields: ['linkLabel', 'linkHref'] }],
  render({ eyebrow, title, body, traits, linkLabel, linkHref, scene }) {
    const Scene = SCENES[scene] ?? WindowScene
    return (
      <Section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(28px, 5vw, 72px)', alignItems: 'center' }}>
          <div className="dv-par" style={{ maxWidth: '460px', width: '100%', justifySelf: 'center' }}><Scene /></div>
          <div>
            <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
            <p style={{ margin: '22px 0 0', maxWidth: '52ch', fontSize: '17px', lineHeight: 1.75, color: MUTED }}>{body}</p>
            <ul style={{ listStyle: 'none', margin: '30px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '16px 24px' }}>
              {cells(traits).map(([label, icon], index) => (
                <li key={label} className="dv-rv" style={{ '--i': index, display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 700, fontSize: '15px' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: '40px', height: '40px', borderRadius: '10px', background: D.peach, color: D.orangeText }}><Icon name={icon} size={22} /></span>{label}
                </li>
              ))}
            </ul>
            {linkLabel && <a href={safeHref(linkHref)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', marginTop: '18px', color: INK, fontWeight: 700, textDecoration: 'underline', textDecorationColor: D.orange, textDecorationThickness: '3px', textUnderlineOffset: '6px' }}>{linkLabel} <Icon name="arrow" size={18} stroke={2.2} /></a>}
          </div>
        </div>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const TILE_CSS = `
.dv-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:112px;padding:16px 8px;background:${D.white};border:1.5px solid ${D.line};border-radius:16px;color:${D.ink};font-weight:600;font-size:13px;text-align:center;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.dv-tile:hover{transform:translateY(-5px);border-color:${D.ink};box-shadow:0 8px 0 -2px ${D.orange}}
.dv-tile:hover svg{color:${D.orangeText}}
.dv-tile svg{transition:color .2s ease}
`
export const DevSkillsBlock = defineBlock({
  type: 'DevSkillsBlock',
  label: 'Habilidades y tecnologías',
  category: 'atlas',
  defaultProps: {
    eyebrow: '02 / stack', title: 'Habilidades y tecnologías',
    skills: 'JavaScript | js\nTypeScript | ts\nReact | react\nNext.js | next\nNode.js | node\nMongoDB | mongo\nTailwind CSS | tailwind\nGit y GitHub | git\nMás | dots',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, skills: { type: 'textarea', label: 'Tecnologías (Nombre | icono, una por línea)' } },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'skills'] }],
  render({ eyebrow, title, skills }) {
    return (
      <Section>
        <style>{TILE_CSS}</style>
        <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
        <ul style={{ listStyle: 'none', margin: '28px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 104px), 1fr))', gap: '14px' }}>
          {cells(skills).map(([name, icon], index) => (
            <li key={name} className="dv-tile dv-rv" style={{ '--i': index }}><Icon name={icon} size={34} stroke={1.6} />{name}</li>
          ))}
        </ul>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const CARD_CSS = `
.dv-card{position:relative;display:flex;flex-direction:column;background:${D.white};border:1.5px solid ${D.line};border-radius:18px;overflow:hidden;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}
.dv-card:hover{transform:translateY(-6px);border-color:${D.ink};box-shadow:0 10px 0 -3px ${D.orange}}
.dv-card .pn{padding:20px 20px 8px;background:${D.peach}}
.dv-card .pn.alt{background:#F1ECE4}
.dv-card a.ttl{color:${D.ink};text-decoration:none}
.dv-card a.ttl::after{content:"";position:absolute;inset:0}
.dv-card a.ttl:focus-visible{outline:none}
.dv-card:has(a.ttl:focus-visible){outline:3px solid ${D.ink};outline-offset:3px}
.dv-chip{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border:1.5px solid ${D.ink};border-radius:999px;background:transparent;color:${D.ink};font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;transition:background .15s ease,color .15s ease}
.dv-chip:hover{background:${D.peach}}
.dv-chip[aria-pressed="true"]{background:${D.ink};color:${D.cream}}
`
const Tags = ({ tags }) => (
  <p style={{ margin: 'auto 0 0', paddingTop: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', fontFamily: MONO, fontSize: '12.5px', color: MUTED }}>
    {tags.map((tag, i) => <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>{i > 0 && <span aria-hidden="true" style={{ width: '4px', height: '4px', borderRadius: '50%', background: D.orange }} />}{tag}</span>)}
  </p>
)
function WorkGrid({ projects, showFilters, allLabel }) {
  const [active, setActive] = useState('')
  const categories = [...new Set(projects.map((p) => p.category).filter(Boolean))]
  const shown = projects.filter((p) => !active || p.category === active)
  return (
    <>
      {showFilters && categories.length > 1 && (
        <div role="group" aria-label="Filtrar proyectos" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', margin: '26px 0 0' }}>
          {['', ...categories].map((cat) => <button key={cat || 'all'} type="button" className="dv-chip" aria-pressed={active === cat} onClick={() => setActive(cat)}>{cat || allLabel}</button>)}
        </div>
      )}
      <ul style={{ listStyle: 'none', margin: '28px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '22px' }}>
        {shown.map((p, index) => (
          <li key={p.title} style={{ display: 'flex' }} className="dv-rv">
            <article className="dv-card" style={{ flex: 1 }}>
              <div className={`pn${index % 3 === 1 ? ' alt' : ''}`}><div style={{ maxWidth: '260px', marginInline: 'auto' }}><Device type={p.device} kind={projects.indexOf(p)} /></div></div>
              <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em' }}><a className="ttl" href={safeHref(p.href)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>{p.title}<span style={{ color: D.orangeText }}><Icon name="link" size={17} stroke={2} /></span></a></h3>
                <p style={{ margin: '8px 0 0', fontSize: '15px', lineHeight: 1.6, color: MUTED }}>{p.description}</p>
                <Tags tags={p.tags} />
              </div>
            </article>
          </li>
        ))}
      </ul>
    </>
  )
}
const parseProjects = (raw) => cells(raw).map(([title, description, tags, device, category, href]) => ({ title, description, tags: String(tags ?? '').split(',').map((t) => t.trim()).filter(Boolean), device: ['monitor', 'laptop', 'phone'].includes(device) ? device : 'monitor', category: category || '', href: href || '#' }))

export const DevWorkBlock = defineBlock({
  type: 'DevWorkBlock',
  label: 'Trabajo seleccionado',
  category: 'atlas',
  defaultProps: {
    eyebrow: '03 / proyectos', title: 'Trabajo seleccionado', linkLabel: 'Ver todos los proyectos', linkHref: '/proyectos', showFilters: false, allLabel: 'Todos',
    projects: 'Lumen Académico | Plataforma de cursos en línea con analítica de progreso y pagos integrados. | Next.js, TypeScript, Tailwind | monitor | Web | #\nPanel Meridiano | Tablero de visualización con resultados escolares del periodo 2016-2025. | Next.js, Recharts, Node.js | laptop | Datos | #\nAula Segura | App de aprendizaje con contenido protegido y accesos por rol. | Next.js, MongoDB, Stripe | phone | Móvil | #',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, linkLabel: { type: 'text', label: 'Enlace superior' }, linkHref: { type: 'link', label: 'Destino del enlace' },
    showFilters: { type: 'toggle', label: 'Mostrar filtros por categoría' }, allLabel: { type: 'text', label: 'Texto del filtro "todos"' },
    projects: { type: 'textarea', label: 'Proyectos (Título | Descripción | Tecnologías, separadas por coma | monitor, laptop o phone | Categoría | Enlace)' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'projects'] }, { label: 'Enlace y filtros', fields: ['linkLabel', 'linkHref', 'showFilters', 'allLabel'] }],
  render({ eyebrow, title, linkLabel, linkHref, showFilters, allLabel, projects }) {
    return (
      <Section>
        <style>{CARD_CSS}</style>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 24px' }}>
          <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
          {linkLabel && <a href={safeHref(linkHref)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', color: INK, fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>{linkLabel} <span style={{ color: D.orangeText }}><Icon name="arrow" size={18} stroke={2.2} /></span></a>}
        </div>
        <WorkGrid projects={parseProjects(projects)} showFilters={showFilters} allLabel={allLabel} />
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
export const DevPageHeroBlock = defineBlock({
  type: 'DevPageHeroBlock',
  label: 'Encabezado de página dev',
  category: 'atlas',
  defaultProps: { path: '~/proyectos', title: 'Cosas que', highlight: 'he construido', subtitle: 'Una selección de productos en los que he trabajado: del primer boceto al despliegue.', scene: 'escritorio' },
  fields: {
    path: { type: 'text', label: 'Ruta decorativa' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabras en naranja' }, subtitle: { type: 'textarea', label: 'Descripción' },
    scene: { type: 'select', label: 'Ilustración', options: [{ value: 'escritorio', label: 'Escritorio' }, { value: 'ventana', label: 'Ventana y taza' }, { value: 'puf', label: 'Puf y laptop' }] },
  },
  groups: [{ label: 'Contenido', fields: ['path', 'title', 'highlight', 'subtitle'] }, { label: 'Ilustración', fields: ['scene'] }],
  render({ path, title, highlight, subtitle, scene }) {
    const Scene = SCENES[scene] ?? DeskScene
    return (
      <section className="dv" style={{ position: 'relative', overflow: 'hidden', background: `linear-gradient(180deg, ${D.peach} 0%, ${BG} 100%)`, fontFamily: SANS, color: INK, padding: 'clamp(32px, 5vw, 72px) 0 clamp(24px, 3vw, 40px)' }}>
        <style>{DEV_CSS}</style>
        <div style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(24px, 4vw, 56px)', alignItems: 'center' }}>
          <div>
            <p className="dv-in" style={{ '--i': 0, margin: 0, fontFamily: MONO, fontSize: '14px', fontWeight: 600, color: D.orangeText }}>{path}</p>
            <h1 className="dv-in" style={{ '--i': 1, margin: '14px 0 0', fontSize: 'clamp(38px, 5.6vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.02 }}>{title} <span style={{ color: D.display }}>{highlight}</span></h1>
            <Stroke className="dv-in" width={96} style={{ margin: '14px 0 0' }} />
            <p className="dv-in" style={{ '--i': 3, margin: '20px 0 0', maxWidth: '46ch', fontSize: '18px', lineHeight: 1.7, color: MUTED }}>{subtitle}</p>
          </div>
          <div className="dv-par" style={{ maxWidth: '520px', width: '100%', justifySelf: 'center' }}><Scene /></div>
        </div>
      </section>
    )
  },
})
