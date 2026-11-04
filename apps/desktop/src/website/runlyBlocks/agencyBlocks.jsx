import { useCallback, useRef } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Bold, near-black agency kit: oversized display type, kinetic marquee, generative SVG posters and cursor-reactive
// hover states. System fonts only; all art is inline SVG/CSS; motion is switched off under prefers-reduced-motion.
const INK = '#0B0B0F'
const PAPER = '#F4F4EF'
const MUTED = '#A8A8B3'
const LIME = 'var(--runly-color-accent, #C6FF3D)'
const DISPLAY = "'Helvetica Neue', 'Arial Black', Arial, 'Segoe UI', system-ui, sans-serif"
const SANS = 'var(--runly-font-sans, system-ui, sans-serif)'
const WRAP = { width: '100%', maxWidth: '1320px', marginInline: 'auto', paddingInline: 'clamp(20px, 4vw, 48px)', boxSizing: 'border-box' }

const STYLE = `
@keyframes ag-run{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes ag-spin{to{transform:rotate(360deg)}}
@keyframes ag-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.ag a:focus-visible,.ag button:focus-visible{outline:3px solid ${PAPER};outline-offset:3px}
.ag-btn{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 28px;border-radius:999px;font:800 15px/1 ${SANS};letter-spacing:.01em;text-decoration:none;transition:transform .2s ease,background .2s ease,color .2s ease}
.ag-btn:hover{transform:translateY(-3px)}
.ag-hero{position:relative;overflow:hidden;background:${INK};color:${PAPER}}
.ag-spot{position:absolute;inset:0;pointer-events:none;background:radial-gradient(520px circle at var(--mx,72%) var(--my,28%),rgba(198,255,61,.16),transparent 62%)}
.ag-grain{position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(ellipse at 70% 30%,#000,transparent 75%);mask-image:radial-gradient(ellipse at 70% 30%,#000,transparent 75%)}
.ag-word{display:inline-block;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.ag-word:hover{transform:translateY(-.06em) skewX(-6deg)}
.ag-outline{color:transparent;-webkit-text-stroke:2px ${LIME};transition:color .3s ease}
.ag-outline:hover{color:${LIME}}
.ag-ring{animation:ag-spin 28s linear infinite}
.ag-track{display:flex;width:max-content;animation:ag-run var(--dur,30s) linear infinite}
.ag-track.rev{animation-direction:reverse}
.ag-poster{position:relative;overflow:hidden;border-radius:6px;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.ag-card:hover .ag-poster{transform:scale(.985)}
.ag-layer{position:absolute;inset:-4%;transform:translate(calc(var(--px,0)*16px),calc(var(--py,0)*16px)) rotate(calc(var(--px,0)*1.5deg));transition:transform .25s ease-out}
.ag-glow{position:absolute;inset:0;opacity:0;transition:opacity .25s;background:radial-gradient(300px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.38),transparent 60%);mix-blend-mode:soft-light}
.ag-card:hover .ag-glow{opacity:1}
.ag-work{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:clamp(40px,6vw,88px) clamp(16px,2.4vw,32px)}
.ag-row{position:relative;display:grid;grid-template-columns:90px minmax(0,1.3fr) minmax(0,1fr) 56px;gap:24px;align-items:center;padding:clamp(22px,3vw,40px) 18px;border-top:1px solid rgba(244,244,239,.22);text-decoration:none;color:${PAPER};background:radial-gradient(420px circle at var(--mx,50%) 50%,transparent,transparent);transition:background .2s ease,color .2s ease,padding .25s ease}
.ag-row:hover{background:${LIME};color:${INK};padding-inline:32px}
.ag-row:hover .ag-arrow{background:${INK};color:${LIME};transform:rotate(-45deg)}
.ag-arrow{width:52px;height:52px;border-radius:50%;border:2px solid currentColor;display:grid;place-items:center;transition:transform .25s ease,background .2s,color .2s}
.ag-fact{transition:color .3s,-webkit-text-stroke-color .3s}
.ag-fact:hover{color:${LIME}}
.ag-person:hover .ag-mono{transform:rotate(-3deg) scale(1.03)}
.ag-mono{transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.ag-mail{background:linear-gradient(currentColor,currentColor) 0 100%/0 .08em no-repeat;transition:background-size .35s ease}
.ag-mail:hover{background-size:100% .08em}
@media (max-width:860px){
  .ag-work>*{grid-column:1/-1!important}
  .ag-row{grid-template-columns:48px minmax(0,1fr) 44px;gap:12px}
  .ag-row .ag-desc{grid-column:2/3;grid-row:2}
  .ag-arrow{width:44px;height:44px}
  .ag-voices,.ag-team{grid-template-columns:1fr!important}
  .ag-facts{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ag-team>*{margin-top:0!important}
}
@media (prefers-reduced-motion:reduce){.ag-track,.ag-ring{animation:none!important}.ag-word,.ag-btn,.ag-layer,.ag-poster,.ag-mono{transition:none!important}}`

