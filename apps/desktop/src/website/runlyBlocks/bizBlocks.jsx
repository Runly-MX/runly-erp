import { useEffect, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Sober, data-forward kit for B2B services: calm blue/slate, clear value proposition, process timeline, animated KPI
// band, case results, engagement comparison and trust signals. Inline SVG only; motion respects reduced-motion.
const INK = '#0F172A'
const BODY = '#475569'
const BLUE = 'var(--runly-color-primary, #1E40AF)'
const SKY = '#0369A1'
const LINE = '#E2E8F0'
const NAVY = '#0B1B3A'
const SANS = 'var(--runly-font-sans, system-ui, sans-serif)'
const WRAP = { width: '100%', maxWidth: '1180px', marginInline: 'auto', paddingInline: 'clamp(20px, 4vw, 40px)', boxSizing: 'border-box' }
const NUM = { fontVariantNumeric: 'tabular-nums' }

const STYLE = `
@keyframes bz-draw{from{stroke-dashoffset:420}to{stroke-dashoffset:0}}
@keyframes bz-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.bz a:focus-visible{outline:3px solid ${SKY};outline-offset:3px}
.bz-btn{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 26px;border-radius:8px;font:700 15px/1 ${SANS};text-decoration:none;transition:transform .2s ease,background .2s,box-shadow .2s}
.bz-btn:hover{transform:translateY(-2px)}
.bz-hero-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(32px,5vw,72px);align-items:center}
.bz-line{stroke-dasharray:420;animation:bz-draw 1.8s ease-out .2s backwards}
.bz-bar{transform-origin:bottom;animation:bz-grow .9s cubic-bezier(.2,.7,.2,1) backwards}
.bz-pillar{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px 20px;padding:26px 0 26px 22px;border-top:1px solid ${LINE};border-left:3px solid transparent;transition:border-color .2s,background .2s,padding .2s}
.bz-pillar:hover{border-left-color:${BLUE};background:linear-gradient(90deg,rgba(30,64,175,.06),transparent);padding-left:28px}
.bz-split{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(28px,5vw,80px);align-items:start}
.bz-steps{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:0 28px;position:relative}
.bz-step{position:relative;padding-top:64px}
.bz-step:before{content:"";position:absolute;top:21px;left:44px;right:-28px;height:2px;background:repeating-linear-gradient(90deg,#94A3B8 0 6px,transparent 6px 12px)}
.bz-step:last-child:before{display:none}
.bz-node{position:absolute;top:0;left:0;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:${BLUE};color:#fff;font:800 16px/1 ${SANS};box-shadow:0 0 0 6px #fff,0 0 0 8px rgba(30,64,175,.2)}
.bz-case{display:flex;flex-direction:column;background:#fff;border:1px solid ${LINE};border-top:4px solid ${BLUE};border-radius:12px;padding:28px;transition:transform .25s ease,box-shadow .25s ease}
.bz-case:hover{transform:translateY(-4px);box-shadow:0 20px 40px -20px rgba(15,23,42,.25)}
.bz-table{width:100%;border-collapse:separate;border-spacing:0;font-family:${SANS};min-width:640px}
.bz-table th,.bz-table td{padding:16px 18px;text-align:center;border-bottom:1px solid ${LINE}}
.bz-table th:first-child,.bz-table td:first-child{text-align:left;font-weight:600;color:${INK}}
.bz-table td.hl,.bz-table th.hl{background:rgba(30,64,175,.06)}
.bz-table th.hl{border-top:4px solid ${BLUE}}
@media (max-width:900px){
  .bz-hero-grid,.bz-split{grid-template-columns:1fr}
  .bz-steps{grid-template-columns:1fr;gap:0}
  .bz-step{padding:0 0 36px 68px}
  .bz-step:before{top:44px;bottom:0;left:21px;right:auto;width:2px;height:auto;background:repeating-linear-gradient(180deg,#94A3B8 0 6px,transparent 6px 12px)}
  .bz-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .bz-kpi{border-left:none!important}
  .bz-cases{grid-template-columns:1fr!important}
  .bz-closing{grid-template-columns:1fr!important}
}
@media (prefers-reduced-motion:reduce){.bz-line,.bz-bar{animation:none!important}.bz-btn,.bz-case,.bz-pillar{transition:none!important}}`

const clean = (raw) => String(raw ?? '').split(/\n\s*---\s*\n/).map((part) => part.trim()).filter(Boolean)
const cells = (line) => String(line ?? '').split('|').map((part) => part.trim())
const entries = (raw) => clean(raw).map((part) => { const [head, ...rest] = part.split('\n'); return { cells: cells(head), text: rest.join(' ').trim(), lines: rest.map((l) => l.trim()).filter(Boolean) } })
const lines = (raw) => String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
const num = (i) => String(i + 1).padStart(2, '0')
const rowsOf = (raw) => lines(raw).map((l) => ({ cells: cells(l) }))

const Check = ({ color = SKY, size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
const Eyebrow = ({ children, color = SKY }) => children ? <div style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color }}>{children}</div> : null
const H2 = ({ children, color = INK, style }) => <h2 style={{ margin: '12px 0 0', fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1.1, letterSpacing: '-0.03em', color, ...style }}>{children}</h2>
const Lead = ({ children, color = BODY }) => children ? <p style={{ margin: '16px 0 0', maxWidth: '58ch', fontFamily: SANS, fontSize: '17px', lineHeight: 1.65, color }}>{children}</p> : null

/* ---------------------------------------------------------------- Hero */
function Panel({ label, value, caption }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', background: '#fff', border: `1px solid ${LINE}`, borderRadius: '16px', padding: '26px', boxShadow: '0 30px 60px -30px rgba(15,23,42,.35)' }}>
      <div style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 600, color: BODY }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '6px 0 4px' }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(40px, 5vw, 60px)', letterSpacing: '-0.04em', color: INK, ...NUM }}>{value}</span>
        <span style={{ padding: '3px 10px', borderRadius: '99px', background: '#DCFCE7', color: '#166534', fontFamily: SANS, fontSize: '12px', fontWeight: 700 }}>vs. año anterior</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: '14px', color: BODY }}>{caption}</div>
      <svg viewBox="0 0 360 150" style={{ display: 'block', width: '100%', marginTop: '18px' }} fill="none">
        {[30, 70, 110].map((y) => <line key={y} x1="0" x2="360" y1={y} y2={y} stroke={LINE} strokeDasharray="3 5" />)}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <rect key={n} className="bz-bar" style={{ animationDelay: `${n * 70}ms` }} x={12 + n * 44} y={150 - (118 - n * 9)} width="26" height={118 - n * 9} rx="4" fill="#DBEAFE" />)}
        <path className="bz-line" d="M25 28 C 70 34, 90 52, 130 58 S 200 84, 240 96 S 310 118, 338 124" stroke="#1E40AF" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="338" cy="124" r="6" fill="#1E40AF" stroke="#fff" strokeWidth="3" />
      </svg>
      <div style={{ position: 'absolute', left: '-18px', bottom: '28px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: INK, color: '#fff', borderRadius: '10px', fontFamily: SANS, fontSize: '13px', fontWeight: 700, boxShadow: '0 16px 30px -12px rgba(15,23,42,.5)' }}><Check color="#7DD3FC" size={16} />Diagnóstico en 2 semanas</div>
    </div>
  )
}

