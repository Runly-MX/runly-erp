import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Blocks of the "Serenity Spa" template: calm and airy, soft organic shapes that drift and a breathing orb.
// System font stacks only; every shape is inline SVG/CSS. Motion is slow, CSS-only and off for reduced motion.
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const SANS = 'var(--runly-font-sans, system-ui, sans-serif)'
const DEEP = '#234A42'
const SAGE = 'var(--runly-color-primary, #2F6B5F)'
const INK = 'var(--runly-color-fg, #1F3A35)'
const MUTED = 'var(--runly-color-muted, #55706A)'
const CLAY = '#8A5A3C'

const lines = (raw) => String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
const cells = (line) => line.split('|').map((c) => c.trim())

const CSS = `
@keyframes spa-drift{0%,100%{transform:translate(0,0) rotate(0deg) scale(1)}50%{transform:translate(18px,-22px) rotate(6deg) scale(1.05)}}
@keyframes spa-breathe{0%,100%{transform:scale(.86)}50%{transform:scale(1.08)}}
@keyframes spa-halo{0%,100%{transform:scale(.8);opacity:.5}50%{transform:scale(1.25);opacity:0}}
@keyframes spa-in{0%,45%{opacity:0}55%,95%{opacity:1}100%{opacity:0}}
@keyframes spa-out{0%,45%{opacity:1}55%,95%{opacity:0}100%{opacity:1}}
@keyframes spa-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.spa-blob{animation:spa-drift 22s ease-in-out infinite}
.spa-orb{animation:spa-breathe 9s ease-in-out infinite}
.spa-halo{animation:spa-halo 9s ease-out infinite}
.spa-in{animation:spa-in 9s ease-in-out infinite}
.spa-out{animation:spa-out 9s ease-in-out infinite}
.spa-line{animation:spa-rise 1s ease-out both}
.spa-btn{transition:transform .3s ease,background .3s ease}
.spa-btn:hover{transform:translateY(-2px)}
.spa-btn:focus-visible{outline:3px solid ${SAGE};outline-offset:3px}
.spa-row{display:grid;grid-template-columns:44px 1fr auto;gap:6px 20px;align-items:baseline;padding:26px 0;border-top:1px solid rgba(35,74,66,.2);transition:padding-left .35s ease}
.spa-row:hover{padding-left:12px}
.spa-row:hover .spa-name{color:${SAGE}}
.spa-meta{text-align:right}
@media (max-width:560px){.spa-row{grid-template-columns:32px 1fr}.spa-meta{grid-column:2;text-align:left}}
@media (prefers-reduced-motion: reduce){.spa *{animation:none!important;transition:none!important}.spa .spa-out{opacity:0!important}.spa .spa-in{opacity:1!important}}
`

// Soft organic shapes that drift slowly behind the content.
function Blob({ color, size, style, delay = 0 }) {
  return (
    <svg aria-hidden="true" className="spa-blob" viewBox="0 0 200 200" width={size} height={size} style={{ position: 'absolute', pointerEvents: 'none', animationDelay: `${delay}s`, ...style }}>
      <path d="M44 38c28-30 84-24 112 8s34 76 6 106-84 36-112 6S16 68 44 38z" fill={color} />
    </svg>
  )
}

function Leaf({ color = SAGE }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 160" width="86" height="116" style={{ display: 'block' }}>
      <path d="M60 4C16 40 8 96 60 156 112 96 104 40 60 4z" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M60 24v128M60 64c-14 6-22 14-28 26M60 64c14 6 22 14 28 26M60 100c-10 4-16 10-20 18M60 100c10 4 16 10 20 18" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function Pill({ label, href, solid, onDark }) {
  if (!label) return null
  const bg = solid ? (onDark ? '#F6F3EE' : SAGE) : 'transparent'
  const fg = solid ? (onDark ? DEEP : '#FFFFFF') : (onDark ? '#F6F3EE' : SAGE)
  return (
    <a className="spa-btn" href={href || '#'} style={{ display: 'inline-flex', alignItems: 'center', minHeight: '50px', padding: '0 30px', borderRadius: '999px', fontFamily: SANS, fontSize: '15px', fontWeight: 600, letterSpacing: '.02em', textDecoration: 'none', background: bg, color: fg, border: `1.5px solid ${solid ? bg : fg}` }}>{label}</a>
  )
}

