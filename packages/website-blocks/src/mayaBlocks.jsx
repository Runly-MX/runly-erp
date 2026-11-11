import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Blocks of the "Maya Studio" template: a bright blue + yellow freelance portfolio with marker-style accents.
// System font stacks only; all art is inline SVG/CSS. Motion is CSS-only and switched off for reduced motion.
export const HAND = "'Segoe Print', 'Bradley Hand', 'Marker Felt', 'Comic Sans MS', ui-rounded, cursive"
export const BOLD = "ui-rounded, 'Arial Rounded MT Bold', 'Nunito', 'Segoe UI', system-ui, sans-serif"
export const BLUE = 'var(--runly-color-primary, #2563EB)'
export const YELLOW = 'var(--runly-color-accent, #FBBF24)'
export const INK = 'var(--runly-color-fg, #0F2347)'
export const MUTED = 'var(--runly-color-muted, #5B6B88)'
export const NAVY = '#1E3A8A'

const safeImg = (src) => (typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : '')
const lines = (raw) => String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
export const CSS_BASE = '@media (prefers-reduced-motion: reduce){.mya *{animation:none!important;transition:none!important}}'

// Yellow marker stroke behind a highlighted word.
export const marker = { WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone', backgroundImage: 'linear-gradient(transparent 58%, #FBBF24 58%, #FBBF24 92%, transparent 92%)', padding: '0 .12em', margin: '0 -.12em', borderRadius: '4px' }

const Sparkle = ({ size = 28, color = '#FBBF24', style }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" style={style}><path d="M12 1c1 6.2 4.8 10 11 11-6.2 1-10 4.8-11 11-1-6.2-4.8-10-11-11C7.2 11 11 7.2 12 1z" fill={color} /></svg>
)
export const Squiggle = ({ width = 120, color = BLUE, style }) => (
  <svg aria-hidden="true" width={width} height={width / 6} viewBox="0 0 120 20" style={style}><path d="M2 12c8-12 14-12 20 0s14 12 20 0 14-12 20 0 14 12 20 0 14-12 18-4" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" /></svg>
)
const Arrow = ({ style, color = INK }) => (
  <svg aria-hidden="true" width="74" height="60" viewBox="0 0 74 60" style={style}><path d="M4 8C26 2 58 10 62 44" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" /><path d="M48 38l14 10 8-16" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

// ---------------------------------------------------------------------------------------------------------------
// Portrait with blob, floating experience badge, chips and a handwritten note.
const PORTRAIT_CSS = `${CSS_BASE}
@keyframes mya-float{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-10px) rotate(var(--r,0deg))}}
@keyframes mya-spin{to{transform:rotate(360deg)}}
@keyframes mya-pop{from{transform:scale(.6) rotate(var(--r,0deg));opacity:0}to{transform:scale(1) rotate(var(--r,0deg));opacity:1}}
.mya-portrait .fl{animation:mya-float 5s ease-in-out infinite}
.mya-portrait .pop{animation:mya-pop .6s cubic-bezier(.2,1.4,.4,1) both}`

function Person() {
  return (
    <svg aria-hidden="true" viewBox="0 0 300 340" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect width="300" height="340" fill="#DCEBFF" />
      <circle cx="60" cy="70" r="46" fill="#BFD9FF" /><circle cx="256" cy="260" r="64" fill="#FFE9A8" />
      <path d="M40 340c4-70 44-104 110-104s106 34 110 104z" fill={BLUE} />
      <path d="M118 240l32 40 32-40" fill="#fff" />
      <rect x="132" y="196" width="36" height="48" rx="14" fill="#F2B79A" />
      <ellipse cx="150" cy="156" rx="52" ry="60" fill="#F7C6AA" />
      <path d="M96 150c-6-60 34-84 70-80 40 4 58 40 40 84-4-24-18-40-44-44-30 0-56 14-66 40z" fill="#2B1B3D" />
      <circle cx="130" cy="160" r="5" fill="#2B1B3D" /><circle cx="172" cy="160" r="5" fill="#2B1B3D" />
      <path d="M132 184c10 12 28 12 38 0" fill="none" stroke="#B4533C" strokeWidth="4" strokeLinecap="round" />
      <circle cx="116" cy="178" r="8" fill="#F29C93" opacity=".55" /><circle cx="186" cy="178" r="8" fill="#F29C93" opacity=".55" />
    </svg>
  )
}

function Portrait({ imageSrc, imageAlt, badgeValue, badgeLabel, note, chipOne, chipTwo }) {
  const image = safeImg(imageSrc)
  const chip = (bg, fg, r, pos, text, delay) => text && (
    <div className="fl pop" style={{ '--r': r, position: 'absolute', ...pos, background: bg, color: fg, padding: '9px 18px', borderRadius: '999px', fontFamily: BOLD, fontWeight: 800, fontSize: '14px', boxShadow: '0 8px 20px rgba(15,35,71,.18)', animationDelay: delay, border: '2px solid #0F2347' }}>{text}</div>
  )
  return (
    <div className="mya mya-portrait" style={{ position: 'relative', width: '100%', maxWidth: '480px', marginInline: 'auto', aspectRatio: '1 / 1.08' }}>
      <style>{PORTRAIT_CSS}</style>
      <svg aria-hidden="true" viewBox="0 0 400 430" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M70 40c70-50 200-34 262 28 60 60 56 190 4 262-52 70-168 92-246 40C14 322-8 210 6 140 16 92 40 62 70 40z" fill="#FBBF24" />
        <g style={{ transformOrigin: '200px 215px', animation: 'mya-spin 40s linear infinite' }}><circle cx="200" cy="215" r="196" fill="none" stroke="#2563EB" strokeWidth="3" strokeDasharray="3 14" strokeLinecap="round" /></g>
      </svg>
      <div style={{ position: 'absolute', left: '15%', right: '15%', top: '9%', bottom: '10%', borderRadius: '46% 46% 22px 22px / 38% 38% 22px 22px', overflow: 'hidden', border: '4px solid #0F2347', background: '#DCEBFF', boxShadow: '10px 12px 0 #0F2347' }}>
        {image ? <img src={image} alt={imageAlt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <Person />}
      </div>
      <div className="fl pop" style={{ '--r': '-6deg', position: 'absolute', left: '-4%', bottom: '14%', background: '#fff', border: '3px solid #0F2347', borderRadius: '20px', padding: '12px 18px', boxShadow: '6px 6px 0 #2563EB', display: 'flex', alignItems: 'center', gap: '12px', animationDelay: '.2s' }}>
        <span style={{ fontFamily: BOLD, fontWeight: 900, fontSize: '40px', lineHeight: 1, color: BLUE }}>{badgeValue}</span>
        <span style={{ fontFamily: BOLD, fontWeight: 700, fontSize: '14px', lineHeight: 1.15, color: INK, maxWidth: '8ch' }}>{badgeLabel}</span>
      </div>
      {chip(BLUE, '#fff', '5deg', { right: '-2%', top: '16%' }, chipOne, '.35s')}
      {chip('#fff', INK, '-4deg', { right: '4%', bottom: '4%' }, chipTwo, '.5s')}
      <Sparkle size={34} style={{ position: 'absolute', left: '4%', top: '8%' }} />
      <Sparkle size={20} color="#2563EB" style={{ position: 'absolute', right: '12%', top: '3%' }} />
      {note && (
        <div style={{ position: 'absolute', left: '-2%', top: '-2%', display: 'flex', alignItems: 'flex-start', gap: '2px', transform: 'rotate(-5deg)' }}>
          <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: '19px', color: INK, background: '#fff', border: '2px solid #0F2347', borderRadius: '14px', padding: '4px 12px' }}>{note}</span>
        </div>
      )}
    </div>
  )
}

export const MayaPortraitBlock = defineBlock({
  type: 'MayaPortraitBlock',
  label: 'Maya: retrato con insignia',
  category: 'atlas',
  defaultProps: { imageSrc: '', imageAlt: '', badgeValue: '6+', badgeLabel: 'años creando webs', note: '¡Hola, soy Maya!', chipOne: 'UI/UX', chipTwo: 'Marca' },
  fields: {
    imageSrc: { type: 'image', label: 'Retrato' }, imageAlt: { type: 'text', label: 'Texto alternativo' },
    badgeValue: { type: 'text', label: 'Insignia: cifra' }, badgeLabel: { type: 'text', label: 'Insignia: texto' },
    note: { type: 'text', label: 'Nota a mano' }, chipOne: { type: 'text', label: 'Etiqueta 1' }, chipTwo: { type: 'text', label: 'Etiqueta 2' },
  },
  groups: [{ label: 'Imagen', fields: ['imageSrc', 'imageAlt'] }, { label: 'Detalles', fields: ['badgeValue', 'badgeLabel', 'note', 'chipOne', 'chipTwo'] }],
  render: (props) => <Portrait {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
// Handwritten sticker label (eyebrow).
export const MayaTagBlock = defineBlock({
  type: 'MayaTagBlock',
  label: 'Maya: etiqueta a mano',
  category: 'atlas',
  defaultProps: { text: 'Diseñadora web freelance', tone: 'yellow', align: 'left' },
  fields: {
    text: { type: 'text', label: 'Texto' },
    tone: { type: 'select', label: 'Color', options: [{ value: 'yellow', label: 'Amarillo' }, { value: 'blue', label: 'Azul' }, { value: 'white', label: 'Blanco' }] },
    align: { type: 'select', label: 'Alineación', options: [{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }] },
  },
  render: ({ text, tone, align }) => {
    const [bg, fg] = tone === 'blue' ? [BLUE, '#fff'] : tone === 'white' ? ['#fff', INK] : [YELLOW, '#0F2347']
    return (
      <div style={{ display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', padding: '4px 0 10px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: HAND, fontWeight: 700, fontSize: '17px', color: fg, background: bg, border: '2px solid #0F2347', borderRadius: '12px 18px 14px 20px', padding: '6px 16px', transform: 'rotate(-2deg)', boxShadow: '3px 3px 0 #0F2347' }}>
          <Sparkle size={16} color={tone === 'yellow' ? '#2563EB' : '#FBBF24'} />{text}
        </span>
      </div>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
// Slanted scrolling strip of keywords.
const TICKER_CSS = `${CSS_BASE}
@keyframes mya-ticker{to{transform:translateX(-50%)}}
.mya-ticker .track{display:flex;width:max-content;animation:mya-ticker 32s linear infinite}
.mya-ticker:hover .track{animation-play-state:paused}
@media (prefers-reduced-motion: reduce){.mya-ticker .track{flex-wrap:wrap;width:auto;justify-content:center}.mya-ticker .dup{display:none}}`

function Ticker({ items, tone }) {
  const words = lines(items)
  const [bg, fg, star] = tone === 'blue' ? [BLUE, '#fff', '#FBBF24'] : ['#FBBF24', '#0F2347', '#2563EB']
  const row = (cls, hidden) => (
    <div className={cls} aria-hidden={hidden || undefined} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '28px', paddingRight: '28px', fontFamily: BOLD, fontWeight: 900, fontSize: 'clamp(22px, 3vw, 34px)', letterSpacing: '-.01em', color: fg, whiteSpace: 'nowrap' }}>{w}<Sparkle size={22} color={star} /></span>
      ))}
    </div>
  )
  return (
    <div className="mya mya-ticker" style={{ overflow: 'hidden', padding: '26px 0', background: 'transparent' }}>
      <style>{TICKER_CSS}</style>
      <div style={{ transform: 'rotate(-1.6deg)', margin: '0 -3%', background: bg, borderBlock: '3px solid #0F2347', padding: '14px 0' }}>
        <div className="track">{row('', false)}{row('dup', true)}</div>
      </div>
    </div>
  )
}

export const MayaTickerBlock = defineBlock({
  type: 'MayaTickerBlock',
  label: 'Maya: cinta de palabras',
  category: 'atlas',
  defaultProps: { items: 'Diseño web\nMarca\nTiendas en línea\nSEO\nUI/UX', tone: 'yellow' },
  fields: {
    items: { type: 'textarea', label: 'Palabras (una por línea)' },
    tone: { type: 'select', label: 'Color', options: [{ value: 'yellow', label: 'Amarillo' }, { value: 'blue', label: 'Azul' }] },
  },
  render: (props) => <Ticker {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
// Project cards: tilted "polaroids" with a generated browser mock-up.
const PALETTES = [['#FFE9A8', '#2563EB', '#0F2347'], ['#DCEBFF', '#F97316', '#0F2347'], ['#E3F5E1', '#16A34A', '#0F2347'], ['#FFD9E4', '#2563EB', '#0F2347'], ['#E8E1FF', '#FBBF24', '#0F2347'], ['#D6F1F5', '#F97316', '#0F2347']]

function Mock({ i }) {
  const [bg, accent, ink] = PALETTES[i % PALETTES.length]
  const v = i % 3
  return (
    <svg aria-hidden="true" viewBox="0 0 320 220" style={{ width: '100%', display: 'block' }}>
      <rect width="320" height="220" fill={bg} />
      <rect width="320" height="26" fill="#fff" /><circle cx="14" cy="13" r="4" fill="#F87171" /><circle cx="28" cy="13" r="4" fill="#FBBF24" /><circle cx="42" cy="13" r="4" fill="#34D399" />
      <rect x="62" y="7" width="150" height="12" rx="6" fill="#E5ECF7" />
      {v === 0 && <><rect x="24" y="52" width="140" height="14" rx="7" fill={ink} /><rect x="24" y="76" width="104" height="14" rx="7" fill={ink} /><rect x="24" y="104" width="120" height="8" rx="4" fill={ink} opacity=".35" /><rect x="24" y="124" width="64" height="24" rx="12" fill={accent} /><circle cx="236" cy="118" r="62" fill={accent} /><circle cx="250" cy="104" r="30" fill="#fff" opacity=".85" /><rect x="24" y="168" width="272" height="34" rx="10" fill="#fff" opacity=".8" /></>}
      {v === 1 && <><rect x="24" y="48" width="272" height="70" rx="12" fill={accent} /><rect x="40" y="64" width="120" height="12" rx="6" fill="#fff" /><rect x="40" y="86" width="80" height="10" rx="5" fill="#fff" opacity=".7" />{[0, 1, 2].map((k) => <rect key={k} x={24 + k * 94} y="134" width="84" height="66" rx="10" fill="#fff" />)}{[0, 1, 2].map((k) => <circle key={k} cx={66 + k * 94} cy="160" r="14" fill={bg} />)}</>}
      {v === 2 && <><rect x="24" y="48" width="86" height="154" rx="12" fill={ink} />{[0, 1, 2, 3].map((k) => <rect key={k} x="36" y={64 + k * 26} width="62" height="10" rx="5" fill="#fff" opacity={k === 0 ? 1 : 0.4} />)}<rect x="124" y="48" width="172" height="62" rx="12" fill="#fff" /><path d="M136 98c20-30 36 6 56-18s40 8 60-14" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" /><rect x="124" y="124" width="82" height="78" rx="12" fill={accent} /><rect x="214" y="124" width="82" height="78" rx="12" fill="#fff" /></>}
    </svg>
  )
}

const WORK_CSS = `${CSS_BASE}
.mya-work .card{transition:transform .25s cubic-bezier(.2,1.2,.4,1),box-shadow .25s ease;transform:rotate(var(--r,0deg)) translateY(var(--y,0px))}
.mya-work .card:hover,.mya-work .card:focus-visible{transform:rotate(0deg) translateY(-8px);box-shadow:10px 12px 0 #2563EB}
.mya-work .card:focus-visible{outline:3px solid #2563EB;outline-offset:4px}
@media (max-width:720px){.mya-work .card{--y:0px!important}}`

function Work({ eyebrow, title, highlight, subtitle, projects }) {
  const cards = lines(projects).map((l) => l.split('|').map((p) => p.trim()))
  const tilts = ['-2.2deg', '1.6deg', '-1deg', '2deg', '-1.8deg', '1.2deg']
  return (
    <section className="mya mya-work" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 8vw, 104px) 24px', background: 'var(--runly-color-bg, #F5F9FF)' }}>
      <style>{WORK_CSS}</style>
      <Sparkle size={44} style={{ position: 'absolute', right: '6%', top: '56px' }} />
      <div style={{ maxWidth: '1180px', marginInline: 'auto' }}>
        <div style={{ maxWidth: '760px' }}>
          {eyebrow && <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: '20px', color: BLUE }}>{eyebrow}</span>}
          <h2 style={{ margin: '6px 0 0', fontFamily: BOLD, fontWeight: 900, fontSize: 'clamp(34px, 5vw, 58px)', lineHeight: 1.04, letterSpacing: '-.02em', color: INK }}>{title} {highlight && <span style={marker}>{highlight}</span>}</h2>
          {subtitle && <p style={{ margin: '16px 0 0', fontSize: '18px', lineHeight: 1.6, color: MUTED, fontFamily: 'var(--runly-font-sans)' }}>{subtitle}</p>}
        </div>
        <div style={{ marginTop: '56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '40px 32px' }}>
          {cards.map(([name, kind, href], i) => (
            <a key={`${name}-${i}`} className="card" href={href || '#'} style={{ '--r': tilts[i % 6], '--y': i % 3 === 1 ? '36px' : '0px', display: 'block', textDecoration: 'none', background: '#fff', border: '3px solid #0F2347', borderRadius: '22px', padding: '12px 12px 18px', boxShadow: '7px 8px 0 #0F2347', color: INK }}>
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '2px solid #0F2347' }}><Mock i={i} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '10px', padding: '14px 6px 0' }}>
                <div>
                  <div style={{ fontFamily: BOLD, fontWeight: 900, fontSize: '22px', letterSpacing: '-.01em' }}>{name}</div>
                  {kind && <div style={{ fontFamily: HAND, fontSize: '15px', color: BLUE, marginTop: '2px' }}>{kind}</div>}
                </div>
                <span aria-hidden="true" style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '50%', background: YELLOW, border: '2px solid #0F2347', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '18px' }}>↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export const MayaWorkBlock = defineBlock({
  type: 'MayaWorkBlock',
  label: 'Maya: proyectos en tarjetas inclinadas',
  category: 'atlas',
  defaultProps: { eyebrow: 'Trabajo seleccionado', title: 'Algunos de mis', highlight: 'favoritos', subtitle: 'Cada proyecto es único.', projects: 'Bloom & Wild | Tienda en línea | /trabajo\nNorthland Studio | Sitio de agencia | /trabajo\nPure Balance | Sitio de bienestar | /trabajo' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra resaltada' }, subtitle: { type: 'textarea', label: 'Descripción' },
    projects: { type: 'textarea', label: 'Proyectos (Nombre | Tipo | Enlace, uno por línea)' },
  },
  render: (props) => <Work {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
// Testimonials as sticky notes.
function Notes({ eyebrow, title, highlight, testimonials }) {
  const items = String(testimonials ?? '').split(/\n---\n/).map((chunk) => {
    const [head, ...rest] = chunk.split('\n')
    const [name, role, rating] = head.split('|').map((s) => s.trim())
    return { name, role, stars: Math.max(0, Math.min(5, Number(rating) || 0)), quote: rest.join(' ').trim() }
  }).filter((t) => t.name && t.quote)
  const looks = [['#FFF1B8', '-2.5deg'], ['#fff', '1.8deg'], ['#DCEBFF', '-1.2deg']]
  return (
    <section className="mya" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 8vw, 104px) 24px', background: 'linear-gradient(180deg, #E8F1FF 0%, #F5F9FF 100%)' }}>
      <style>{CSS_BASE}</style>
      <div style={{ maxWidth: '1180px', marginInline: 'auto' }}>
        <div style={{ textAlign: 'center' }}>
          {eyebrow && <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: '20px', color: BLUE }}>{eyebrow}</span>}
          <h2 style={{ margin: '6px 0 0', fontFamily: BOLD, fontWeight: 900, fontSize: 'clamp(32px, 4.6vw, 54px)', lineHeight: 1.05, letterSpacing: '-.02em', color: INK }}>{title} {highlight && <span style={marker}>{highlight}</span>}</h2>
        </div>
        <div style={{ marginTop: '56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))', gap: '36px 28px' }}>
          {items.map((t, i) => {
            const [bg, rot] = looks[i % 3]
            return (
              <figure key={`${t.name}-${i}`} style={{ position: 'relative', margin: 0, padding: '34px 26px 24px', background: bg, border: '3px solid #0F2347', borderRadius: '6px 22px 8px 22px', boxShadow: '6px 7px 0 #0F2347', transform: `rotate(${rot})` }}>
                <span aria-hidden="true" style={{ position: 'absolute', top: '-14px', left: '50%', width: '88px', height: '26px', marginLeft: '-44px', background: 'rgba(251,191,36,.9)', border: '2px solid #0F2347', transform: 'rotate(-3deg)' }} />
                <div role="img" aria-label={`${t.stars} de 5 estrellas`} style={{ display: 'flex', gap: '3px' }}>{Array.from({ length: t.stars }, (_, k) => <Sparkle key={k} size={18} color="#2563EB" />)}</div>
                <blockquote style={{ margin: '12px 0 0', fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.6, color: INK }}>“{t.quote}”</blockquote>
                <figcaption style={{ marginTop: '18px' }}>
                  <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: '18px', color: INK }}>{t.name}</div>
                  {t.role && <div style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '14px', color: '#47536B' }}>{t.role}</div>}
                </figcaption>
              </figure>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const MayaNotesBlock = defineBlock({
  type: 'MayaNotesBlock',
  label: 'Maya: testimonios en notas adhesivas',
  category: 'atlas',
  defaultProps: { eyebrow: 'Clientes felices', title: 'Resultados', highlight: 'reales', testimonials: 'Jessica Miller|Fundadora, Bloom & Wild|5\nEl sitio se ve increíble y funciona mejor que nunca.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra resaltada' },
    testimonials: { type: 'textarea', label: 'Testimonios (Nombre|Cargo|Estrellas, luego el texto; separa con ---)' },
  },
  render: (props) => <Notes {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
// Inner-page hero with playful shapes.
function PageHero({ eyebrow, title, highlight, subtitle }) {
  return (
    <section className="mya" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 8vw, 96px) 24px clamp(48px, 7vw, 80px)', background: 'linear-gradient(180deg, #DCEBFF 0%, #F5F9FF 100%)' }}>
      <style>{`${CSS_BASE}@keyframes mya-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>
      <svg aria-hidden="true" viewBox="0 0 300 300" style={{ position: 'absolute', right: '-40px', top: '-30px', width: 'min(46vw, 380px)', animation: 'mya-bob 7s ease-in-out infinite' }}>
        <circle cx="170" cy="130" r="110" fill="#FBBF24" /><circle cx="110" cy="200" r="50" fill="#2563EB" /><circle cx="220" cy="220" r="26" fill="#fff" stroke="#0F2347" strokeWidth="4" />
      </svg>
      <Squiggle width={150} style={{ position: 'absolute', left: '5%', bottom: '24px' }} />
      <div style={{ position: 'relative', maxWidth: '1180px', marginInline: 'auto' }}>
        {eyebrow && <span style={{ display: 'inline-block', fontFamily: HAND, fontWeight: 700, fontSize: '18px', color: '#0F2347', background: '#fff', border: '2px solid #0F2347', borderRadius: '12px 18px 14px 20px', padding: '5px 16px', transform: 'rotate(-2deg)', boxShadow: '3px 3px 0 #0F2347' }}>{eyebrow}</span>}
        <h1 style={{ margin: '20px 0 0', maxWidth: '14ch', fontFamily: BOLD, fontWeight: 900, fontSize: 'clamp(40px, 7vw, 84px)', lineHeight: 1, letterSpacing: '-.03em', color: INK }}>{title} {highlight && <span style={marker}>{highlight}</span>}</h1>
        {subtitle && <p style={{ margin: '22px 0 0', maxWidth: '46ch', fontFamily: 'var(--runly-font-sans)', fontSize: '19px', lineHeight: 1.6, color: '#3B4A68' }}>{subtitle}</p>}
      </div>
    </section>
  )
}

export const MayaPageHeroBlock = defineBlock({
  type: 'MayaPageHeroBlock',
  label: 'Maya: encabezado de página',
  category: 'atlas',
  defaultProps: { eyebrow: 'Servicios', title: 'Todo lo que tu sitio', highlight: 'necesita', subtitle: 'Desde el diseño hasta la puesta en marcha.' },
  fields: { eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra resaltada' }, subtitle: { type: 'textarea', label: 'Descripción' } },
  render: (props) => <PageHero {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
// Closing call to action with a contact bar.
function Closing({ eyebrow, title, highlight, subtitle, ctaLabel, ctaHref, email, phone, location }) {
  const contacts = [['✉', email, email && `mailto:${email}`], ['☎', phone, phone && `tel:${phone.replace(/[^+\d]/g, '')}`], ['⌖', location, '']].filter(([, v]) => v)
  return (
    <section className="mya" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(64px, 9vw, 120px) 24px 0', background: NAVY, color: '#fff' }}>
      <style>{`${CSS_BASE}.mya-close .btn{transition:transform .2s ease,box-shadow .2s ease}.mya-close .btn:hover{transform:translate(-3px,-3px);box-shadow:8px 8px 0 #fff}.mya-close .btn:focus-visible{outline:3px solid #fff;outline-offset:3px}`}</style>
      <div className="mya-close" style={{ position: 'relative', maxWidth: '1100px', marginInline: 'auto', textAlign: 'center' }}>
        <svg aria-hidden="true" viewBox="0 0 200 200" style={{ position: 'absolute', left: '-6%', top: '-30px', width: 'clamp(80px, 14vw, 170px)', opacity: 0.95 }}><circle cx="100" cy="100" r="90" fill="#2563EB" /><circle cx="130" cy="70" r="30" fill="#FBBF24" /></svg>
        <Sparkle size={48} style={{ position: 'absolute', right: '4%', top: '0' }} />
        {eyebrow && <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: '22px', color: '#FBBF24', transform: 'rotate(-2deg)' }}>{eyebrow}</div>}
        <h2 style={{ margin: '12px auto 0', maxWidth: '14ch', fontFamily: BOLD, fontWeight: 900, fontSize: 'clamp(44px, 8vw, 104px)', lineHeight: 0.98, letterSpacing: '-.035em' }}>{title} {highlight && <span style={{ color: '#FBBF24' }}>{highlight}</span>}</h2>
        {subtitle && <p style={{ margin: '22px auto 0', maxWidth: '44ch', fontFamily: 'var(--runly-font-sans)', fontSize: '19px', lineHeight: 1.6, color: 'rgba(255,255,255,.88)' }}>{subtitle}</p>}
        {ctaLabel && <div style={{ marginTop: '34px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <a className="btn" href={ctaHref || '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '16px 34px', borderRadius: '999px', background: '#FBBF24', color: '#0F2347', border: '3px solid #fff', boxShadow: '5px 5px 0 #fff', fontFamily: BOLD, fontWeight: 900, fontSize: '18px', textDecoration: 'none' }}>{ctaLabel}<span aria-hidden="true">→</span></a>
          <Arrow color="#fff" style={{ transform: 'scaleX(-1) rotate(-20deg)', marginTop: '-34px' }} />
        </div>}
        {contacts.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 'clamp(48px, 7vw, 80px) 0 0', padding: '22px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px 34px', background: '#fff', color: INK, borderRadius: '26px 26px 0 0' }}>
            {contacts.map(([icon, value, href]) => (
              <li key={value} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontFamily: BOLD, fontWeight: 800, fontSize: '16px' }}>
                <span aria-hidden="true" style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#FBBF24', border: '2px solid #0F2347', display: 'grid', placeItems: 'center', fontSize: '15px' }}>{icon}</span>
                {href ? <a href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{value}</a> : value}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export const MayaClosingBlock = defineBlock({
  type: 'MayaClosingBlock',
  label: 'Maya: cierre con barra de contacto',
  category: 'atlas',
  defaultProps: { eyebrow: '¿Tienes un proyecto en mente?', title: 'Hagamos algo', highlight: 'increíble', subtitle: 'Me encantará conocerlo. Envíame un mensaje y empecemos juntos.', ctaLabel: 'Enviar mensaje', ctaHref: '/contacto', email: 'hola@mayadesigns.com', phone: '(415) 555-0198', location: 'San Diego, CA' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Palabra resaltada' }, subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
    email: { type: 'text', label: 'Correo' }, phone: { type: 'text', label: 'Teléfono' }, location: { type: 'text', label: 'Ubicación' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'subtitle'] }, { label: 'Botón', fields: ['ctaLabel', 'ctaHref'] }, { label: 'Contacto', fields: ['email', 'phone', 'location'] }],
  render: (props) => <Closing {...props} />,
})

export const mayaBlocks = [MayaPortraitBlock, MayaTagBlock, MayaTickerBlock, MayaWorkBlock, MayaNotesBlock, MayaPageHeroBlock, MayaClosingBlock]
