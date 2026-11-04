// Asset-free editorial blocks for the store template: hero composition, collection tiles and a trust strip (CSS + inline SVG).
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { ACCENT, INK, LINE, MUTED, PAPER, SANS, SERIF, Styles, button } from './storeUi.jsx'

const lines = (raw, max) => String(raw ?? '').split('\n').map((l) => l.split('|').map((p) => p.trim())).filter(([a]) => a).slice(0, max)

function StoreHero({ eyebrow, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, badge, size }) {
  const compact = size === 'compact'
  return (
    <section style={{ position: 'relative', overflow: 'hidden', background: PAPER, padding: compact ? 'clamp(32px, 5vw, 56px) 24px' : 'clamp(48px, 8vw, 104px) 24px' }}>
      <Styles />
      <div style={{ maxWidth: 1200, marginInline: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'clamp(32px, 5vw, 72px)', alignItems: 'center' }}>
        <div>
          {eyebrow && <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 14, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: ACCENT }}><span style={{ width: 32, height: 2, background: 'currentColor' }} />{eyebrow}</p>}
          <h1 style={{ margin: '20px 0 0', fontFamily: SERIF, fontWeight: 500, fontSize: compact ? 'clamp(38px, 5.5vw, 68px)' : 'clamp(44px, 7vw, 92px)', lineHeight: 0.98, letterSpacing: '-0.035em', color: INK }}>
            {title}{highlight && <> <em style={{ fontStyle: 'italic', color: ACCENT }}>{highlight}</em></>}
          </h1>
          {subtitle && <p style={{ margin: '24px 0 0', maxWidth: '46ch', fontFamily: SANS, fontSize: 18, lineHeight: 1.7, color: MUTED }}>{subtitle}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32 }}>
            {ctaLabel && <a className="rs-btn" href={ctaHref || '#'} style={button(true)}>{ctaLabel}<span aria-hidden="true">→</span></a>}
            {ctaSecondLabel && <a className="rs-btn" href={ctaSecondHref || '#'} style={button(false)}>{ctaSecondLabel}</a>}
          </div>
        </div>
        <div aria-hidden="true" style={{ position: 'relative', aspectRatio: '1 / 1', width: '100%', maxWidth: compact ? 280 : 560, justifySelf: 'center' }}>
          <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}>
            <path d="M40 400V200a110 110 0 0 1 220 0v200z" fill="#B4411F" />
            <path d="M150 400V250a95 95 0 0 1 190 0v150z" fill="#1F1A17" />
            <circle cx="300" cy="104" r="62" fill="#E4D8C8" />
            <path d="M40 400V200a110 110 0 0 1 220 0" fill="none" stroke="#FAF7F2" strokeOpacity=".35" strokeWidth="2" transform="translate(-14 0) scale(1.1 1)" />
            <circle cx="95" cy="330" r="8" fill="#FAF7F2" />
            <circle cx="320" cy="330" r="30" fill="none" stroke="#B4411F" strokeWidth="2" />
            <circle cx="320" cy="330" r="14" fill="#B4411F" />
          </svg>
          {badge && <div style={{ position: 'absolute', left: '2%', bottom: '8%', padding: '12px 20px', borderRadius: 999, background: '#fff', color: INK, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '.06em', boxShadow: '0 14px 36px rgba(31,26,23,.16)' }}>{badge}</div>}
        </div>
      </div>
    </section>
  )
}

export const StoreHeroBlock = defineBlock({
  type: 'StoreHeroBlock',
  label: 'Portada de tienda editorial',
  category: 'atlas-ecommerce',
  defaultProps: { eyebrow: 'Colección de temporada', title: 'Objetos para vivir', highlight: 'con calma', subtitle: 'Piezas hechas con cuidado, materiales honestos y envío a todo el país.', ctaLabel: 'Comprar ahora', ctaHref: '/productos', ctaSecondLabel: 'Nuestra historia', ctaSecondHref: '/nosotros', badge: 'Envío gratis desde $999', size: 'full' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetitulo' }, title: { type: 'text', label: 'Titulo' }, highlight: { type: 'text', label: 'Palabra destacada' }, subtitle: { type: 'textarea', label: 'Descripcion' },
    ctaLabel: { type: 'text', label: 'Boton principal' }, ctaHref: { type: 'link', label: 'Enlace del boton principal' },
    ctaSecondLabel: { type: 'text', label: 'Boton secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace del boton secundario' },
    badge: { type: 'text', label: 'Etiqueta flotante' },
    size: { type: 'select', label: 'Tamaño', options: [{ value: 'full', label: 'Portada completa' }, { value: 'compact', label: 'Compacto' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'subtitle', 'badge', 'size'] },
    { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
  ],
  render: (props) => <StoreHero {...props} />,
})

const TILE_TONES = [
  { bg: '#B4411F', fg: '#FFFFFF', art: 'rgba(255,255,255,.22)' },
  { bg: '#E4D8C8', fg: '#1F1A17', art: 'rgba(31,26,23,.16)' },
  { bg: '#1F1A17', fg: '#FAF7F2', art: 'rgba(250,247,242,.2)' },
  { bg: '#566648', fg: '#FFFFFF', art: 'rgba(255,255,255,.22)' },
]

function TileArt({ kind, color }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2 }
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: 'absolute', right: -10, top: -10, width: '75%', height: '75%' }}>
      {kind === 0 && [90, 66, 42].map((r) => <path key={r} d={`M${110 - r} 200V${100}a${r} ${r} 0 0 1 ${r * 2} 0v100`} {...common} />)}
      {kind === 1 && [60, 42, 24].map((r) => <circle key={r} cx="110" cy="90" r={r} {...common} />)}
      {kind === 2 && Array.from({ length: 8 }).map((_, i) => <path key={i} d={`M${20 + i * 24} 200L${80 + i * 24} 0`} {...common} />)}
      {kind === 3 && Array.from({ length: 25 }).map((_, i) => <circle key={i} cx={30 + (i % 5) * 34} cy={30 + Math.floor(i / 5) * 34} r="4" fill={color} />)}
    </svg>
  )
}

