import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Blocks of the "El Sabor" restaurant template: warm editorial dining with a chalkboard hero and a paper menu board.
// System font stacks only; chalk and paper textures are plain CSS gradients, the stamp is inline SVG.
// Motion is CSS-only and switched off for reduced motion.
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"
const CHALK = '#231A15'
const GOLD = '#E6B85C'
const BRICK = 'var(--runly-color-primary, #8C2F1B)'
const INK = 'var(--runly-color-fg, #2A1810)'
const MUTED = 'var(--runly-color-muted, #6B5445)'

const lines = (raw) => String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
const cells = (line) => line.split('|').map((c) => c.trim())

const CSS = `
@keyframes rst-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes rst-spin{to{transform:rotate(360deg)}}
@keyframes rst-sway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(-.6deg)}}
.rst-line{animation:rst-rise .7s ease-out both}
.rst-stamp{animation:rst-spin 48s linear infinite}
.rst-board{animation:rst-sway 9s ease-in-out infinite;transform-origin:50% 0}
.rst-btn{transition:transform .2s ease,background .2s ease}
.rst-btn:hover{transform:translateY(-2px)}
.rst-btn:focus-visible{outline:3px solid ${GOLD};outline-offset:3px}
@media (prefers-reduced-motion: reduce){.rst *{animation:none!important;transition:none!important}}
`

const chalkBg = {
  background: `radial-gradient(120% 90% at 18% 0%, rgba(255,235,205,.09), transparent 55%), radial-gradient(90% 80% at 100% 100%, rgba(230,184,92,.08), transparent 60%), repeating-linear-gradient(115deg, rgba(255,255,255,.018) 0 2px, transparent 2px 7px), ${CHALK}`,
}
const paperBg = {
  background: 'repeating-linear-gradient(0deg, rgba(120,80,40,.045) 0 1px, transparent 1px 30px), radial-gradient(100% 70% at 50% 0%, #FFF9EC, transparent 70%), #F8EEDB',
}

function Eyebrow({ children, color }) {
  if (!children) return null
  return (
    <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '14px', fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color }}>
      <span aria-hidden="true" style={{ width: '36px', height: '1px', background: 'currentColor' }} />{children}
    </p>
  )
}

// "Name ......... $9.00" with a dotted leader; the price keeps tabular figures so columns line up.
function Leader({ name, price, desc, color, descColor, priceColor }) {
  return (
    <li style={{ listStyle: 'none', padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: 600, color }}>{name}</span>
        <span aria-hidden="true" style={{ flex: 1, minWidth: '16px', borderBottom: `2px dotted ${descColor}`, opacity: 0.55, transform: 'translateY(-4px)' }} />
        {price && <span style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: priceColor }}>{price}</span>}
      </div>
      {desc && <p style={{ margin: '4px 0 0', maxWidth: '44ch', fontFamily: SANS, fontSize: '15px', lineHeight: 1.55, color: descColor }}>{desc}</p>}
    </li>
  )
}

function Stamp({ text }) {
  const label = `${text} · ${text} · `
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" width="108" height="108" style={{ display: 'block' }}>
      <circle cx="60" cy="60" r="58" fill={GOLD} />
      <circle cx="60" cy="60" r="50" fill="none" stroke={CHALK} strokeWidth="1" strokeDasharray="2 3" />
      <defs><path id="rst-ring" d="M60 60 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" /></defs>
      <g className="rst-stamp" style={{ transformOrigin: '60px 60px' }}>
        <text fontFamily={SERIF} fontSize="11" fontWeight="700" fill={CHALK}><textPath href="#rst-ring" textLength="236" lengthAdjust="spacing">{label.toUpperCase()}</textPath></text>
      </g>
      <path d="M60 38c-8 8-8 14 0 20 8-6 8-12 0-20zm-14 24c0 10 6 16 14 16s14-6 14-16c-8 4-20 4-28 0z" fill={CHALK} />
    </svg>
  )
}

function Cta({ label, href, solid }) {
  if (!label) return null
  return (
    <a className="rst-btn" href={href || '#'} style={{ display: 'inline-flex', alignItems: 'center', minHeight: '48px', padding: '0 28px', borderRadius: '2px', fontFamily: SANS, fontSize: '14px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', textDecoration: 'none', background: solid ? GOLD : 'transparent', color: solid ? CHALK : '#F5E9D3', border: `1.5px solid ${solid ? GOLD : 'rgba(245,233,211,.55)'}` }}>{label}</a>
  )
}