function Hero({ eyebrow, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, proofs, panelLabel, panelValue, panelCaption, size }) {
  const full = size !== 'compact'
  const copy = (
    <div>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 style={{ margin: '16px 0 0', fontFamily: SANS, fontWeight: 800, fontSize: full ? 'clamp(36px, 5.2vw, 66px)' : 'clamp(32px, 4.4vw, 54px)', lineHeight: 1.04, letterSpacing: '-0.04em', color: INK, maxWidth: '18ch' }}>
        {title}{highlight && <> <span style={{ color: BLUE }}>{highlight}</span></>}
      </h1>
      <Lead>{subtitle}</Lead>
      {(ctaLabel || ctaSecondLabel) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '30px' }}>
          {ctaLabel && <a className="bz-btn" href={ctaHref || '#'} style={{ background: BLUE, color: '#fff' }}>{ctaLabel}<span aria-hidden="true">→</span></a>}
          {ctaSecondLabel && <a className="bz-btn" href={ctaSecondHref || '#'} style={{ border: `1.5px solid ${INK}`, color: INK }}>{ctaSecondLabel}</a>}
        </div>
      )}
      {full && lines(proofs).length > 0 && (
        <ul style={{ listStyle: 'none', margin: '30px 0 0', padding: '24px 0 0', borderTop: `1px solid ${LINE}`, display: 'flex', flexWrap: 'wrap', gap: '10px 28px' }}>
          {lines(proofs).map((text) => <li key={text} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: SANS, fontSize: '14px', fontWeight: 600, color: INK }}><Check />{text}</li>)}
        </ul>
      )}
    </div>
  )
  return (
    <section className="bz" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#EEF4FF 0%,#F8FAFC 100%)', paddingBlock: full ? 'clamp(56px, 8vw, 112px)' : 'clamp(48px, 6vw, 84px)' }}>
      <style>{STYLE}</style>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(30,64,175,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(30,64,175,.06) 1px,transparent 1px)', backgroundSize: '56px 56px', WebkitMaskImage: 'linear-gradient(180deg,#000,transparent 85%)', maskImage: 'linear-gradient(180deg,#000,transparent 85%)' }} />
      <div className={full ? 'bz-hero-grid' : undefined} style={{ ...WRAP, position: 'relative' }}>
        {copy}
        {full && <Panel label={panelLabel} value={panelValue} caption={panelCaption} />}
      </div>
    </section>
  )
}