const clean = (raw) => String(raw ?? '').split(/\n\s*---\s*\n/).map((part) => part.trim()).filter(Boolean)
const cells = (line) => String(line ?? '').split('|').map((part) => part.trim())
const entries = (raw) => clean(raw).map((part) => { const [head, ...rest] = part.split('\n'); return { cells: cells(head), text: rest.join(' ').trim() } })
const num = (i) => String(i + 1).padStart(2, '0')

function usePointer() {
  const ref = useRef(null)
  const onMove = useCallback((event) => {
    const el = ref.current
    if (!el || event.pointerType === 'touch') return
    const box = el.getBoundingClientRect()
    const x = (event.clientX - box.left) / (box.width || 1)
    const y = (event.clientY - box.top) / (box.height || 1)
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
    el.style.setProperty('--px', ((x - 0.5) * 2).toFixed(3))
    el.style.setProperty('--py', ((y - 0.5) * 2).toFixed(3))
  }, [])
  return { ref, onMove }
}

const Eyebrow = ({ children, color = MUTED }) => children ? (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color }}>
    <span style={{ width: '28px', height: '2px', background: 'currentColor' }} />{children}
  </div>
) : null

function Heading({ children, size = 'clamp(40px, 7vw, 104px)', color = PAPER, style }) {
  return <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 900, fontSize: size, lineHeight: 0.92, letterSpacing: '-0.055em', color, ...style }}>{children}</h2>
}

function Words({ text }) {
  return String(text ?? '').split(' ').map((word, i) => <span key={i}><span className="ag-word">{word}</span>{' '}</span>)
}