function RestoHero({ size, eyebrow, title, accent, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, boardTitle, dishes, stamp }) {
  const full = size !== 'page'
  const rows = lines(dishes).slice(0, 5).map(cells)
  return (
    <section className="rst" style={{ ...chalkBg, position: 'relative', overflow: 'hidden', padding: full ? 'clamp(64px, 9vw, 120px) 24px clamp(80px, 10vw, 136px)' : 'clamp(56px, 7vw, 96px) 24px', color: '#F5E9D3' }}>
      <style>{CSS}</style>
      <div aria-hidden="true" style={{ position: 'absolute', inset: '14px', border: '1px solid rgba(245,233,211,.16)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: '1200px', marginInline: 'auto', display: 'grid', gridTemplateColumns: full && rows.length ? 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' : '1fr', gap: 'clamp(40px, 6vw, 88px)', alignItems: 'center' }}>
        <div>
          <Eyebrow color={GOLD}>{eyebrow}</Eyebrow>
          <h1 className="rst-line" style={{ margin: '22px 0 0', fontFamily: SERIF, fontWeight: 400, fontSize: full ? 'clamp(48px, 8.4vw, 118px)' : 'clamp(40px, 6vw, 84px)', lineHeight: 0.98, letterSpacing: '-0.03em', color: '#FFF6E5' }}>
            {title}{accent && <> <em style={{ color: GOLD, fontWeight: 400 }}>{accent}</em></>}
          </h1>
          {subtitle && <p className="rst-line" style={{ animationDelay: '.12s', margin: '24px 0 0', maxWidth: '46ch', fontFamily: SANS, fontSize: '18px', lineHeight: 1.7, color: 'rgba(245,233,211,.86)' }}>{subtitle}</p>}
          {(ctaLabel || ctaSecondLabel) && (
            <div className="rst-line" style={{ animationDelay: '.24s', marginTop: '34px', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
              <Cta label={ctaLabel} href={ctaHref} solid />
              <Cta label={ctaSecondLabel} href={ctaSecondHref} />
            </div>
          )}
        </div>
        {full && rows.length > 0 && (
          <div style={{ position: 'relative', justifySelf: 'center', width: '100%', maxWidth: '440px', paddingTop: '14px' }}>
            <div className="rst-board" style={{ ...paperBg, position: 'relative', padding: '38px 34px 30px', color: INK, boxShadow: '0 40px 80px rgba(0,0,0,.45), 0 2px 0 rgba(255,255,255,.4) inset' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: '-14px', left: '50%', width: '110px', height: '28px', transform: 'translateX(-50%) rotate(-2deg)', background: 'rgba(230,184,92,.75)' }} />
              <p style={{ margin: 0, textAlign: 'center', fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.28em', textTransform: 'uppercase', color: BRICK }}>{boardTitle}</p>
              <ul style={{ margin: '14px 0 0', padding: 0 }}>
                {rows.map(([name, price, desc], i) => (
                  <div key={name} className="rst-line" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
                    <Leader name={name} price={price} desc={desc} color={INK} descColor={MUTED} priceColor={BRICK} />
                  </div>
                ))}
              </ul>
              <p style={{ margin: '10px 0 0', textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: '15px', color: MUTED }}>La carta cambia con el mercado.</p>
            </div>
            {stamp && <div style={{ position: 'absolute', right: '-12px', bottom: '-34px' }}><Stamp text={stamp} /></div>}
          </div>
        )}
      </div>
    </section>
  )
}

export const RestoHeroBlock = defineBlock({
  type: 'RestoHeroBlock',
  label: 'Restaurante: portada con pizarra',
  category: 'atlas',
  defaultProps: {
    size: 'full', eyebrow: 'Cocina de mercado desde 2012', title: 'Una mesa para', accent: 'quedarse',
    subtitle: 'Producto de temporada, fuego lento y recetas de casa. Cenas sin prisa en el corazón de la ciudad.',
    ctaLabel: 'Reservar mesa', ctaHref: '/contacto', ctaSecondLabel: 'Ver la carta', ctaSecondHref: '/menu',
    boardTitle: 'Hoy en la mesa',
    dishes: 'Ceviche de camarón | 13 | Limón, cilantro y chile serrano\nPollo en mole negro | 22 | Treinta ingredientes, arroz y frijoles\nFilete a las brasas | 32 | 300 g con guarnición a elegir\nFlan de cajeta | 6 | Receta de la abuela',
    stamp: 'Hecho a mano',
  },
  fields: {
    size: { type: 'select', label: 'Tamaño', options: [{ value: 'full', label: 'Portada completa' }, { value: 'page', label: 'Encabezado de página' }] },
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, accent: { type: 'text', label: 'Palabra destacada (cursiva)' },
    subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    boardTitle: { type: 'text', label: 'Título de la pizarra' },
    dishes: { type: 'textarea', label: 'Platillos (Nombre | Precio | Descripción, máx. 5)' },
    stamp: { type: 'text', label: 'Texto del sello (vacío = sin sello)' },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'accent', 'subtitle'] },
    { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
    { label: 'Pizarra', fields: ['boardTitle', 'dishes', 'stamp'] },
    { label: 'Estilo', fields: ['size'] },
  ],
  render: (props) => <RestoHero {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
function parseCourses(raw) {
  return String(raw ?? '').split(/\n---\n/).map((chunk) => {
    const [title, ...rest] = lines(chunk)
    return { title, items: rest.map(cells).filter(([name]) => name) }
  }).filter((c) => c.title)
}

function RestoMenu({ eyebrow, title, subtitle, currency, tone, menu }) {
  const dark = tone === 'chalk'
  const courses = parseCourses(menu)
  const fg = dark ? '#FFF6E5' : INK
  const sub = dark ? 'rgba(245,233,211,.8)' : MUTED
  const accent = dark ? GOLD : BRICK
  return (
    <section className="rst" style={{ ...(dark ? chalkBg : paperBg), padding: 'clamp(64px, 9vw, 120px) 24px', color: fg }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: '1120px', marginInline: 'auto' }}>
        <header style={{ textAlign: 'center', maxWidth: '640px', marginInline: 'auto' }}>
          {eyebrow && <p style={{ margin: 0, fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.28em', textTransform: 'uppercase', color: accent }}>{eyebrow}</p>}
          <h2 style={{ margin: '14px 0 0', fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(40px, 6vw, 76px)', lineHeight: 1, letterSpacing: '-0.025em' }}>{title}</h2>
          <svg aria-hidden="true" width="140" height="14" viewBox="0 0 140 14" style={{ margin: '20px auto 0', display: 'block' }}><path d="M0 7h56M84 7h56" stroke={accent} strokeWidth="1" /><path d="M70 0l6 7-6 7-6-7z" fill={accent} /></svg>
          {subtitle && <p style={{ margin: '18px 0 0', fontFamily: SANS, fontSize: '17px', lineHeight: 1.65, color: sub }}>{subtitle}</p>}
        </header>
        <div style={{ marginTop: 'clamp(40px, 6vw, 72px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'clamp(36px, 5vw, 64px) clamp(32px, 6vw, 88px)' }}>
          {courses.map((course, i) => (
            <div key={course.title}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', paddingBottom: '12px', borderBottom: `1px solid ${dark ? 'rgba(245,233,211,.3)' : 'rgba(42,24,16,.28)'}` }}>
                <span aria-hidden="true" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '44px', lineHeight: 1, color: accent }}>{String(i + 1).padStart(2, '0')}</span>
                <h3 style={{ margin: 0, fontFamily: SANS, fontSize: '14px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase' }}>{course.title}</h3>
              </div>
              <ul style={{ margin: '8px 0 0', padding: 0 }}>
                {course.items.map(([name, desc, price]) => (
                  <Leader key={name} name={name} desc={desc} price={price ? `${currency || ''}${price}` : ''} color={fg} descColor={sub} priceColor={accent} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export const RestoMenuBlock = defineBlock({
  type: 'RestoMenuBlock',
  label: 'Restaurante: carta numerada',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'La carta', title: 'Lo que servimos', subtitle: 'Platillos de temporada, hechos al momento.', currency: '$', tone: 'paper',
    menu: 'Para empezar\nEnsalada de la casa | Mixta con aderezo balsámico y manchego | 9\nSopa de fideo seco | Receta tradicional con chipotle y crema | 7\nCeviche de camarón | Camarón fresco, limón, cilantro y chile | 13\n---\nPlatos fuertes\nFilete a las brasas | 300 g con guarnición a elegir | 32\nPollo en mole negro | Mole de treinta ingredientes con arroz | 22\nPasta al pesto | Fettuccine con pesto artesanal y parmesano | 18\n---\nPara cerrar\nFlan de cajeta | Receta de la abuela | 6\nPastel de tres leches | Esponjoso y húmedo | 7.5\nHelado artesanal | Tres bolas a elegir | 5',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Subtítulo' },
    currency: { type: 'text', label: 'Moneda' },
    tone: { type: 'select', label: 'Fondo', options: [{ value: 'paper', label: 'Papel' }, { value: 'chalk', label: 'Pizarra' }] },
    menu: { type: 'textarea', label: 'Carta (línea de curso; luego Nombre | Descripción | Precio; separa cursos con ---)' },
  },
  render: (props) => <RestoMenu {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
function RestoHours({ eyebrow, title, hours, address, phone, note, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref }) {
  const rows = lines(hours).map(cells).filter(([day, time]) => day && time)
  const col = { background: 'rgba(255,246,229,.05)', border: '1px solid rgba(245,233,211,.16)', padding: '32px' }
  const label = { margin: '0 0 14px', fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color: GOLD }
  return (
    <section className="rst" style={{ ...chalkBg, padding: 'clamp(64px, 9vw, 112px) 24px', color: '#F5E9D3' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: '1120px', marginInline: 'auto' }}>
        <Eyebrow color={GOLD}>{eyebrow}</Eyebrow>
        <h2 style={{ margin: '18px 0 0', maxWidth: '16ch', fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(38px, 5.6vw, 72px)', lineHeight: 1, letterSpacing: '-0.025em', color: '#FFF6E5' }}>{title}</h2>
        <div style={{ marginTop: 'clamp(32px, 5vw, 56px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '24px' }}>
          <div style={col}>
            <p style={label}>Horario</p>
            <ul style={{ margin: 0, padding: 0 }}>
              {rows.map(([day, time]) => (
                <li key={day} style={{ listStyle: 'none', display: 'flex', alignItems: 'baseline', gap: '10px', padding: '9px 0' }}>
                  <span style={{ fontFamily: SERIF, fontSize: '19px' }}>{day}</span>
                  <span aria-hidden="true" style={{ flex: 1, minWidth: '14px', borderBottom: '2px dotted rgba(245,233,211,.4)', transform: 'translateY(-4px)' }} />
                  <span style={{ fontFamily: SERIF, fontSize: '19px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#FFF6E5' }}>{time}</span>
                </li>
              ))}
            </ul>
          </div>
          <div style={col}>
            <p style={label}>Encuéntranos</p>
            <p style={{ margin: 0, fontFamily: SERIF, fontSize: '22px', lineHeight: 1.4, color: '#FFF6E5' }}>{address}</p>
            {phone && <p style={{ margin: '14px 0 0', fontFamily: SANS, fontSize: '16px', color: 'rgba(245,233,211,.86)' }}>{phone}</p>}
            {note && <p style={{ margin: '14px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: '16px', lineHeight: 1.55, color: 'rgba(245,233,211,.8)' }}>{note}</p>}
            {(ctaLabel || ctaSecondLabel) && (
              <div style={{ marginTop: '26px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <Cta label={ctaLabel} href={ctaHref} solid />
                <Cta label={ctaSecondLabel} href={ctaSecondHref} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export const RestoHoursBlock = defineBlock({
  type: 'RestoHoursBlock',
  label: 'Restaurante: horario y ubicación',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Reservaciones', title: 'Te guardamos tu mesa',
    hours: 'Lun – Vie | 1:00 – 11:00 pm\nSábados | 12:00 – 11:30 pm\nDomingos | 12:00 – 9:00 pm',
    address: 'Calle del Mercado 24, Centro Histórico, Ciudad de México',
    phone: 'Tel. +52 55 0000 0000', note: 'Grupos de seis o más: avísanos con un día de anticipación.',
    ctaLabel: 'Reservar mesa', ctaHref: '/contacto', ctaSecondLabel: 'Llamar', ctaSecondHref: 'tel:+525500000000',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    hours: { type: 'textarea', label: 'Horario (Día | Horas, uno por línea)' },
    address: { type: 'textarea', label: 'Dirección' }, phone: { type: 'text', label: 'Teléfono' }, note: { type: 'textarea', label: 'Nota' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
  },
  render: (props) => <RestoHours {...props} />,
})

export const restoRunlyBlocks = [RestoHeroBlock, RestoMenuBlock, RestoHoursBlock]
