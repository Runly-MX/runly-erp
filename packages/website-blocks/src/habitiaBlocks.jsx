import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { H, SERIF, SANS, HeroScene, StillLife, ObjectArt, Vase, RoundVase, Lamp, Plant, archPath } from './habitiaArt.jsx'

// Blocks of the "Habitia" template: a warm, earthy home-decor lookbook. Serif display type, overlapping inline-SVG
// objects, editorial lists and printed-paper panels. System fonts only; motion is CSS-only and off for reduced motion.
const INK = 'var(--runly-color-fg, #2A1E17)'
const MUTED = 'var(--runly-color-muted, #6B5A4C)'
const BG = 'var(--runly-color-bg, #FAF7F2)'
const lines = (raw) => String(raw ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
const cells = (raw) => lines(raw).map((line) => line.split('|').map((part) => part.trim()))
const sections = (raw) => String(raw ?? '').split(/\n-{3,}\n/).map((part) => lines(part)).filter((part) => part.length)
const WRAP = { maxWidth: '1240px', marginInline: 'auto', padding: '0 clamp(20px, 4vw, 48px)' }
const BASE_CSS = `.hb *{box-sizing:border-box}
@keyframes hb-spin{to{transform:rotate(360deg)}}
@keyframes hb-pulse{0%,100%{opacity:.85}50%{opacity:1}}
@keyframes hb-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.hb .hb-spin{transform-box:fill-box;transform-origin:center;animation:hb-spin 60s linear infinite}
.hb .hb-glow{animation:hb-pulse 5s ease-in-out infinite}
.hb .hb-float{animation:hb-float 7s ease-in-out infinite}
.hb a:focus-visible{outline:3px solid #A4522E;outline-offset:3px}
@media (prefers-reduced-motion: reduce){.hb *{animation:none!important;transition:none!important}}`

const Eyebrow = ({ children, light }) => children ? <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: light ? H.blush : H.accent }}><span style={{ width: '28px', height: '1px', background: 'currentColor' }} />{children}</p> : null
const Display = ({ as: Tag = 'h2', size = 'clamp(36px, 5.4vw, 72px)', light, children, style }) => <Tag style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 1.02, letterSpacing: '-0.02em', color: light ? H.cream : INK, ...style }}>{children}</Tag>
const Em = ({ children, light }) => <em style={{ fontStyle: 'italic', color: light ? H.blush : H.accent }}>{children}</em>
const Button = ({ href, children, light }) => href || children ? <a href={href || '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', minHeight: '48px', padding: '0 28px', background: light ? H.cream : H.umber, color: light ? H.umber : H.cream, fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', textDecoration: 'none', borderRadius: '2px' }}>{children}<span aria-hidden="true">&rarr;</span></a> : null
const Link2 = ({ href, children, light }) => children ? <a href={href || '#'} style={{ display: 'inline-flex', alignItems: 'center', minHeight: '48px', color: light ? H.cream : INK, fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', textDecoration: 'underline', textUnderlineOffset: '6px', textDecorationThickness: '1px' }}>{children}</a> : null

// ---------------------------------------------------------------------------------------------------------------
function Hero({ issue, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, index }) {
  return (
    <section className="hb" style={{ position: 'relative', overflow: 'hidden', background: `linear-gradient(180deg, #F4E7D6 0%, ${BG} 100%)`, padding: 'clamp(20px, 3vw, 36px) 0 clamp(32px, 4vw, 56px)' }}>
      <style>{BASE_CSS}</style>
      <div style={WRAP}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', paddingBottom: '14px', borderBottom: `1px solid ${INK}`, fontFamily: SANS, fontSize: '11px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color: INK }}>
          <span>Habitia</span><span>{issue}</span><span style={{ color: MUTED }}>{index}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(32px, 5vw, 80px)', alignItems: 'center', marginTop: 'clamp(28px, 5vw, 64px)' }}>
          <div>
            <Display as="h1" size="clamp(52px, 8.6vw, 128px)" style={{ lineHeight: 0.94, letterSpacing: '-0.035em' }}>{title}{highlight && <><br /><Em>{highlight}</Em></>}</Display>
            <p style={{ margin: '28px 0 0', maxWidth: '40ch', fontFamily: SANS, fontSize: '18px', lineHeight: 1.7, color: MUTED }}>{subtitle}</p>
            <div style={{ marginTop: '32px', display: 'flex', gap: '12px 28px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button href={ctaHref}>{ctaLabel}</Button><Link2 href={ctaSecondHref}>{ctaSecondLabel}</Link2>
            </div>
          </div>
          <div className="hb-float" style={{ width: '100%', maxWidth: '560px', justifySelf: 'center', paddingRight: '4%' }}><HeroScene /></div>
        </div>
      </div>
    </section>
  )
}

export const HabitiaHeroBlock = defineBlock({
  type: 'HabitiaHeroBlock',
  label: 'Portada lookbook',
  category: 'atlas',
  defaultProps: {
    issue: 'Lookbook Nº 07 · Otoño 2026', index: 'Sala · Comedor · Recámara · Jardín', title: 'Casa,', highlight: 'con carácter',
    subtitle: 'Jarrones, lámparas y textiles elegidos a mano para que cada cuarto cuente su propia historia.',
    ctaLabel: 'Ver la colección', ctaHref: '/coleccion', ctaSecondLabel: 'Nuestra historia', ctaSecondHref: '/nosotros',
  },
  fields: {
    issue: { type: 'text', label: 'Número de edición' }, index: { type: 'text', label: 'Índice (derecha)' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' },
    subtitle: { type: 'textarea', label: 'Descripción' }, ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
    ctaSecondLabel: { type: 'text', label: 'Enlace secundario' }, ctaSecondHref: { type: 'link', label: 'Destino del enlace secundario' },
  },
  groups: [{ label: 'Contenido', fields: ['issue', 'index', 'title', 'highlight', 'subtitle'] }, { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] }],
  render: (props) => <Hero {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const Vignette = ({ index }) => {
  const kind = index % 4
  return (
    <svg aria-hidden="true" viewBox="0 0 220 150" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <rect x="6" y="122" width="208" height="3" fill={H.umber} opacity=".25" />
      {kind === 0 && <><rect x="26" y="52" width="130" height="52" rx="16" fill={H.terracotta} /><rect x="16" y="82" width="150" height="36" rx="12" fill={H.clay} /><rect x="30" y="64" width="40" height="30" rx="10" fill={H.blush} /><rect x="30" y="118" width="6" height="8" fill={H.umber} /><rect x="146" y="118" width="6" height="8" fill={H.umber} /><Lamp id="hbv0" x={188} y={122} s={0.75} /></>}
      {kind === 1 && <><rect x="26" y="70" width="150" height="9" rx="2" fill={H.umber} /><rect x="38" y="79" width="7" height="43" fill={H.umber} /><rect x="156" y="79" width="7" height="43" fill={H.umber} /><rect x="8" y="58" width="9" height="64" rx="3" fill={H.moss} /><rect x="8" y="88" width="30" height="7" rx="2" fill={H.moss} /><rect x="184" y="58" width="9" height="64" rx="3" fill={H.moss} /><Vase x={100} y={70} s={0.6} body={H.cream} /><RoundVase x={130} y={70} s={0.5} body={H.terracotta} /></>}
      {kind === 2 && <><rect x="30" y="34" width="150" height="62" rx="12" fill={H.moss} /><rect x="22" y="84" width="170" height="32" rx="6" fill={H.cream} /><rect x="38" y="68" width="46" height="22" rx="8" fill={H.paper} /><rect x="92" y="68" width="46" height="22" rx="8" fill={H.paper} /><rect x="22" y="98" width="170" height="18" rx="4" fill={H.terracotta} /><Lamp id="hbv2" x={205} y={122} s={0.7} /></>}
      {kind === 3 && <><Plant x={60} y={122} s={0.95} pot={H.clay} /><Plant x={118} y={122} s={0.65} pot={H.umber} /><Plant x={170} y={122} s={1.05} pot={H.terracotta} /></>}
    </svg>
  )
}

const ROOMS_CSS = `${BASE_CSS}
.hb-room{display:grid;grid-template-columns:clamp(40px,7vw,96px) 1fr auto;gap:0 16px;align-items:baseline;padding:clamp(22px,3vw,34px) clamp(8px,2vw,20px);border-top:1px solid rgba(42,30,23,.3);position:relative;text-decoration:none;color:inherit;transition:background .3s}
.hb-room:last-child{border-bottom:1px solid rgba(42,30,23,.3)}
@media (max-width:560px){.hb-room{grid-template-columns:32px minmax(0,1fr)}.hb-room .ct{grid-column:2;margin-top:12px}}
.hb-room .nm{display:inline-block;transition:transform .35s ease}
.hb-room .rv{display:grid;grid-template-rows:1fr;margin-top:10px;transition:grid-template-rows .35s ease,opacity .3s}
.hb-room .rv>div{overflow:hidden}
.hb-room .vg{display:none;position:absolute;right:clamp(150px,18vw,260px);top:50%;width:min(24vw,270px);transform:translateY(-50%) translateX(34px) rotate(2deg);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.2,.9,.3,1);pointer-events:none}
@media (hover:hover) and (min-width:860px){
 .hb-room .rv{grid-template-rows:0fr;opacity:0}
 .hb-room .vg{display:block}
 .hb-room:hover,.hb-room:focus-visible{background:#EFE3D1}
 .hb-room:hover .nm,.hb-room:focus-visible .nm{transform:translateX(20px)}
 .hb-room:hover .rv,.hb-room:focus-visible .rv{grid-template-rows:1fr;opacity:1}
 .hb-room:hover .vg,.hb-room:focus-visible .vg{opacity:1;transform:translateY(-50%) rotate(-2deg)}
}`

function Rooms({ eyebrow, title, highlight, rooms, href }) {
  const rows = cells(rooms)
  return (
    <section className="hb" style={{ background: BG, padding: 'clamp(64px, 9vw, 130px) 0' }}>
      <style>{ROOMS_CSS}</style>
      <div style={WRAP}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '20px', flexWrap: 'wrap', marginBottom: 'clamp(28px, 4vw, 52px)' }}>
          <div><Eyebrow>{eyebrow}</Eyebrow><Display style={{ marginTop: '16px' }}>{title} <Em>{highlight}</Em></Display></div>
        </div>
        <nav aria-label={title}>
          {rows.map(([name, note, count], index) => (
            <a key={name} className="hb-room" href={href || '#'}>
              <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(16px, 1.6vw, 22px)', color: H.accent }}>{String(index + 1).padStart(2, '0')}</span>
              <span>
                <span className="nm" style={{ fontFamily: SERIF, fontSize: 'clamp(44px, 8vw, 112px)', lineHeight: 1, letterSpacing: '-0.03em', color: INK }}>{name}</span>
                <span className="rv"><span style={{ overflow: 'hidden' }}><span style={{ display: 'block', paddingTop: '8px', maxWidth: '38ch', fontFamily: SANS, fontSize: '16px', lineHeight: 1.6, color: MUTED }}>{note}</span></span></span>
              </span>
              <span className="ct" style={{ display: 'flex', alignItems: 'center', gap: '16px', fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: INK, whiteSpace: 'nowrap' }}>{count}<span aria-hidden="true" style={{ fontSize: '22px' }}>&rarr;</span></span>
              <span className="vg" aria-hidden="true"><Vignette index={index} /></span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  )
}

export const HabitiaRoomsBlock = defineBlock({
  type: 'HabitiaRoomsBlock',
  label: 'Índice de habitaciones',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Índice', title: 'Un cuarto', highlight: 'a la vez', href: '/coleccion',
    rooms: 'Sala | Sofás de lino, mesas bajas y lámparas de luz cálida para quedarse a conversar. | 24 piezas\nComedor | Mesas de madera maciza, sillas tejidas y vajilla hecha a mano. | 18 piezas\nRecámara | Ropa de cama en algodón lavado, veladores y luz que baja el ritmo. | 21 piezas\nJardín | Macetas, bancas y textiles que aguantan sol, lluvia y sobremesas. | 15 piezas',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' }, href: { type: 'link', label: 'Enlace de cada fila' },
    rooms: { type: 'textarea', label: 'Habitaciones (Nombre | Descripción | Etiqueta, una por línea)' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'rooms'] }, { label: 'Enlace', fields: ['href'] }],
  render: (props) => <Rooms {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const PIECES_CSS = `${BASE_CSS}
.hb-piece{text-decoration:none;color:inherit;display:block}
.hb-piece .tile{position:relative;aspect-ratio:4/5;overflow:hidden;transition:transform .35s ease}
.hb-piece:hover .tile,.hb-piece:focus-visible .tile{transform:translateY(-6px)}
.hb-piece .arch{position:absolute;inset:14% 14% 0;border-radius:999px 999px 0 0}`
const TONES = [['#E9C7B3', H.terracotta], ['#D8DFD0', H.sage], ['#F0DDB4', H.mustard], ['#E4D3BD', H.blush]]

function Pieces({ eyebrow, title, highlight, pieces, ctaLabel, ctaHref }) {
  const rows = cells(pieces)
  return (
    <section className="hb" style={{ background: '#F4EBDD', padding: 'clamp(64px, 9vw, 120px) 0' }}>
      <style>{PIECES_CSS}</style>
      <div style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Display style={{ marginTop: '16px', maxWidth: '22ch' }}>{title} <Em>{highlight}</Em></Display>
        <div style={{ marginTop: 'clamp(32px, 5vw, 60px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 'clamp(20px, 3vw, 36px)' }}>
          {rows.map(([name, material, price, kind], index) => {
            const [bg, arch] = TONES[index % TONES.length]
            return (
              <a key={name} className="hb-piece" href={ctaHref || '#'} aria-label={`${name}, ${price}`}>
                <div className="tile" style={{ background: bg }}>
                  <div className="arch" style={{ background: arch, opacity: 0.9 }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'end center', padding: '0 8% 6%' }}><ObjectArt kind={kind} id={`hbp${index}`} /></div>
                  <span style={{ position: 'absolute', top: '12px', left: '14px', fontFamily: SERIF, fontStyle: 'italic', fontSize: '15px', color: INK }}>Nº {String(index + 1).padStart(2, '0')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '14px', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: SERIF, fontSize: '22px', color: INK }}>{name}</span>
                  <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 700, color: H.accent, whiteSpace: 'nowrap' }}>{price}</span>
                </div>
                <span style={{ display: 'block', marginTop: '2px', fontFamily: SANS, fontSize: '14px', color: MUTED }}>{material}</span>
              </a>
            )
          })}
        </div>
        {ctaLabel && <div style={{ marginTop: 'clamp(32px, 4vw, 52px)' }}><Button href={ctaHref}>{ctaLabel}</Button></div>}
      </div>
    </section>
  )
}

export const HabitiaPiecesBlock = defineBlock({
  type: 'HabitiaPiecesBlock',
  label: 'Piezas de la temporada',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Selección de temporada', title: 'Piezas que', highlight: 'se quedan', ctaLabel: 'Consultar disponibilidad', ctaHref: '/contacto',
    pieces: 'Jarrón Duna | Cerámica esmaltada | $1,290 | jarron\nLámpara Brasa | Base de barro, pantalla de lino | $2,480 | lampara\nPalma de interior | Maceta de terracota | $890 | planta\nCuenco Arena | Gres hecho a mano | $540 | cuenco',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' },
    pieces: { type: 'textarea', label: 'Piezas (Nombre | Material | Precio | jarron, lampara, planta, cuenco, vela o libros)' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace de las piezas y del botón' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'pieces'] }, { label: 'Enlace', fields: ['ctaLabel', 'ctaHref'] }],
  render: (props) => <Pieces {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const SWATCHES = {
  wood: { base: '#B98A5E', mark: <g stroke="#8E6240" strokeWidth="1.6" fill="none"><path d="M0 18C20 10 40 26 96 16M0 36C24 28 44 44 96 34M0 54C22 46 46 62 96 52M0 72C26 64 40 80 96 70" /></g> },
  linen: { base: '#E8DCC6', mark: <g stroke="#B9A98A" strokeWidth="1"><path d="M0 8H96M0 20H96M0 32H96M0 44H96M0 56H96M0 68H96M0 80H96M8 0V96M20 0V96M32 0V96M44 0V96M56 0V96M68 0V96M80 0V96" /></g> },
  ceramic: { base: '#8FA597', mark: <g fill="#F3E9DC" opacity=".8"><circle cx="24" cy="30" r="1.8" /><circle cx="62" cy="22" r="1.4" /><circle cx="44" cy="58" r="2" /><circle cx="72" cy="66" r="1.5" /><circle cx="30" cy="74" r="1.3" /><path d="M10 40A40 40 0 0 1 54 6" stroke="#fff" strokeOpacity=".5" strokeWidth="6" fill="none" strokeLinecap="round" /></g> },
  leather: { base: '#7A4A2E', mark: <g fill="#5A3320"><circle cx="14" cy="14" r="2" /><circle cx="40" cy="22" r="2" /><circle cx="68" cy="12" r="2" /><circle cx="26" cy="46" r="2" /><circle cx="56" cy="50" r="2" /><circle cx="82" cy="40" r="2" /><circle cx="14" cy="76" r="2" /><circle cx="44" cy="80" r="2" /><circle cx="74" cy="72" r="2" /></g> },
  rattan: { base: '#D9B77E', mark: <g stroke="#A8844A" strokeWidth="2.4"><path d="M-10 10L106 126M-10 36L106 152M-10 62L106 178M-10 -16L106 100M96 -20L-20 96M96 6L-20 122M96 32L-20 148" /></g> },
}
const SWATCH_ORDER = ['wood', 'linen', 'ceramic', 'leather', 'rattan']
const Swatch = ({ kind, size = 88 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 96 96" style={{ display: 'block', flex: 'none' }}>
    <defs><clipPath id={`hbsw-${kind}`}><circle cx="48" cy="48" r="46" /></clipPath></defs>
    <g clipPath={`url(#hbsw-${kind})`}><rect width="96" height="96" fill={SWATCHES[kind].base} />{SWATCHES[kind].mark}</g>
    <circle cx="48" cy="48" r="46" fill="none" stroke={H.umber} strokeOpacity=".25" strokeWidth="1.5" />
  </svg>
)

function Materials({ eyebrow, title, materials }) {
  const rows = cells(materials)
  return (
    <section className="hb" style={{ background: BG, borderTop: `3px double ${H.umber}`, borderBottom: `3px double ${H.umber}`, padding: 'clamp(40px, 6vw, 80px) 0' }}>
      <style>{BASE_CSS}</style>
      <div style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Display size="clamp(30px, 3.6vw, 52px)" style={{ margin: '14px 0 clamp(28px, 4vw, 48px)', maxWidth: '26ch' }}>{title}</Display>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 'clamp(24px, 3vw, 40px)', alignItems: 'start' }}>
        {rows.map(([name, note], index) => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Swatch kind={SWATCH_ORDER[index % SWATCH_ORDER.length]} />
            <div>
              <p style={{ margin: 0, fontFamily: SERIF, fontSize: '22px', color: INK }}>{name}</p>
              <p style={{ margin: '6px 0 0', fontFamily: SANS, fontSize: '14px', lineHeight: 1.6, color: MUTED }}>{note}</p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </section>
  )
}

export const HabitiaMaterialsBlock = defineBlock({
  type: 'HabitiaMaterialsBlock',
  label: 'Franja de materiales',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Materiales', title: 'Hecho para durar y envejecer bien',
    materials: 'Madera maciza | Aceite de teca cada seis meses.\nLino lavado | Lavado en frío, plancha en húmedo.\nCerámica | A mano y sin cambios bruscos de calor.\nCuero natural | Crema acondicionadora dos veces al año.',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    materials: { type: 'textarea', label: 'Materiales (Nombre | Cuidado, uno por línea, máx. 5)' },
  },
  render: (props) => <Materials {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const SPREAD_CSS = `${BASE_CSS}
.hb-spread{display:grid;grid-template-columns:1fr;box-shadow:0 40px 90px rgba(42,30,23,.28);position:relative}
.hb-spread .gut{display:none}
@media (min-width:820px){.hb-spread{grid-template-columns:1fr 1fr}.hb-spread .gut{display:block;position:absolute;left:50%;top:0;bottom:0;width:70px;transform:translateX(-50%);background:linear-gradient(90deg,rgba(42,30,23,0) 0%,rgba(42,30,23,.22) 50%,rgba(42,30,23,0) 100%);pointer-events:none}}`

function Spread({ quote, attribution, folio, scene }) {
  return (
    <section className="hb" style={{ background: '#E6D6BF', padding: 'clamp(56px, 8vw, 110px) 0' }}>
      <style>{SPREAD_CSS}</style>
      <div style={WRAP}>
        <div className="hb-spread">
          <div style={{ background: H.paper, padding: 'clamp(32px, 5vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '32px', minHeight: '440px' }}>
            <div>
              <span aria-hidden="true" style={{ display: 'block', fontFamily: SERIF, fontSize: '120px', lineHeight: 0.7, color: H.terracotta, height: '56px' }}>&ldquo;</span>
              <blockquote style={{ margin: '12px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(26px, 3.2vw, 42px)', lineHeight: 1.22, letterSpacing: '-0.01em', color: INK }}>{quote}</blockquote>
              <p style={{ margin: '24px 0 0', fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: H.accent }}>{attribution}</p>
            </div>
            <p style={{ margin: 0, textAlign: 'center', fontFamily: SERIF, fontSize: '14px', color: MUTED }}>&mdash; {folio} &mdash;</p>
          </div>
          <div style={{ background: '#EBCDB9', padding: 'clamp(24px, 3vw, 44px)', display: 'grid', placeItems: 'center' }}><div style={{ width: '100%', maxWidth: '400px' }}><StillLife scene={scene} id="hbq" /></div></div>
          <div className="gut" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

export const HabitiaQuoteBlock = defineBlock({
  type: 'HabitiaQuoteBlock',
  label: 'Cita a doble página',
  category: 'atlas',
  defaultProps: {
    quote: 'Un hogar no se construye con paredes. Se construye con los objetos que elegimos, las texturas que tocamos y la luz que dejamos entrar.',
    attribution: 'Habitia, carta del editor', folio: '24', scene: 'sala',
  },
  fields: {
    quote: { type: 'textarea', label: 'Cita' }, attribution: { type: 'text', label: 'Firma' }, folio: { type: 'text', label: 'Número de página' },
    scene: { type: 'select', label: 'Ilustración', options: [{ value: 'sala', label: 'Sala' }, { value: 'mesa', label: 'Mesa con lámpara' }, { value: 'taller', label: 'Estante' }] },
  },
  render: (props) => <Spread {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const Tick = ({ ok }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" style={{ flex: 'none', marginTop: '4px' }}>
    <circle cx="8" cy="8" r="8" fill={ok ? H.moss : H.clay} />
    <path d={ok ? 'M4.4 8.2l2.4 2.4 4.8-5' : 'M5 5l6 6M11 5l-6 6'} stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const Barcode = () => <svg aria-hidden="true" width="92" height="30" viewBox="0 0 92 30">{[0, 4, 7, 12, 15, 19, 24, 27, 33, 36, 41, 44, 50, 53, 58, 62, 67, 70, 76, 80, 85, 89].map((x, i) => <rect key={x} x={x} width={i % 3 === 0 ? 3 : 1.5} height="30" fill={H.umber} />)}</svg>

function Leaflet({ title, highlight, subtitle, edition, panels }) {
  const list = sections(panels).slice(0, 6)
  return (
    <section className="hb" style={{ background: '#E6D6BF', padding: 'clamp(40px, 6vw, 90px) 0' }}>
      <style>{BASE_CSS}</style>
      <div style={WRAP}>
        <article style={{ background: H.paper, boxShadow: '0 30px 80px rgba(42,30,23,.25)', padding: 'clamp(24px, 4vw, 56px)' }}>
          <header style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 40px', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '24px', borderBottom: `2px solid ${H.umber}` }}>
            <div>
              <Eyebrow>{edition}</Eyebrow>
              <Display as="h2" size="clamp(36px, 5vw, 68px)" style={{ marginTop: '14px' }}>{title} <Em>{highlight}</Em></Display>
            </div>
            <div style={{ maxWidth: '34ch' }}><p style={{ margin: 0, fontFamily: SANS, fontSize: '15px', lineHeight: 1.65, color: MUTED }}>{subtitle}</p><div style={{ marginTop: '14px' }}><Barcode /></div></div>
          </header>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
            {list.map(([name, intro, ...items], index) => (
              <div key={name} style={{ padding: 'clamp(22px, 3vw, 34px)', borderRight: '1.5px dashed rgba(42,30,23,.35)', borderBottom: '1.5px dashed rgba(42,30,23,.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '28px', color: H.accent }}>{ROMAN[index]}.</span>
                  <Swatch kind={SWATCH_ORDER[index % SWATCH_ORDER.length]} size={48} />
                </div>
                <h3 style={{ margin: '14px 0 0', fontFamily: SERIF, fontWeight: 400, fontSize: '28px', lineHeight: 1.1, color: INK }}>{name}</h3>
                <p style={{ margin: '8px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: '16px', lineHeight: 1.5, color: MUTED }}>{intro}</p>
                <ul style={{ margin: '18px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '10px' }}>
                  {items.map((item) => (
                    <li key={item} style={{ display: 'flex', gap: '10px', fontFamily: SANS, fontSize: '14px', lineHeight: 1.55, color: INK }}>
                      <Tick ok={item.startsWith('+')} /><span>{item.replace(/^[+-]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

export const HabitiaLeafletBlock = defineBlock({
  type: 'HabitiaLeafletBlock',
  label: 'Folleto de cuidados',
  category: 'atlas',
  defaultProps: {
    edition: 'Folleto Nº 03 · Edición 2026', title: 'Cuidar es', highlight: 'conservar', subtitle: 'Cuatro materiales, cuatro rutinas simples. Con ellas tus piezas se ven mejor cada año.',
    panels: 'Madera maciza\nCalidez que se gana con el tiempo.\n+ Limpia con paño seco\n+ Aceita con teca cada seis meses\n- Evita la humedad directa\n- No uses productos abrasivos\n---\nLino y algodón\nSuaves, frescos y cada vez mejores.\n+ Lava en frío y por separado\n+ Plancha en húmedo\n- Evita el cloro\n- No los seques al sol directo\n---\nCerámica\nHecha a mano, una a una.\n+ Lávala a mano con jabón neutro\n+ Sécala por completo antes de guardar\n- Evita cambios bruscos de calor\n- No la metas al microondas\n---\nCuero natural\nCada marca cuenta su historia.\n+ Limpia con paño apenas húmedo\n+ Acondiciona dos veces al año\n- Evita el sol y el radiador\n- No uses alcohol',
  },
  fields: {
    edition: { type: 'text', label: 'Edición' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' }, subtitle: { type: 'textarea', label: 'Descripción' },
    panels: { type: 'textarea', label: 'Paneles (nombre, frase y consejos con + o -; separa paneles con ---)' },
  },
  render: (props) => <Leaflet {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const STORY_CSS = `${BASE_CSS}
.hb-story .body::first-letter{float:left;font-family:${SERIF};font-size:4.6em;line-height:.78;padding:8px 12px 0 0;color:#A4522E}`

function Story({ eyebrow, year, title, highlight, body, signature, scene, flip }) {
  const art = (
    <div style={{ position: 'relative', width: '100%', maxWidth: '460px', justifySelf: flip === 'right' ? 'start' : 'end' }}>
      <div style={{ background: H.sand, borderRadius: '999px 999px 0 0', overflow: 'hidden', padding: '8% 6% 0' }}><StillLife scene={scene} id="hbs" /></div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '-18px', [flip === 'right' ? 'right' : 'left']: '-18px', width: '96px', height: '96px', borderRadius: '50%', background: H.mustard, zIndex: -1 }} />
    </div>
  )
  const copy = (
    <div style={{ alignSelf: 'center', position: 'relative' }}>
      <span aria-hidden="true" style={{ display: 'block', fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(90px, 14vw, 190px)', lineHeight: 0.95, color: 'transparent', WebkitTextStroke: `1.5px ${H.clay}`, marginBottom: '14px' }}>{year}</span>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Display style={{ marginTop: '14px' }}>{title} <Em>{highlight}</Em></Display>
      <p className="body" style={{ margin: '24px 0 0', maxWidth: '46ch', fontFamily: SANS, fontSize: '17px', lineHeight: 1.8, color: MUTED }}>{body}</p>
      {signature && <p style={{ margin: '20px 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: '24px', color: INK }}>{signature}</p>}
    </div>
  )
  return (
    <section className="hb hb-story" style={{ background: BG, padding: 'clamp(56px, 8vw, 120px) 0', overflow: 'hidden' }}>
      <style>{STORY_CSS}</style>
      <div style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(36px, 6vw, 96px)' }}>
        {flip === 'right' ? <>{art}{copy}</> : <>{copy}{art}</>}
      </div>
    </section>
  )
}

export const HabitiaStoryBlock = defineBlock({
  type: 'HabitiaStoryBlock',
  label: 'Historia editorial',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'El origen', year: '2016', title: 'Empezamos con', highlight: 'una sola mesa',
    body: 'Dos diseñadores, una camioneta y una duda: por qué las tiendas de hogar vendían lo mismo. Visitamos talleres y ferias, y elegimos a mano cada pieza que hoy ves aquí.',
    signature: 'Ana y Diego', scene: 'mesa', flip: 'left',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, year: { type: 'text', label: 'Año o número grande' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' },
    body: { type: 'textarea', label: 'Texto' }, signature: { type: 'text', label: 'Firma' },
    scene: { type: 'select', label: 'Ilustración', options: [{ value: 'sala', label: 'Sala' }, { value: 'mesa', label: 'Mesa con lámpara' }, { value: 'taller', label: 'Estante' }] },
    flip: { type: 'select', label: 'Texto a', options: [{ value: 'left', label: 'Izquierda' }, { value: 'right', label: 'Derecha' }] },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'year', 'title', 'highlight', 'body', 'signature'] }, { label: 'Estilo', fields: ['scene', 'flip'] }],
  render: (props) => <Story {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
function Figures({ eyebrow, title, figures }) {
  const rows = cells(figures).slice(0, 4)
  return (
    <section className="hb" style={{ background: '#F4EBDD', padding: 'clamp(56px, 8vw, 100px) 0' }}>
      <style>{BASE_CSS}</style>
      <div style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Display size="clamp(30px, 4vw, 52px)" style={{ marginTop: '14px', maxWidth: '22ch' }}>{title}</Display>
        <div style={{ marginTop: 'clamp(28px, 4vw, 52px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', borderTop: `1px solid ${INK}` }}>
          {rows.map(([value, label, note], index) => (
            <div key={label} style={{ padding: '24px 20px 8px 0', borderLeft: index ? '1px solid rgba(42,30,23,.25)' : 'none', paddingLeft: index ? '20px' : 0 }}>
              <p style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(52px, 6.6vw, 92px)', lineHeight: 1, letterSpacing: '-0.03em', color: H.accent }}>{value}</p>
              <p style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: INK }}>{label}</p>
              <p style={{ margin: '4px 0 0', fontFamily: SANS, fontSize: '14px', color: MUTED }}>{note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export const HabitiaFiguresBlock = defineBlock({
  type: 'HabitiaFiguresBlock',
  label: 'Cifras editoriales',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Habitia en cifras', title: 'Una casa se arma pieza a pieza',
    figures: '8|Años curando|Desde 2016\n3,200|Hogares|En 12 países\n180|Artesanos|Con pago justo\n0|Piezas rápidas|Solo diseño duradero',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    figures: { type: 'textarea', label: 'Cifras (Valor | Etiqueta | Nota, una por línea, máx. 4)' },
  },
  render: (props) => <Figures {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
const MAST = {
  coleccion: { art: 'sala', bg: '#F1DFCB' }, historia: { art: 'mesa', bg: '#E9E1CF' }, cuidados: { art: 'taller', bg: '#E4E6D6' }, contacto: { art: 'mesa', bg: '#F1DFCB' },
}

function PageHero({ folio, title, highlight, subtitle, scene }) {
  const m = MAST[scene] ?? MAST.coleccion
  return (
    <section className="hb" style={{ background: `linear-gradient(180deg, ${m.bg} 0%, ${BG} 100%)`, padding: 'clamp(20px, 3vw, 32px) 0 clamp(24px, 3vw, 40px)', overflow: 'hidden' }}>
      <style>{BASE_CSS}</style>
      <div style={WRAP}>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: `1px solid ${INK}`, fontFamily: SANS, fontSize: '11px', fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color: INK }}><span>Habitia</span><span>{folio}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'clamp(24px, 4vw, 64px)', alignItems: 'center', marginTop: 'clamp(24px, 4vw, 48px)' }}>
          <div>
            <Display as="h1" size="clamp(46px, 7.4vw, 108px)" style={{ lineHeight: 0.96, letterSpacing: '-0.035em' }}>{title}{highlight && <><br /><Em>{highlight}</Em></>}</Display>
            <p style={{ margin: '22px 0 0', maxWidth: '42ch', fontFamily: SANS, fontSize: '18px', lineHeight: 1.7, color: MUTED }}>{subtitle}</p>
          </div>
          <div style={{ width: '100%', maxWidth: '360px', justifySelf: 'center' }}><StillLife scene={m.art} id="hbm" /></div>
        </div>
      </div>
    </section>
  )
}

export const HabitiaPageHeroBlock = defineBlock({
  type: 'HabitiaPageHeroBlock',
  label: 'Cabecera de página lookbook',
  category: 'atlas',
  defaultProps: { folio: 'Colección · Nº 02', title: 'La colección,', highlight: 'cuarto por cuarto', subtitle: 'Piezas seleccionadas para transformar cualquier espacio.', scene: 'coleccion' },
  fields: {
    folio: { type: 'text', label: 'Sección y número' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' }, subtitle: { type: 'textarea', label: 'Descripción' },
    scene: { type: 'select', label: 'Ilustración', options: [{ value: 'coleccion', label: 'Colección (sala)' }, { value: 'historia', label: 'Historia (mesa)' }, { value: 'cuidados', label: 'Cuidados (estante)' }, { value: 'contacto', label: 'Contacto (mesa)' }] },
  },
  render: (props) => <PageHero {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
function Closing({ eyebrow, title, highlight, subtitle, ctaLabel, ctaHref, note }) {
  return (
    <section className="hb" style={{ position: 'relative', overflow: 'hidden', background: `radial-gradient(ellipse at 80% 40%, #4A3425 0%, ${H.umber} 62%)`, padding: 'clamp(64px, 9vw, 130px) 0' }}>
      <style>{BASE_CSS}</style>
      <div style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'clamp(32px, 5vw, 80px)', alignItems: 'center' }}>
        <div>
          <Eyebrow light>{eyebrow}</Eyebrow>
          <Display light style={{ marginTop: '16px' }}>{title} <Em light>{highlight}</Em></Display>
          <p style={{ margin: '22px 0 0', maxWidth: '44ch', fontFamily: SANS, fontSize: '18px', lineHeight: 1.7, color: 'rgba(243,233,220,.85)' }}>{subtitle}</p>
          <div style={{ marginTop: '30px' }}><Button href={ctaHref} light>{ctaLabel}</Button></div>
          {note && <p style={{ margin: '20px 0 0', fontFamily: SANS, fontSize: '14px', color: 'rgba(243,233,220,.7)' }}>{note}</p>}
        </div>
        <div aria-hidden="true" style={{ width: '100%', maxWidth: '380px', justifySelf: 'center' }}>
          <svg viewBox="0 0 380 380" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
            <path d={archPath(70, 20, 240, 340)} fill="none" stroke={H.cream} strokeOpacity=".28" strokeWidth="2" />
            <rect x="40" y="330" width="300" height="10" fill={H.cream} opacity=".15" />
            <Lamp id="hbc" x={190} y={330} s={2.6} />
            <Plant x={70} y={330} s={1.1} pot={H.clay} />
            <RoundVase x={310} y={330} s={1} body={H.blush} />
          </svg>
        </div>
      </div>
    </section>
  )
}

export const HabitiaClosingBlock = defineBlock({
  type: 'HabitiaClosingBlock',
  label: 'Cierre con lámpara',
  category: 'atlas',
  defaultProps: { eyebrow: 'Comunidad Habitia', title: 'Deja la luz', highlight: 'encendida', subtitle: 'Escríbenos y te ayudamos a encontrar la pieza justa para tu espacio, sin compromiso.', ctaLabel: 'Hablar con nosotros', ctaHref: '/contacto', note: 'Respondemos en menos de 24 horas.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra en cursiva' }, subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' }, note: { type: 'text', label: 'Nota' },
  },
  render: (props) => <Closing {...props} />,
})

export const habitiaBlocks = [HabitiaHeroBlock, HabitiaRoomsBlock, HabitiaPiecesBlock, HabitiaMaterialsBlock, HabitiaQuoteBlock, HabitiaLeafletBlock, HabitiaStoryBlock, HabitiaFiguresBlock, HabitiaPageHeroBlock, HabitiaClosingBlock]