function SpaHero({ size, eyebrow, title, accent, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, inhale, exhale, facts }) {
  const full = size !== 'page'
  const rows = lines(facts).slice(0, 3).map(cells).filter(([k, v]) => k && v)
  return (
    <section className="spa" style={{ position: 'relative', overflow: 'hidden', padding: full ? 'clamp(64px, 9vw, 120px) 24px clamp(72px, 9vw, 128px)' : 'clamp(56px, 7vw, 96px) 24px', background: 'linear-gradient(165deg, #F6F3EE 0%, #E7F0EB 100%)', color: INK }}>
      <style>{CSS}</style>
      <Blob color="#CFE3DB" size={520} style={{ top: '-180px', right: '-120px', opacity: 0.8 }} />
      <Blob color="#EBD9C8" size={380} delay={-8} style={{ bottom: '-160px', left: '-100px', opacity: 0.75 }} />
      <div style={{ position: 'relative', maxWidth: '1180px', marginInline: 'auto', display: 'grid', gridTemplateColumns: full ? 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' : '1fr', gap: 'clamp(40px, 6vw, 88px)', alignItems: 'center' }}>
        <div>
          {eyebrow && <p className="spa-line" style={{ margin: 0, fontFamily: SANS, fontSize: '13px', fontWeight: 600, letterSpacing: '.26em', textTransform: 'uppercase', color: CLAY }}>{eyebrow}</p>}
          <h1 className="spa-line" style={{ animationDelay: '.15s', margin: '22px 0 0', fontFamily: SERIF, fontWeight: 400, fontSize: full ? 'clamp(44px, 7vw, 96px)' : 'clamp(38px, 5.4vw, 72px)', lineHeight: 1.04, letterSpacing: '-0.02em' }}>
            {title}{accent && <> <em style={{ color: SAGE }}>{accent}</em></>}
          </h1>
          {subtitle && <p className="spa-line" style={{ animationDelay: '.3s', margin: '24px 0 0', maxWidth: '44ch', fontFamily: SANS, fontSize: '18px', lineHeight: 1.8, color: MUTED }}>{subtitle}</p>}
          {(ctaLabel || ctaSecondLabel) && (
            <div className="spa-line" style={{ animationDelay: '.45s', marginTop: '34px', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
              <Pill label={ctaLabel} href={ctaHref} solid />
              <Pill label={ctaSecondLabel} href={ctaSecondHref} />
            </div>
          )}
          {full && rows.length > 0 && (
            <dl style={{ margin: '44px 0 0', display: 'flex', flexWrap: 'wrap', gap: '20px 44px' }}>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dd style={{ margin: 0, fontFamily: SERIF, fontSize: '26px', color: INK }}>{value}</dd>
                  <dt style={{ marginTop: '2px', fontFamily: SANS, fontSize: '12px', letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED }}>{label}</dt>
                </div>
              ))}
            </dl>
          )}
        </div>
        {full && (
          <div style={{ position: 'relative', justifySelf: 'center', width: 'min(100%, 420px)', aspectRatio: '1 / 1', display: 'grid', placeItems: 'center' }}>
            <div aria-hidden="true" className="spa-halo" style={{ position: 'absolute', inset: '10%', borderRadius: '50%', border: '1.5px solid #6FA597' }} />
            <div aria-hidden="true" className="spa-halo" style={{ position: 'absolute', inset: '10%', borderRadius: '50%', border: '1.5px solid #6FA597', animationDelay: '-4.5s' }} />
            <div className="spa-orb" style={{ position: 'absolute', inset: '14%', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FFFFFF 0%, #DCEBE5 45%, #B3D2C7 100%)', boxShadow: '0 40px 90px rgba(47,107,95,.28), inset 0 -20px 50px rgba(47,107,95,.15)' }} />
            <p role="img" aria-label="Respira" style={{ position: 'relative', margin: 0, width: '8em', height: '1.4em', textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: '28px', color: DEEP }}>
              <span className="spa-in" style={{ position: 'absolute', inset: 0 }}>{inhale}</span>
              <span className="spa-out" style={{ position: 'absolute', inset: 0 }}>{exhale}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export const SpaHeroBlock = defineBlock({
  type: 'SpaHeroBlock',
  label: 'Spa: portada con respiración',
  category: 'atlas',
  defaultProps: {
    size: 'full', eyebrow: 'Spa urbano en Polanco', title: 'Un lugar para', accent: 'volver a ti',
    subtitle: 'Masajes, faciales y rituales de agua en espacios privados, con productos naturales y todo el tiempo del mundo.',
    ctaLabel: 'Reservar un ritual', ctaHref: '/contacto', ctaSecondLabel: 'Ver rituales', ctaSecondHref: '/servicios',
    inhale: 'Inhala', exhale: 'Exhala',
    facts: 'Rituales | 25+\nTerapeutas certificadas | 12\nAños de calma | 12',
  },
  fields: {
    size: { type: 'select', label: 'Tamaño', options: [{ value: 'full', label: 'Portada completa' }, { value: 'page', label: 'Encabezado de página' }] },
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, accent: { type: 'text', label: 'Palabra destacada (cursiva)' },
    subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    inhale: { type: 'text', label: 'Texto al inhalar' }, exhale: { type: 'text', label: 'Texto al exhalar' },
    facts: { type: 'textarea', label: 'Datos (Etiqueta | Valor, máx. 3)' },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'accent', 'subtitle', 'facts'] },
    { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
    { label: 'Respiración', fields: ['inhale', 'exhale'] },
    { label: 'Estilo', fields: ['size'] },
  ],
  render: (props) => <SpaHero {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
function SpaRituals({ eyebrow, title, subtitle, currency, rituals, ctaLabel, ctaHref }) {
  const rows = lines(rituals).map(cells).filter(([name]) => name)
  return (
    <section className="spa" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(64px, 9vw, 120px) 24px', background: 'var(--runly-color-bg, #F6F3EE)', color: INK }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: '1180px', marginInline: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(36px, 6vw, 96px)' }}>
        <div style={{ alignSelf: 'start', position: 'relative' }}>
          {eyebrow && <p style={{ margin: 0, fontFamily: SANS, fontSize: '13px', fontWeight: 600, letterSpacing: '.26em', textTransform: 'uppercase', color: CLAY }}>{eyebrow}</p>}
          <h2 style={{ margin: '18px 0 0', fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1.08, letterSpacing: '-0.02em' }}>{title}</h2>
          {subtitle && <p style={{ margin: '20px 0 0', maxWidth: '36ch', fontFamily: SANS, fontSize: '17px', lineHeight: 1.8, color: MUTED }}>{subtitle}</p>}
          <div style={{ marginTop: '28px' }}><Pill label={ctaLabel} href={ctaHref} solid /></div>
          <div style={{ marginTop: '40px' }}><Leaf /></div>
        </div>
        <ol style={{ margin: 0, padding: 0, borderBottom: '1px solid rgba(35,74,66,.2)' }}>
          {rows.map(([name, desc, duration, price], i) => (
            <li key={name} className="spa-row" style={{ listStyle: 'none' }}>
              <span aria-hidden="true" style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: '18px', color: CLAY }}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="spa-name" style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: '26px', transition: 'color .3s ease' }}>{name}</h3>
                {desc && <p style={{ margin: '6px 0 0', maxWidth: '48ch', fontFamily: SANS, fontSize: '15px', lineHeight: 1.7, color: MUTED }}>{desc}</p>}
              </div>
              <div className="spa-meta">
                {price && <p style={{ margin: 0, fontFamily: SERIF, fontSize: '22px', fontVariantNumeric: 'tabular-nums' }}>{currency}{price}</p>}
                {duration && <p style={{ margin: '4px 0 0', fontFamily: SANS, fontSize: '13px', letterSpacing: '.08em', color: MUTED }}>{duration}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export const SpaRitualsBlock = defineBlock({
  type: 'SpaRitualsBlock',
  label: 'Spa: lista de rituales',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Rituales', title: 'Tratamientos pensados para bajar el ritmo',
    subtitle: 'Cada ritual se adapta a tu cuerpo y a tu día. Sin prisa, sin ruido.', currency: '$',
    rituals: 'Masaje terapéutico | Técnicas para soltar tensión y mejorar la circulación. | 60 – 90 min | 1,200\nFacial premium | Limpieza profunda y activos naturales para una piel luminosa. | 75 min | 1,450\nAromaterapia | Aceites esenciales puros que equilibran cuerpo y mente. | 60 min | 1,100\nCircuito de hidroterapia | Agua a distintas temperaturas para renovar la energía. | 90 min | 980\nYoga y meditación | Clases guiadas, en grupo pequeño o privadas. | 60 min | 450\nNutrición holística | Asesoría para sostener los resultados de tus rituales. | 45 min | 700',
    ctaLabel: 'Reservar un ritual', ctaHref: '/contacto',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Subtítulo' },
    currency: { type: 'text', label: 'Moneda' },
    rituals: { type: 'textarea', label: 'Rituales (Nombre | Descripción | Duración | Precio, uno por línea)' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
  },
  render: (props) => <SpaRituals {...props} />,
})

// ---------------------------------------------------------------------------------------------------------------
function SpaClosing({ eyebrow, title, body, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, hours }) {
  const rows = lines(hours).map(cells).filter(([d, t]) => d && t)
  return (
    <section className="spa" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(72px, 10vw, 130px) 24px', background: `linear-gradient(160deg, ${DEEP} 0%, #2F5D54 100%)`, color: '#F6F3EE' }}>
      <style>{CSS}</style>
      <Blob color="#3C7266" size={480} style={{ top: '-200px', left: '-140px' }} />
      <Blob color="#2A5249" size={420} delay={-10} style={{ bottom: '-200px', right: '-100px' }} />
      <div style={{ position: 'relative', maxWidth: '1100px', marginInline: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(36px, 6vw, 88px)', alignItems: 'center' }}>
        <div>
          {eyebrow && <p style={{ margin: 0, fontFamily: SANS, fontSize: '13px', fontWeight: 600, letterSpacing: '.26em', textTransform: 'uppercase', color: '#E8C9AE' }}>{eyebrow}</p>}
          <h2 style={{ margin: '18px 0 0', fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(38px, 5.6vw, 72px)', lineHeight: 1.06, letterSpacing: '-0.02em' }}>{title}</h2>
          {body && <p style={{ margin: '22px 0 0', maxWidth: '42ch', fontFamily: SANS, fontSize: '18px', lineHeight: 1.8, color: 'rgba(246,243,238,.88)' }}>{body}</p>}
          <div style={{ marginTop: '32px', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            <Pill label={ctaLabel} href={ctaHref} solid onDark />
            <Pill label={ctaSecondLabel} href={ctaSecondHref} onDark />
          </div>
        </div>
        {rows.length > 0 && (
          <ul style={{ margin: 0, padding: 0 }}>
            {rows.map(([day, time]) => (
              <li key={day} style={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '18px 0', borderTop: '1px solid rgba(246,243,238,.22)' }}>
                <span style={{ fontFamily: SERIF, fontSize: '21px' }}>{day}</span>
                <span style={{ fontFamily: SANS, fontSize: '16px', fontVariantNumeric: 'tabular-nums', color: 'rgba(246,243,238,.88)' }}>{time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export const SpaClosingBlock = defineBlock({
  type: 'SpaClosingBlock',
  label: 'Spa: cierre con horario',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Agenda tu cita', title: 'Tu momento de calma empieza hoy',
    body: 'Primera consulta sin costo y 20% de descuento en tu primer ritual.',
    ctaLabel: 'Reservar ahora', ctaHref: '/contacto', ctaSecondLabel: 'WhatsApp', ctaSecondHref: 'https://wa.me/525500000000',
    hours: 'Lunes a sábado | 9:00 – 20:00\nDomingos | 10:00 – 17:00',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, body: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    hours: { type: 'textarea', label: 'Horario (Día | Horas, uno por línea)' },
  },
  render: (props) => <SpaClosing {...props} />,
})

export const spaRunlyBlocks = [SpaHeroBlock, SpaRitualsBlock, SpaClosingBlock]