/* ---------------------------------------------------------------- Hero */
function Hero({ eyebrow, tag, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, size }) {
  const { ref, onMove } = usePointer()
  const full = size !== 'compact'
  return (
    <section ref={ref} onPointerMove={onMove} className="ag ag-hero" style={{ minHeight: full ? 'clamp(580px, 88vh, 900px)' : 'clamp(360px, 56vh, 560px)', display: 'flex', alignItems: 'flex-end' }}>
      <style>{STYLE}</style>
      <div className="ag-grain" aria-hidden="true" />
      <div className="ag-spot" aria-hidden="true" />
      {full && (
        <svg className="ag-ring" aria-hidden="true" viewBox="0 0 400 400" style={{ position: 'absolute', top: '7%', right: 'clamp(-90px, 2vw, 40px)', width: 'clamp(200px, 25vw, 360px)', opacity: 0.95, pointerEvents: 'none' }}>
          <defs><path id="ag-circ" d="M200 200 m-160 0 a160 160 0 1 1 320 0 a160 160 0 1 1 -320 0" /></defs>
          <circle cx="200" cy="200" r="104" fill={LIME} />
          <path d="M120 230 Q200 120 280 230" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
          <text fill={PAPER} fontFamily={DISPLAY} fontWeight="800" fontSize="23" letterSpacing="9"><textPath href="#ag-circ">{`${eyebrow || 'AGENCIA'} · ${eyebrow || 'AGENCIA'} · `.toUpperCase()}</textPath></text>
        </svg>
      )}
      <div style={{ ...WRAP, position: 'relative', zIndex: 1, paddingBlock: full ? 'clamp(96px, 14vw, 150px) clamp(36px, 5vw, 64px)' : 'clamp(80px, 11vw, 120px) 40px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 28px', marginBottom: 'clamp(20px, 3vw, 36px)' }}>
          <Eyebrow color={LIME}>{eyebrow}</Eyebrow>
          {tag && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', fontFamily: SANS, fontSize: '13px', fontWeight: 600, color: PAPER }}><span aria-hidden="true" style={{ width: '9px', height: '9px', borderRadius: '50%', background: LIME, animation: 'ag-pulse 2s ease-in-out infinite' }} />{tag}</span>}
        </div>
        <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 900, fontSize: full ? 'clamp(44px, 9.4vw, 150px)' : 'clamp(42px, 8.5vw, 132px)', lineHeight: 0.86, letterSpacing: '-0.065em', maxWidth: full ? '12ch' : '14ch', textTransform: 'none' }}>
          <Words text={title} />
          {highlight && <><br /><span className="ag-outline"><Words text={highlight} /></span></>}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '28px 48px', marginTop: 'clamp(28px, 4vw, 56px)' }}>
          {subtitle && <p style={{ margin: 0, maxWidth: '480px', fontFamily: SANS, fontSize: 'clamp(16px, 1.5vw, 19px)', lineHeight: 1.6, color: '#D6D6DD' }}>{subtitle}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {ctaLabel && <a className="ag-btn" href={ctaHref || '#'} style={{ background: LIME, color: INK }}>{ctaLabel}<span aria-hidden="true">→</span></a>}
            {ctaSecondLabel && <a className="ag-btn" href={ctaSecondHref || '#'} style={{ border: `2px solid ${PAPER}`, color: PAPER }}>{ctaSecondLabel}</a>}
          </div>
        </div>
      </div>
    </section>
  )
}

export const AgencyHeroBlock = defineBlock({
  type: 'AgencyHeroBlock', label: 'Agencia: hero tipográfico', category: 'atlas',
  defaultProps: { eyebrow: 'Estudio creativo', tag: 'Agenda abierta para nuevos proyectos', title: 'Marcas que no pasan', highlight: 'desapercibidas', subtitle: 'Estrategia, identidad y producto digital para empresas que quieren ser recordadas.', ctaLabel: 'Ver trabajo', ctaHref: '/portafolio', ctaSecondLabel: 'Hablemos', ctaSecondHref: '/contacto', size: 'full' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, tag: { type: 'text', label: 'Etiqueta de disponibilidad' },
    title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título delineado (acento)' }, subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    size: { type: 'select', label: 'Tamaño', options: [{ value: 'full', label: 'Completo' }, { value: 'compact', label: 'Compacto' }] },
  },
  render: (props) => <Hero {...props} />,
})