export const BizHeroBlock = defineBlock({
  type: 'BizHeroBlock', label: 'Negocio: hero con propuesta de valor', category: 'atlas',
  defaultProps: {
    eyebrow: 'Consultoría para empresas', title: 'Decisiones claras, resultados', highlight: 'medibles.', subtitle: 'Acompañamos a empresas medianas a reducir costos, ordenar su operación y crecer con un plan que se puede ejecutar.',
    ctaLabel: 'Agendar diagnóstico', ctaHref: '/contacto', ctaSecondLabel: 'Ver servicios', ctaSecondHref: '/servicios',
    proofs: 'Sin contratos forzosos\nEquipo senior dedicado\nReportes semanales', panelLabel: 'Ahorro operativo promedio', panelValue: '-28%', panelCaption: 'Primeros 6 meses de acompañamiento', size: 'full',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título en azul' }, subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' }, ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    proofs: { type: 'textarea', label: 'Garantías (una por línea)' }, panelLabel: { type: 'text', label: 'Panel: etiqueta' }, panelValue: { type: 'text', label: 'Panel: cifra' }, panelCaption: { type: 'text', label: 'Panel: nota' },
    size: { type: 'select', label: 'Tamaño', options: [{ value: 'full', label: 'Completo' }, { value: 'compact', label: 'Compacto' }] },
  },
  render: (props) => <Hero {...props} />,
})