function CollectionTiles({ eyebrow, title, tiles, linkLabel }) {
  const items = lines(tiles, 4)
  return (
    <section style={{ background: PAPER, padding: 'clamp(48px, 7vw, 96px) 24px' }}>
      <Styles />
      <div style={{ maxWidth: 1200, marginInline: 'auto' }}>
        {eyebrow && <p style={{ margin: 0, fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: ACCENT }}>{eyebrow}</p>}
        {title && <h2 style={{ margin: '12px 0 0', fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(32px, 4.4vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.02em', color: INK, maxWidth: '18ch' }}>{title}</h2>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 20, marginTop: 40 }}>
          {items.map(([name, text, href], i) => {
            const tone = TILE_TONES[i % TILE_TONES.length]
            return (
              <a key={name} className="rs-btn" href={href || '/productos'} style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 320, padding: 28, borderRadius: i % 2 ? '6px 6px 28px 28px' : '28px 28px 6px 6px', background: tone.bg, color: tone.fg, textDecoration: 'none' }}>
                <TileArt kind={i % 4} color={tone.art} />
                <span style={{ position: 'relative', fontFamily: SERIF, fontSize: 30, fontWeight: 500, lineHeight: 1.1 }}>{name}</span>
                {text && <span style={{ position: 'relative', marginTop: 8, fontFamily: SANS, fontSize: 15, lineHeight: 1.5 }}>{text}</span>}
                <span style={{ position: 'relative', marginTop: 16, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{linkLabel || 'Explorar'} <span aria-hidden="true">→</span></span>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const CollectionTilesBlock = defineBlock({
  type: 'CollectionTilesBlock',
  label: 'Colecciones ilustradas',
  category: 'atlas-ecommerce',
  defaultProps: { eyebrow: 'Colecciones', title: 'Encuentra tu próxima pieza favorita', tiles: 'Hogar|Texturas suaves y objetos que se quedan.|/productos\nModa|Cortes simples, telas nobles.|/productos\nPapelería|Para escribir despacio.|/productos\nRegalos|Detalles que sí se notan.|/productos', linkLabel: 'Explorar' },
  fields: {
    eyebrow: { type: 'text', label: 'Antetitulo' }, title: { type: 'text', label: 'Titulo' },
    tiles: { type: 'textarea', label: 'Colecciones (Nombre | Descripcion | Enlace, una por linea, max. 4)' },
    linkLabel: { type: 'text', label: 'Texto del enlace' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'tiles', 'linkLabel'] }],
  render: (props) => <CollectionTiles {...props} />,
})

const ICONS = [
  <><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  <><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></>,
  <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  <><path d="M4 5h16v11H9l-5 4z" /></>,
]

function TrustStrip({ items, tone }) {
  const rows = lines(items, 4)
  const dark = tone === 'dark'
  return (
    <section style={{ background: dark ? INK : '#fff', borderBlock: `1px solid ${LINE}`, padding: '28px 24px' }}>
      <ul style={{ listStyle: 'none', margin: '0 auto', padding: 0, maxWidth: 1200, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 24 }}>
        {rows.map(([name, detail], i) => (
          <li key={name} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={dark ? '#F0B79E' : ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>{ICONS[i % ICONS.length]}</svg>
            <div>
              <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, fontWeight: 700, color: dark ? PAPER : INK }}>{name}</p>
              {detail && <p style={{ margin: '2px 0 0', fontFamily: SANS, fontSize: 14, lineHeight: 1.4, color: dark ? 'rgba(250,247,242,.78)' : MUTED }}>{detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const TrustStripBlock = defineBlock({
  type: 'TrustStripBlock',
  label: 'Franja de confianza',
  category: 'atlas-ecommerce',
  defaultProps: { items: 'Envío a todo el país|Gratis desde $999\nDevolución en 30 días|Sin preguntas\nPago seguro|Tarjeta con cifrado\nAtención humana|Respondemos en el día', tone: 'light' },
  fields: {
    items: { type: 'textarea', label: 'Puntos (Titulo | Detalle, uno por linea, max. 4)' },
    tone: { type: 'select', label: 'Fondo', options: [{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }] },
  },
  groups: [{ label: 'Contenido', fields: ['items', 'tone'] }],
  render: (props) => <TrustStrip {...props} />,
})