/* ------------------------------------------------------------- Marquee */
const SPEEDS = { slow: '48s', normal: '30s', fast: '18s' }
function Marquee({ items, speed }) {
  const list = String(items ?? '').split(/[·\n]/).map((s) => s.trim()).filter(Boolean)
  if (!list.length) return null
  const strip = (hidden) => (
    <div aria-hidden={hidden || undefined} style={{ display: 'flex', flex: 'none' }}>
      {list.map((text, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'clamp(20px, 3vw, 44px)', paddingRight: 'clamp(20px, 3vw, 44px)', whiteSpace: 'nowrap' }}>{text}<svg width="0.6em" height="0.6em" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0l2.2 7.8L20 10l-7.8 2.2L10 20l-2.2-7.8L0 10l7.8-2.2z" fill="currentColor" /></svg></span>)}
    </div>
  )
  const row = (reverse, filled) => (
    <div style={{ position: 'relative', zIndex: filled ? 1 : 0, overflow: 'hidden', transform: `rotate(${reverse ? 1 : -1.2}deg)`, margin: reverse ? '-4px -2% 0' : '0 -2%', background: filled ? LIME : INK, color: filled ? INK : 'transparent', WebkitTextStroke: filled ? '0' : `1.5px ${PAPER}`, borderBlock: filled ? 'none' : `1px solid rgba(244,244,239,.25)`, fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(30px, 5.4vw, 76px)', letterSpacing: '-0.04em', lineHeight: 1.2, paddingBlock: '.16em' }}>
      <div className={`ag-track${reverse ? ' rev' : ''}`} style={{ '--dur': SPEEDS[speed] ?? SPEEDS.normal }}>{strip(false)}{strip(true)}</div>
    </div>
  )
  return (
    <section className="ag" aria-label={list.join(', ')} style={{ background: INK, overflow: 'hidden', paddingBlock: 'clamp(28px, 4vw, 56px)' }}>
      <style>{STYLE}</style>
      {row(false, true)}{row(true, false)}
    </section>
  )
}

export const AgencyMarqueeBlock = defineBlock({
  type: 'AgencyMarqueeBlock', label: 'Agencia: marquesina cinética', category: 'atlas',
  defaultProps: { items: 'Estrategia · Identidad · Sitios web · Producto digital · Contenido · Performance', speed: 'normal' },
  fields: {
    items: { type: 'textarea', label: 'Palabras (separadas por ·)' },
    speed: { type: 'select', label: 'Velocidad', options: [{ value: 'slow', label: 'Lenta' }, { value: 'normal', label: 'Media' }, { value: 'fast', label: 'Rápida' }] },
  },
  render: (props) => <Marquee {...props} />,
})

/* ---------------------------------------------------------------- Work */
const POSTERS = [
  { bg: '#C6FF3D', ink: '#0B0B0F' }, { bg: '#FF4D2E', ink: '#0B0B0F' }, { bg: '#7C5CFF', ink: '#0B0B0F' },
  { bg: '#F4F4EF', ink: '#0B0B0F' }, { bg: '#17171F', ink: '#C6FF3D' }, { bg: '#2B6BFF', ink: '#F4F4EF' },
]
function Art({ i }) {
  const dots = []
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 12; x += 1) dots.push(<circle key={`${x}-${y}`} cx={30 + x * 48} cy={30 + y * 50} r="4" fill="#0B0B0F" />)
  switch (i % 6) {
    case 0: return <g fill="none" stroke="#0B0B0F" strokeWidth="16">{[200, 160, 120, 80].map((r) => <circle key={r} cx="400" cy="200" r={r} />)}<circle cx="400" cy="200" r="34" fill="#0B0B0F" /><rect x="40" y="260" width="200" height="110" fill="#0B0B0F" stroke="none" /></g>
    case 1: return <g><path d="M0 420V240a300 300 0 0 1 600 0v180z" fill="#FFF3E0" /><path d="M60 420V250a240 240 0 0 1 480 0v170z" fill="#FF4D2E" /><path d="M140 420V260a160 160 0 0 1 320 0v160z" fill="#0B0B0F" /><circle cx="300" cy="150" r="40" fill="#C6FF3D" /></g>
    case 2: return <g>{[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <rect key={n} x={n * 80 - 10} y={60 + ((n * 53) % 160)} width="56" height="420" rx="28" fill={n % 3 === 0 ? '#0B0B0F' : n % 3 === 1 ? '#F4F4EF' : '#C6FF3D'} />)}</g>
    case 3: return <g>{dots}<circle cx="380" cy="190" r="130" fill="#C6FF3D" stroke="#0B0B0F" strokeWidth="14" /><rect x="110" y="230" width="150" height="150" fill="#0B0B0F" /></g>
    case 4: return <g fill="none" stroke="#C6FF3D" strokeWidth="5" strokeLinecap="round">{[0, 1, 2, 3, 4, 5, 6].map((n) => <path key={n} d={`M-20 ${90 + n * 34} C 120 ${20 + n * 34}, 200 ${200 + n * 20}, 320 ${110 + n * 34} S 520 ${30 + n * 40}, 640 ${120 + n * 30}`} opacity={1 - n * 0.1} />)}<circle cx="430" cy="130" r="26" fill="#F4F4EF" stroke="none" /></g>
    default: return <g>{[0, 1, 2, 3, 4].map((n) => <rect key={n} x={40 + (n % 2) * 90 + n * 30} y={36 + n * 70} width={360 - (n % 3) * 70} height="52" rx="26" fill={n % 2 ? '#0B0B0F' : '#F4F4EF'} />)}<circle cx="500" cy="300" r="70" fill="#C6FF3D" /></g>
  }
}

function Poster({ i, ratio }) {
  const { ref, onMove } = usePointer()
  const theme = POSTERS[i % 6]
  return (
    <div ref={ref} onPointerMove={onMove} className="ag-poster" aria-hidden="true" style={{ background: theme.bg, aspectRatio: ratio }}>
      <svg className="ag-layer" viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice" style={{ width: '108%', height: '108%' }}><Art i={i} /></svg>
      <span style={{ position: 'absolute', left: 0, bottom: 0, padding: '0 .14em 0 .1em', borderTopRightRadius: '10px', background: INK, fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(44px, 6vw, 92px)', lineHeight: 1.05, letterSpacing: '-0.06em', color: LIME }}>{num(i)}</span>
      <div className="ag-glow" />
    </div>
  )
}

const SPANS = [[7, '16/10'], [5, '4/4.4'], [12, '21/8'], [5, '4/4.4'], [7, '16/10'], [12, '21/8']]
function Work({ eyebrow, title, projects, ctaLabel, ctaHref }) {
  const list = entries(projects)
  return (
    <section className="ag" style={{ background: INK, color: PAPER, paddingBlock: 'clamp(64px, 9vw, 130px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow color={LIME}>{eyebrow}</Eyebrow>
        <Heading style={{ marginTop: '20px', marginBottom: 'clamp(40px, 6vw, 88px)', maxWidth: '14ch' }}>{title}</Heading>
        <div className="ag-work">
          {list.map((item, i) => {
            const [name, category, year, result] = item.cells
            const [span, ratio] = SPANS[i % SPANS.length]
            return (
              <article key={i} className="ag-card" style={{ gridColumn: `span ${span}`, marginTop: i % 2 && span < 12 ? 'clamp(0px, 5vw, 72px)' : 0 }}>
                <Poster i={i} ratio={ratio} />
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px 20px', marginTop: '18px' }}>
                  <h3 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(24px, 3vw, 40px)', letterSpacing: '-0.04em' }}>{name}</h3>
                  {result && <span style={{ padding: '5px 14px', borderRadius: '999px', background: LIME, color: INK, fontFamily: SANS, fontSize: '13px', fontWeight: 800 }}>{result}</span>}
                </div>
                <p style={{ margin: '8px 0 0', fontFamily: SANS, fontSize: '14px', letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED }}>{[category, year].filter(Boolean).join(' / ')}</p>
                {item.text && <p style={{ margin: '10px 0 0', maxWidth: '52ch', fontFamily: SANS, fontSize: '16px', lineHeight: 1.6, color: '#D6D6DD' }}>{item.text}</p>}
              </article>
            )
          })}
        </div>
        {ctaLabel && <div style={{ marginTop: 'clamp(40px, 6vw, 80px)' }}><a className="ag-btn" href={ctaHref || '#'} style={{ background: PAPER, color: INK }}>{ctaLabel}<span aria-hidden="true">→</span></a></div>}
      </div>
    </section>
  )
}

export const AgencyWorkBlock = defineBlock({
  type: 'AgencyWorkBlock', label: 'Agencia: casos con póster', category: 'atlas',
  defaultProps: {
    eyebrow: 'Trabajo selecto', title: 'Casos que se notan', ctaLabel: 'Ver todo el portafolio', ctaHref: '/portafolio',
    projects: 'Aurora | Identidad y web | 2025 | +180% tráfico\nMarca de bienestar con un sistema visual propio.\n---\nRuta | Producto digital | 2025 | 40k usuarios\nApp de logística urbana pensada para el día a día.\n---\nOrigen | Campaña | 2024 | 3x leads\nContenido y performance para una marca de consumo.',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    projects: { type: 'textarea', label: 'Casos (Nombre | Categoría | Año | Resultado, línea de descripción; separar con ---)' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  render: (props) => <Work {...props} />,
})

/* ------------------------------------------------------------ Services */
function Services({ eyebrow, title, services, showArrow }) {
  const { ref, onMove } = usePointer()
  const list = entries(services)
  return (
    <section ref={ref} onPointerMove={onMove} className="ag" style={{ background: INK, color: PAPER, paddingBlock: 'clamp(56px, 8vw, 120px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow color={LIME}>{eyebrow}</Eyebrow>
        <Heading style={{ marginTop: '20px', marginBottom: 'clamp(32px, 5vw, 64px)', maxWidth: '16ch' }}>{title}</Heading>
        <div>
          {list.map((item, i) => (
            <div key={i} className="ag-row" style={showArrow ? undefined : { gridTemplateColumns: '90px minmax(0,1.3fr) minmax(0,1fr)' }}>
              <span style={{ fontFamily: SANS, fontSize: '15px', fontWeight: 800, letterSpacing: '.1em' }}>{num(i)}</span>
              <h3 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(28px, 5vw, 68px)', lineHeight: 1, letterSpacing: '-0.05em' }}>{item.cells[0]}</h3>
              <p className="ag-desc" style={{ margin: 0, fontFamily: SANS, fontSize: '16px', lineHeight: 1.55 }}>{item.text}</p>
              {showArrow && <span className="ag-arrow" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>}
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(244,244,239,.22)' }} />
        </div>
      </div>
    </section>
  )
}

export const AgencyServicesBlock = defineBlock({
  type: 'AgencyServicesBlock', label: 'Agencia: lista de servicios', category: 'atlas',
  defaultProps: { eyebrow: 'Servicios', title: 'Lo que hacemos', showArrow: true, services: 'Estrategia de marca\nPosicionamiento, narrativa y un plan claro de crecimiento.\n---\nIdentidad visual\nLogotipo, sistema gráfico y manual vivo de marca.\n---\nSitios web y producto\nDiseño y desarrollo rápido, accesible y listo para convertir.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    services: { type: 'textarea', label: 'Filas (Nombre, luego descripción; separar con ---)' },
    showArrow: { type: 'toggle', label: 'Mostrar flecha' },
  },
  render: (props) => <Services {...props} />,
})

/* --------------------------------------------------------------- Facts */
function Facts({ stats }) {
  const list = String(stats ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ cells: cells(l) }))
  return (
    <section className="ag" style={{ background: INK, color: PAPER, paddingBlock: 'clamp(48px, 7vw, 100px)', borderBlock: '1px solid rgba(244,244,239,.18)' }}>
      <style>{STYLE}</style>
      <div className="ag-facts" style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '36px 24px' }}>
        {list.map((item, i) => (
          <div key={i}>
            <div className="ag-fact" style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(54px, 8.5vw, 136px)', lineHeight: 0.9, letterSpacing: '-0.07em', color: 'transparent', WebkitTextStroke: `2px ${PAPER}` }}>{item.cells[0]}</div>
            <div style={{ marginTop: '14px', fontFamily: SANS, fontSize: '15px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: PAPER }}>{item.cells[1]}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export const AgencyFactsBlock = defineBlock({
  type: 'AgencyFactsBlock', label: 'Agencia: cifras gigantes', category: 'atlas',
  defaultProps: { stats: '200+ | Proyectos\n50+ | Clientes\n98% | Retención\n15 | Premios' },
  fields: { stats: { type: 'textarea', label: 'Cifras (una por línea: Valor | Etiqueta)' } },
  render: (props) => <Facts {...props} />,
})

/* -------------------------------------------------------------- Voices */
function Voices({ eyebrow, title, voices }) {
  const list = entries(voices)
  return (
    <section className="ag" style={{ background: PAPER, color: INK, paddingBlock: 'clamp(64px, 9vw, 130px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow color="#3F3F46">{eyebrow}</Eyebrow>
        <Heading color={INK} style={{ marginTop: '20px', marginBottom: 'clamp(36px, 5vw, 72px)', maxWidth: '14ch' }}>{title}</Heading>
        <div className="ag-voices" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0,1fr))', gap: 'clamp(28px, 4vw, 56px) 32px' }}>
          {list.map((item, i) => (
            <figure key={i} style={{ margin: 0, gridColumn: i === 0 ? 'span 12' : 'span 6', paddingTop: i === 0 ? 0 : '24px', borderTop: i === 0 ? 'none' : `3px solid ${INK}` }}>
              <blockquote style={{ margin: 0, fontFamily: DISPLAY, fontWeight: i === 0 ? 900 : 700, fontSize: i === 0 ? 'clamp(26px, 4.4vw, 62px)' : 'clamp(19px, 2vw, 26px)', lineHeight: i === 0 ? 1.04 : 1.3, letterSpacing: i === 0 ? '-0.04em' : '-0.015em', maxWidth: i === 0 ? '24ch' : 'none' }}>
                <span aria-hidden="true" style={{ background: INK, color: '#C6FF3D', padding: '0 .22em', marginRight: '.2em', borderRadius: '4px' }}>“</span>{item.text}
              </blockquote>
              <figcaption style={{ marginTop: '18px', fontFamily: SANS, fontSize: '15px', fontWeight: 800 }}>{item.cells[0]}<span style={{ fontWeight: 500, color: '#3F3F46' }}>{item.cells[1] ? ` / ${item.cells[1]}` : ''}</span></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

export const AgencyVoicesBlock = defineBlock({
  type: 'AgencyVoicesBlock', label: 'Agencia: citas de clientes', category: 'atlas',
  defaultProps: { eyebrow: 'Clientes', title: 'Lo que dicen', voices: 'Ricardo Blanco | CEO, FinTech\nDuplicamos el tráfico orgánico en tres meses y la marca por fin se parece a lo que somos.\n---\nCristina Pacheco | Marketing, Retailmex\nUn rebrand moderno, coherente y con una identidad que conecta.\n---\nSamuel Orozco | Fundador, EduTech\nEntregaron a tiempo, dentro del presupuesto y con una calidad excepcional.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    voices: { type: 'textarea', label: 'Citas (Nombre | Cargo, luego la cita; separar con ---)' },
  },
  render: (props) => <Voices {...props} />,
})

/* ---------------------------------------------------------------- Team */
const initials = (name) => String(name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
function Team({ eyebrow, title, team }) {
  const list = entries(team)
  return (
    <section className="ag" style={{ background: INK, color: PAPER, paddingBlock: 'clamp(56px, 8vw, 120px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow color={LIME}>{eyebrow}</Eyebrow>
        <Heading style={{ marginTop: '20px', marginBottom: 'clamp(36px, 5vw, 72px)', maxWidth: '12ch' }}>{title}</Heading>
        <div className="ag-team" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '28px 20px', alignItems: 'start' }}>
          {list.map((item, i) => {
            const theme = POSTERS[i % 6]
            return (
              <article key={i} className="ag-person" style={{ marginTop: i % 2 ? 'clamp(0px, 6vw, 88px)' : 0 }}>
                <div className="ag-mono" aria-hidden="true" style={{ position: 'relative', overflow: 'hidden', aspectRatio: '4/5', borderRadius: '6px', background: theme.bg }}>
                  <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <g opacity="0.9">{i % 2 ? <circle cx="300" cy="120" r="110" fill="none" stroke={theme.ink} strokeWidth="18" /> : <rect x="220" y="40" width="200" height="200" rx="100" fill={theme.ink} opacity=".25" />}</g>
                  </svg>
                  <span style={{ position: 'absolute', left: '8%', bottom: '4%', fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(72px, 9vw, 130px)', lineHeight: 1, letterSpacing: '-0.08em', color: theme.ink }}>{initials(item.cells[0])}</span>
                </div>
                <h3 style={{ margin: '16px 0 0', fontFamily: DISPLAY, fontWeight: 900, fontSize: '24px', letterSpacing: '-0.03em' }}>{item.cells[0]}</h3>
                <p style={{ margin: '4px 0 0', fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: LIME }}>{item.cells[1]}</p>
                <p style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: '15px', lineHeight: 1.6, color: '#D6D6DD' }}>{item.text}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const AgencyTeamBlock = defineBlock({
  type: 'AgencyTeamBlock', label: 'Agencia: equipo con monogramas', category: 'atlas',
  defaultProps: { eyebrow: 'Equipo', title: 'Las personas detrás', team: 'Andrés Villanueva | Dirección creativa\nMás de 12 años en identidad y diseño digital.\n---\nValeria Cruz | Estrategia\nMarketing digital y consultoría de marca.\n---\nJorge Medina | Desarrollo\nArquitecturas web limpias y escalables.\n---\nNatalia Ríos | Diseño UX\nInvestigación y diseño centrado en la conversión.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    team: { type: 'textarea', label: 'Personas (Nombre | Cargo, luego bio; separar con ---)' },
  },
  render: (props) => <Team {...props} />,
})

/* ------------------------------------------------------------- Closing */
function Closing({ eyebrow, title, highlight, email, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref }) {
  const { ref, onMove } = usePointer()
  return (
    <section ref={ref} onPointerMove={onMove} className="ag" style={{ position: 'relative', overflow: 'hidden', background: '#C6FF3D', color: INK, paddingBlock: 'clamp(72px, 10vw, 150px)' }}>
      <style>{STYLE}</style>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(480px circle at var(--mx,30%) var(--my,60%), rgba(255,255,255,.55), transparent 62%)' }} />
      <div style={{ ...WRAP, position: 'relative' }}>
        <Eyebrow color={INK}>{eyebrow}</Eyebrow>
        <h2 style={{ margin: 'clamp(20px, 3vw, 36px) 0 0', fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(46px, 10.5vw, 168px)', lineHeight: 0.86, letterSpacing: '-0.065em', maxWidth: '12ch' }}>
          <Words text={title} />{highlight && <><br /><span style={{ fontStyle: 'italic', fontWeight: 800 }}><Words text={highlight} /></span></>}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px 40px', marginTop: 'clamp(32px, 5vw, 64px)' }}>
          {ctaLabel && <a className="ag-btn" href={ctaHref || '#'} style={{ background: INK, color: PAPER }}>{ctaLabel}<span aria-hidden="true">→</span></a>}
          {ctaSecondLabel && <a className="ag-btn" href={ctaSecondHref || '#'} style={{ border: `2px solid ${INK}`, color: INK }}>{ctaSecondLabel}</a>}
          {email && <a className="ag-mail" href={`mailto:${email}`} style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(20px, 3vw, 36px)', letterSpacing: '-0.03em', color: INK, textDecoration: 'none', overflowWrap: 'anywhere' }}>{email}</a>}
        </div>
      </div>
    </section>
  )
}

export const AgencyClosingBlock = defineBlock({
  type: 'AgencyClosingBlock', label: 'Agencia: cierre gigante', category: 'atlas',
  defaultProps: { eyebrow: 'Siguiente paso', title: 'Tu marca merece algo', highlight: 'inolvidable.', email: 'hola@nexusstudio.com', ctaLabel: 'Iniciar proyecto', ctaHref: '/contacto', ctaSecondLabel: '', ctaSecondHref: '' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título en cursiva' }, email: { type: 'text', label: 'Correo' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
  },
  render: (props) => <Closing {...props} />,
})

export const agencyBlocks = [AgencyHeroBlock, AgencyMarqueeBlock, AgencyWorkBlock, AgencyServicesBlock, AgencyFactsBlock, AgencyVoicesBlock, AgencyTeamBlock, AgencyClosingBlock]