/* ------------------------------------------------------------- Pillars */
function Pillars({ eyebrow, title, subtitle, items, background }) {
  return (
    <section className="bz" style={{ background: background === 'muted' ? '#F1F5F9' : '#fff', paddingBlock: 'clamp(56px, 8vw, 104px)' }}>
      <style>{STYLE}</style>
      <div className="bz-split" style={WRAP}>
        <div style={{ position: 'sticky', top: '96px' }}>
          <Eyebrow>{eyebrow}</Eyebrow><H2>{title}</H2><Lead>{subtitle}</Lead>
        </div>
        <div style={{ borderBottom: `1px solid ${LINE}` }}>
          {entries(items).map((item, i) => (
            <div key={i} className="bz-pillar">
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: '15px', color: SKY, paddingTop: '5px', ...NUM }}>{num(i)}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px' }}>
                <h3 style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: '21px', letterSpacing: '-0.02em', color: INK }}>{item.cells[0]}</h3>
                {item.cells[1] && <span style={{ padding: '3px 11px', borderRadius: '99px', background: '#E0F2FE', color: '#075985', fontFamily: SANS, fontSize: '12px', fontWeight: 700 }}>{item.cells[1]}</span>}
              </div>
              <p style={{ gridColumn: 2, margin: 0, fontFamily: SANS, fontSize: '16px', lineHeight: 1.65, color: BODY }}>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export const BizPillarsBlock = defineBlock({
  type: 'BizPillarsBlock', label: 'Negocio: pilares numerados', category: 'atlas',
  defaultProps: { eyebrow: 'Por qué elegirnos', title: 'La ventaja de trabajar con nosotros', subtitle: 'Aliados estratégicos, no proveedores.', background: 'white', items: 'Metodología comprobada | Validada\nProcesos aplicados en más de 200 proyectos para resultados consistentes.\n---\nEquipo senior dedicado\nTu cuenta la atienden profesionales con experiencia real en tu industria.\n---\nEnfoque en retorno\nCada decisión busca un retorno medible sobre tu inversión.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    items: { type: 'textarea', label: 'Pilares (Nombre | Etiqueta opcional, luego descripción; separar con ---)' },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'white', label: 'Blanco' }, { value: 'muted', label: 'Gris suave' }] },
  },
  render: (props) => <Pillars {...props} />,
})

/* ------------------------------------------------------------- KPI band */
function Counter({ value, label }) {
  const match = /^(\D*)([\d.,]+)(.*)$/.exec(String(value))
  const target = match ? Number(match[2].replace(/,/g, '')) : null
  const decimals = match && match[2].includes('.') ? match[2].split('.')[1].length : 0
  const [shown, setShown] = useState(target)
  const ref = useRef(null)
  useEffect(() => {
    if (target == null || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined
    let raf
    const run = () => {
      const start = performance.now()
      const tick = (now) => { const p = Math.min(1, (now - start) / 1500); setShown(target * (1 - (1 - p) ** 3)); if (p < 1) raf = requestAnimationFrame(tick) }
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); setShown(0); run() } }, { threshold: 0.4 })
    io.observe(ref.current)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [target])
  const text = match ? `${match[1]}${Number(shown ?? 0).toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${match[3]}` : value
  return (
    <div ref={ref} aria-label={`${value} ${label}`}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(34px, 4.2vw, 56px)', letterSpacing: '-0.04em', lineHeight: 1, color: '#fff', ...NUM }}>{text}</div>
      <div style={{ marginTop: '10px', fontFamily: SANS, fontSize: '15px', lineHeight: 1.4, color: '#CBD5E1' }}>{label}</div>
    </div>
  )
}

function KpiBand({ eyebrow, title, kpis }) {
  return (
    <section className="bz" style={{ background: `radial-gradient(900px 400px at 85% 0%, rgba(14,165,233,.22), transparent 60%), ${NAVY}`, paddingBlock: 'clamp(52px, 7vw, 96px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow color="#7DD3FC">{eyebrow}</Eyebrow><H2 color="#fff" style={{ maxWidth: '24ch' }}>{title}</H2>
        <div className="bz-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '36px 0', marginTop: 'clamp(32px, 4vw, 56px)' }}>
          {rowsOf(kpis).map((item, i) => (
            <div key={i} className="bz-kpi" style={{ paddingInline: '28px', borderLeft: i ? '1px solid rgba(148,163,184,.3)' : 'none', paddingLeft: i ? undefined : 0 }}><Counter value={item.cells[0]} label={item.cells[1]} /></div>
          ))}
        </div>
      </div>
    </section>
  )
}

export const BizKpiBandBlock = defineBlock({
  type: 'BizKpiBandBlock', label: 'Negocio: franja de KPIs', category: 'atlas',
  defaultProps: { eyebrow: 'Resultados', title: 'Una trayectoria respaldada por números', kpis: '350+ | Empresas asesoradas\n$50M+ | En ahorros generados\n97% | Renovación de contratos\n10+ | Años en el mercado' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' },
    kpis: { type: 'textarea', label: 'KPIs (Cifra | Etiqueta; una por línea)' },
  },
  render: (props) => <KpiBand {...props} />,
})

/* ------------------------------------------------------------- Process */
function Process({ eyebrow, title, subtitle, steps }) {
  const list = entries(steps)
  return (
    <section className="bz" style={{ background: '#F8FAFC', paddingBlock: 'clamp(56px, 8vw, 104px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow><H2 style={{ maxWidth: '22ch' }}>{title}</H2><Lead>{subtitle}</Lead>
        <ol className="bz-steps" style={{ '--n': list.length, listStyle: 'none', margin: 'clamp(36px, 5vw, 64px) 0 0', padding: 0 }}>
          {list.map((item, i) => (
            <li key={i} className="bz-step">
              <span className="bz-node" aria-hidden="true">{i + 1}</span>
              {item.cells[1] && <div style={{ fontFamily: SANS, fontSize: '12px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: SKY }}>{item.cells[1]}</div>}
              <h3 style={{ margin: '6px 0 0', fontFamily: SANS, fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', color: INK }}>{item.cells[0]}</h3>
              <p style={{ margin: '8px 0 0', fontFamily: SANS, fontSize: '15px', lineHeight: 1.6, color: BODY }}>{item.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export const BizProcessBlock = defineBlock({
  type: 'BizProcessBlock', label: 'Negocio: línea de tiempo del proceso', category: 'atlas',
  defaultProps: { eyebrow: 'Cómo trabajamos', title: 'Un proceso claro, de la idea al resultado', subtitle: 'Cada etapa tiene entregables, responsables y fechas acordadas desde el inicio.', steps: 'Diagnóstico | Semanas 1-2\nEntrevistas, análisis de datos y mapa de oportunidades.\n---\nPlan | Semana 3\nIniciativas priorizadas con responsables y métricas.\n---\nImplementación | Meses 2-4\nEjecución acompañada con tablero de seguimiento.\n---\nOptimización | Mes 5 en adelante\nMedición, ajustes y transferencia al equipo.' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    steps: { type: 'textarea', label: 'Etapas (Nombre | Duración, luego descripción; separar con ---; 3 a 5)' },
  },
  render: (props) => <Process {...props} />,
})

/* --------------------------------------------------------------- Cases */
function Cases({ eyebrow, title, subtitle, cases }) {
  return (
    <section className="bz" style={{ background: '#fff', paddingBlock: 'clamp(56px, 8vw, 104px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow><H2 style={{ maxWidth: '22ch' }}>{title}</H2><Lead>{subtitle}</Lead>
        <div className="bz-cases" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '20px', marginTop: 'clamp(32px, 4vw, 56px)' }}>
          {entries(cases).map((item, i) => {
            const [client, sector, result, resultLabel] = item.cells
            return (
              <article key={i} className="bz-case">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 700, color: INK }}>{client}</span>
                  <span style={{ padding: '3px 10px', borderRadius: '99px', background: '#F1F5F9', color: BODY, fontFamily: SANS, fontSize: '12px', fontWeight: 600 }}>{sector}</span>
                </div>
                <div style={{ margin: '24px 0 4px', fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(44px, 5vw, 60px)', letterSpacing: '-0.04em', lineHeight: 1, color: BLUE, ...NUM }}>{result}</div>
                <div style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 700, color: INK }}>{resultLabel}</div>
                <svg viewBox="0 0 200 40" aria-hidden="true" style={{ width: '100%', height: '40px', margin: '16px 0' }} fill="none"><path d="M2 8 C 40 10, 60 30, 100 28 S 160 34, 198 32" stroke="#BFDBFE" strokeWidth="3" strokeLinecap="round" /><circle cx="198" cy="32" r="4" fill="#1E40AF" /></svg>
                <p style={{ margin: 0, flex: 1, fontFamily: SANS, fontSize: '15px', lineHeight: 1.65, color: BODY }}>{item.lines[0]}</p>
                {item.lines[1] && <p style={{ margin: '18px 0 0', paddingTop: '14px', borderTop: `1px solid ${LINE}`, fontFamily: SANS, fontSize: '13px', fontWeight: 600, color: INK }}>{item.lines[1]}</p>}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const BizCasesBlock = defineBlock({
  type: 'BizCasesBlock', label: 'Negocio: casos con resultado', category: 'atlas',
  defaultProps: { eyebrow: 'Casos de éxito', title: 'Resultados que otras empresas ya consiguieron', subtitle: '', cases: 'Grupo Lozano | Industrial | -28% | costos operativos en 6 meses\nReestructuramos compras y logística sin sacrificar calidad.\nFernando Lozano, Director General\n---\nDistribuidora Valdez | Distribución | 15 años | sin acceso a crédito preferencial\nOrdenamos la estructura financiera hasta lograr mejores tasas.\nMónica Valdez, CFO\n---\nTech Startup | Tecnología | Serie A | cerrada tras ordenar la operación\nAcompañamos del MVP a la ronda con control operativo.\nGustavo Aranda, CEO' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    cases: { type: 'textarea', label: 'Casos (Cliente | Sector | Resultado | Etiqueta; después descripción y firma en líneas; separar con ---)' },
  },
  render: (props) => <Cases {...props} />,
})

/* ---------------------------------------------------------- Engagement */
function Cell({ value }) {
  const v = String(value ?? '').trim()
  if (/^(si|sí|yes|x)$/i.test(v)) return <Check size={20} />
  if (/^(no|-)$/i.test(v) || !v) return <span aria-label="No incluido" style={{ color: '#94A3B8' }}>—</span>
  return <span style={{ fontWeight: 600, color: INK }}>{v}</span>
}

function Engagement({ eyebrow, title, subtitle, models, prices, rows, highlight, ctaLabel, ctaHref }) {
  const names = cells(models)
  const hl = Math.max(0, Math.min(names.length - 1, Number(highlight) - 1))
  const priceCells = cells(prices)
  return (
    <section className="bz" style={{ background: '#F1F5F9', paddingBlock: 'clamp(56px, 8vw, 104px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow><H2 style={{ maxWidth: '24ch' }}>{title}</H2><Lead>{subtitle}</Lead>
        <div role="region" aria-label={title} tabIndex={0} style={{ marginTop: 'clamp(28px, 4vw, 48px)', overflowX: 'auto', background: '#fff', border: `1px solid ${LINE}`, borderRadius: '14px' }}>
          <table className="bz-table">
            <thead>
              <tr>
                <th scope="col" style={{ color: BODY, fontSize: '13px', fontWeight: 600 }}>Modelo de trabajo</th>
                {names.map((name, i) => <th scope="col" key={i} className={i === hl ? 'hl' : undefined} style={{ fontSize: '18px', fontWeight: 800, color: INK }}>{name}{i === hl && <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: BLUE }}>Más elegido</div>}</th>)}
              </tr>
              {priceCells.length > 1 && (
                <tr><td style={{ fontSize: '13px', color: BODY }}>Inversión</td>{priceCells.slice(1).map((price, i) => <td key={i} className={i === hl ? 'hl' : undefined} style={{ fontSize: '17px', fontWeight: 800, color: INK, ...NUM }}>{price}</td>)}</tr>
              )}
            </thead>
            <tbody>
              {lines(rows).map((row, r) => { const parts = cells(row); return <tr key={r}><th scope="row" style={{ textAlign: 'left', fontWeight: 600, color: INK, fontSize: '15px' }}>{parts[0]}</th>{names.map((_, i) => <td key={i} className={i === hl ? 'hl' : undefined} style={{ fontSize: '15px' }}><Cell value={parts[i + 1]} /></td>)}</tr> })}
            </tbody>
          </table>
        </div>
        {ctaLabel && <div style={{ marginTop: '28px' }}><a className="bz-btn" href={ctaHref || '#'} style={{ background: BLUE, color: '#fff' }}>{ctaLabel}<span aria-hidden="true">→</span></a></div>}
      </div>
    </section>
  )
}

export const BizEngagementBlock = defineBlock({
  type: 'BizEngagementBlock', label: 'Negocio: comparación de modelos', category: 'atlas',
  defaultProps: {
    eyebrow: 'Modelos de trabajo', title: 'Elige cómo quieres trabajar con nosotros', subtitle: 'Precios claros desde el primer día, sin cargos ocultos.', highlight: '2', ctaLabel: 'Solicitar propuesta', ctaHref: '/contacto',
    models: 'Diagnóstico | Acompañamiento | Equipo dedicado', prices: 'Inversión | $18,000 único | $12,000 / mes | A medida',
    rows: 'Diagnóstico inicial | si | si | si\nConsultoría mensual | no | 16 horas | Ilimitada\nProyectos activos | no | 1 | Varios\nTablero de métricas | no | si | si\nCapacitación | no | Trimestral | Continua\nSLA de respuesta | no | no | si',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    models: { type: 'text', label: 'Modelos (separados con |)' }, prices: { type: 'text', label: 'Precios (Inversión | precio 1 | precio 2 ...)' },
    rows: { type: 'textarea', label: 'Filas (Concepto | valor por modelo; "si" = incluido, "no" = no incluido)' },
    highlight: { type: 'select', label: 'Modelo destacado', options: [{ value: '1', label: 'Primero' }, { value: '2', label: 'Segundo' }, { value: '3', label: 'Tercero' }] },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  render: (props) => <Engagement {...props} />,
})

/* --------------------------------------------------------------- Trust */
function Trust({ title, badges, clients }) {
  return (
    <section className="bz" style={{ background: '#fff', borderBlock: `1px solid ${LINE}`, paddingBlock: 'clamp(36px, 5vw, 60px)' }}>
      <style>{STYLE}</style>
      <div style={WRAP}>
        <div style={{ textAlign: 'center', fontFamily: SANS, fontSize: '13px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: BODY }}>{title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px 44px', margin: '22px 0' }}>
          {String(clients ?? '').split(/[·\n]/).map((c) => c.trim()).filter(Boolean).map((name, i) => <span key={i} style={{ fontFamily: i % 2 ? 'Georgia, serif' : SANS, fontWeight: i % 2 ? 700 : 800, fontStyle: i % 3 === 0 ? 'italic' : 'normal', fontSize: 'clamp(18px, 2vw, 24px)', letterSpacing: i % 2 ? '0' : '-0.03em', color: '#334155' }}>{name}</span>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px' }}>
          {rowsOf(badges).map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px 10px 12px', border: `1px solid ${LINE}`, borderRadius: '10px', background: '#F8FAFC' }}>
              <svg width="30" height="34" viewBox="0 0 30 34" aria-hidden="true"><path d="M15 1l12 4v10c0 9-5.5 14.5-12 18C8.500 29.500 3 24 3 15V5z" fill="#1E40AF" /><path d="M9.500 16.500l4 4 7-8" stroke="#fff" strokeWidth="2.600" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <div><div style={{ fontFamily: SANS, fontWeight: 800, fontSize: '14px', color: INK }}>{b.cells[0]}</div><div style={{ fontFamily: SANS, fontSize: '12px', color: BODY }}>{b.cells[1]}</div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export const BizTrustBlock = defineBlock({
  type: 'BizTrustBlock', label: 'Negocio: señales de confianza', category: 'atlas',
  defaultProps: { title: 'Empresas que confían en nosotros', clients: 'Grupo Lozano · Distribuidora Valdez · NovaTech · Altiva · Ferrum', badges: 'ISO 9001 | Gestión de calidad\nNDA firmado | Confidencialidad total\nAuditoría anual | Procesos verificados' },
  fields: {
    title: { type: 'text', label: 'Título' }, clients: { type: 'textarea', label: 'Clientes (separados por ·)' },
    badges: { type: 'textarea', label: 'Sellos (Nombre | Descripción; una por línea)' },
  },
  render: (props) => <Trust {...props} />,
})

/* ------------------------------------------------------------- Closing */
function Closing({ eyebrow, title, subtitle, points, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref }) {
  return (
    <section className="bz" style={{ background: '#fff', paddingBlock: 'clamp(48px, 7vw, 96px)' }}>
      <style>{STYLE}</style>
      <div className="bz-closing" style={{ ...WRAP, display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,.8fr)', gap: 'clamp(28px, 4vw, 56px)', alignItems: 'center', position: 'relative', background: `radial-gradient(700px 320px at 100% 0%, rgba(14,165,233,.3), transparent 60%), ${NAVY}`, borderRadius: '20px', padding: 'clamp(32px, 5vw, 64px)', width: 'min(1180px, calc(100% - 40px))' }}>
        <div>
          <Eyebrow color="#7DD3FC">{eyebrow}</Eyebrow>
          <H2 color="#fff" style={{ maxWidth: '20ch' }}>{title}</H2>
          <Lead color="#CBD5E1">{subtitle}</Lead>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '28px' }}>
            {ctaLabel && <a className="bz-btn" href={ctaHref || '#'} style={{ background: '#fff', color: NAVY }}>{ctaLabel}<span aria-hidden="true">→</span></a>}
            {ctaSecondLabel && <a className="bz-btn" href={ctaSecondHref || '#'} style={{ border: '1.5px solid rgba(255,255,255,.7)', color: '#fff' }}>{ctaSecondLabel}</a>}
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: '24px', display: 'grid', gap: '16px', borderRadius: '14px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(148,163,184,.3)' }}>
          {lines(points).map((text) => <li key={text} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontFamily: SANS, fontSize: '15px', lineHeight: 1.5, color: '#fff' }}><Check color="#7DD3FC" />{text}</li>)}
        </ul>
      </div>
    </section>
  )
}

export const BizClosingBlock = defineBlock({
  type: 'BizClosingBlock', label: 'Negocio: cierre con diagnóstico', category: 'atlas',
  defaultProps: { eyebrow: 'Diagnóstico gratuito', title: '45 minutos que pueden cambiar tu empresa', subtitle: 'Analizamos tu situación y te decimos con honestidad si podemos ayudarte.', points: 'Sin costo ni compromiso\nRespuesta en menos de 24 horas\nPlan de acción por escrito', ctaLabel: 'Agendar sesión', ctaHref: '/contacto', ctaSecondLabel: '', ctaSecondHref: '' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' }, points: { type: 'textarea', label: 'Qué incluye (una por línea)' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' }, ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
  },
  render: (props) => <Closing {...props} />,
})

export const bizBlocks = [BizHeroBlock, BizPillarsBlock, BizKpiBandBlock, BizProcessBlock, BizCasesBlock, BizEngagementBlock, BizTrustBlock, BizClosingBlock]
