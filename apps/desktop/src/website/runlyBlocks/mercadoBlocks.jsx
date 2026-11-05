// Mercado template: header with live cart, hero slider and category circles.
import { useEffect, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { useCartLines } from './storeCart.js'
import { Base, CARD, GREEN, ICON_NAMES, INK, Icon, LINE, MUTED, ON_GREEN, PAPER, SALE, SANS, SERIF, h2, panel, rows, safeHref, safeImg, sectionPad, useInView } from './mercadoUi.jsx'

const ICON_HELP = `iconos: ${ICON_NAMES.join(', ')}`

// ─── Header ──────────────────────────────────────────────────────────────────

const HEADER_CSS = `.mk-head-link{position:relative;display:inline-flex;align-items:center;min-height:44px;color:${INK};font-family:${SANS};font-size:14px;font-weight:500;text-decoration:none}
.mk-head-link::after{content:'';position:absolute;left:0;right:0;bottom:6px;height:2px;background:${GREEN};transform:scaleX(0);transform-origin:left;transition:transform .25s ease}
.mk-head-link:hover::after,.mk-head-link[aria-current="page"]::after{transform:scaleX(1)}.mk-head-link[aria-current="page"]{font-weight:700}
.mk-tool{display:inline-flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;min-height:44px;justify-content:center;position:relative;color:${INK};font-family:${SANS};font-size:12px;text-decoration:none;transition:color .2s ease}
.mk-tool:hover{color:${GREEN}}.mk-tool:hover svg{transform:translateY(-2px)}.mk-tool svg{transition:transform .2s ease}
.mk-badge{position:absolute;top:-2px;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:${GREEN};color:${ON_GREEN};font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;animation:mk-bump .4s ease}
@keyframes mk-bump{0%{transform:scale(.4)}70%{transform:scale(1.2)}100%{transform:scale(1)}}
.mk-search{transition:box-shadow .2s ease,border-color .2s ease}.mk-search:focus-within{border-color:${GREEN};box-shadow:0 0 0 4px rgba(20,67,47,.12)}
.mk-ann-one{display:none}.mk-ann-one span{animation:mk-fade .5s ease}@keyframes mk-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mk-head .mk-burger{display:none}.mk-drawer{display:none}
@media (max-width:899px){.mk-ann-all{display:none!important}.mk-ann-one{display:flex}.mk-tool span.mk-tool-label,.mk-catbar,.mk-tagline{display:none!important}.mk-head .mk-burger{display:inline-flex}.mk-main{grid-template-columns:auto 1fr auto!important}.mk-main .mk-search{grid-column:1 / -1;order:3}
.mk-head[data-open="true"] .mk-drawer{display:flex}}`

function MercadoHeader({ announcements, brand, tagline, logoSrc, searchPlaceholder, searchHref, accountLabel, accountHref, wishlistLabel, wishlistHref, cartLabel, cartHref, allLabel, allHref, links, active, sticky }) {
  const notes = rows(announcements, 4).map(([text]) => text)
  const navLinks = rows(links, 10).map(([label, href]) => ({ label, href: safeHref(href) }))
  const count = useCartLines().reduce((sum, l) => sum + l.qty, 0)
  const [note, setNote] = useState(0)
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)
  const logo = safeImg(logoSrc)

  useEffect(() => {
    if (notes.length < 2) return undefined
    const t = setInterval(() => setNote((n) => (n + 1) % notes.length), 4000)
    return () => clearInterval(t)
  }, [notes.length])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const current = (href) => (active && href === active ? 'page' : undefined)
  return (
    <header className="mk mk-head" data-open={open} style={{ position: sticky ? 'sticky' : 'relative', top: 0, zIndex: 40, background: PAPER, boxShadow: '0 1px 0 ' + LINE }}>
      <Base /><style>{HEADER_CSS}</style>
      {notes.length > 0 && (
        <div style={{ background: GREEN, color: ON_GREEN, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>
          <div className="mk-ann-all" style={{ maxWidth: 1280, marginInline: 'auto', minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '0 24px' }}>
            {notes.map((text, i) => <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 28 }}>{i > 0 && <span aria-hidden="true" style={{ opacity: 0.4 }}>|</span>}{text}</span>)}
          </div>
          <div className="mk-ann-one" aria-live="polite" style={{ minHeight: 38, alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center' }}><span key={note}>{notes[note % notes.length]}</span></div>
        </div>
      )}
      <div className="mk-main" style={{ maxWidth: 1280, marginInline: 'auto', padding: '14px clamp(16px, 3vw, 24px)', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 'clamp(12px, 3vw, 40px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button ref={toggleRef} type="button" className="mk-burger mk-round" aria-expanded={open} aria-controls="mk-drawer" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen((v) => !v)} style={{ boxShadow: 'none' }}><Icon name={open ? 'close' : 'menu'} /></button>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: GREEN }}>
            {logo ? <img src={logo} alt={brand} style={{ height: 44, width: 'auto', display: 'block' }} /> : (
              <>
                <span style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${GREEN}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="hoja" size={24} stroke={1.8} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, letterSpacing: '.04em' }}>{brand}</span>
                  {tagline && <span className="mk-tagline" style={{ marginTop: 4, fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', color: MUTED }}>{tagline}</span>}
                </span>
              </>
            )}
          </a>
        </div>
        <form className="mk-search" role="search" action={safeHref(searchHref || '/productos')} method="get" style={{ display: 'flex', alignItems: 'center', minHeight: 48, maxWidth: 520, width: '100%', justifySelf: 'center', borderRadius: 999, border: `1px solid ${LINE}`, background: CARD, padding: '4px 4px 4px 20px' }}>
          <label style={{ flex: 1, display: 'flex' }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{searchPlaceholder}</span>
            <input type="search" name="q" placeholder={searchPlaceholder} style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontFamily: SANS, fontSize: 15, color: INK }} />
          </label>
          <button type="submit" aria-label="Buscar" style={{ width: 52, height: 40, borderRadius: 999, border: 0, background: GREEN, color: ON_GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="search" size={20} stroke={2} /></button>
        </form>
        <nav aria-label="Cuenta" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px, 1.5vw, 20px)' }}>
          {accountLabel && <a className="mk-tool" href={safeHref(accountHref)}><Icon name="user" /><span className="mk-tool-label">{accountLabel}</span></a>}
          {wishlistLabel && <a className="mk-tool" href={safeHref(wishlistHref)}><Icon name="heart" /><span className="mk-tool-label">{wishlistLabel}</span></a>}
          <a className="mk-tool" href={safeHref(cartHref || '/carrito')} aria-label={count ? `${cartLabel}, ${count} artículos` : cartLabel}>
            <Icon name="cart" /><span className="mk-tool-label">{cartLabel}</span>
            {count > 0 && <span key={count} className="mk-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
          </a>
        </nav>
      </div>
      <nav aria-label="Categorías" className="mk-catbar" style={{ maxWidth: 1280, marginInline: 'auto', padding: '0 clamp(16px, 3vw, 24px) 12px', display: 'flex', alignItems: 'center', gap: 32 }}>
        {allLabel && <a href={safeHref(allHref)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 22px', borderRadius: 10, background: GREEN, color: ON_GREEN, fontFamily: SANS, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}><Icon name="menu" size={18} />{allLabel}</a>}
        {navLinks.map((l) => <a key={l.label} className="mk-head-link" href={l.href} aria-current={current(l.href)}>{l.label}</a>)}
      </nav>
      <nav id="mk-drawer" aria-label="Menú" className="mk-drawer" style={{ flexDirection: 'column', padding: '4px 20px 16px', borderTop: `1px solid ${LINE}`, background: PAPER }}>
        {allLabel && <a className="mk-head-link" href={safeHref(allHref)}>{allLabel}</a>}
        {navLinks.map((l) => <a key={l.label} className="mk-head-link" href={l.href} aria-current={current(l.href)}>{l.label}</a>)}
      </nav>
    </header>
  )
}

export const MercadoHeaderBlock = defineBlock({
  type: 'MercadoHeaderBlock',
  label: 'Mercado: cabecera con buscador y carrito',
  category: 'atlas-ecommerce',
  defaultProps: {
    announcements: 'Envío gratis en compras desde $999\nDevoluciones fáciles en 30 días\nPagos 100% seguros',
    brand: 'Brote', tagline: 'Vive mejor', logoSrc: '', searchPlaceholder: 'Busca productos, marcas y más...', searchHref: '/productos',
    accountLabel: 'Mi cuenta', accountHref: '/cuenta', wishlistLabel: 'Favoritos', wishlistHref: '/productos', cartLabel: 'Carrito', cartHref: '/carrito',
    allLabel: 'Todas las categorías', allHref: '/productos',
    links: 'Inicio | /\nTienda | /productos\nOfertas | /productos\nNovedades | /productos\nNosotros | /nosotros\nContacto | /contacto',
    active: '/', sticky: true,
  },
  fields: {
    announcements: { type: 'textarea', label: 'Avisos de la barra superior (uno por línea)' },
    brand: { type: 'text', label: 'Nombre de marca' }, tagline: { type: 'text', label: 'Lema bajo la marca' }, logoSrc: { type: 'image', label: 'Logotipo (opcional)' },
    searchPlaceholder: { type: 'text', label: 'Texto del buscador' }, searchHref: { type: 'link', label: 'Página de resultados' },
    accountLabel: { type: 'text', label: 'Texto de cuenta (vacío lo oculta)' }, accountHref: { type: 'link', label: 'Enlace de cuenta' },
    wishlistLabel: { type: 'text', label: 'Texto de favoritos (vacío lo oculta)' }, wishlistHref: { type: 'link', label: 'Enlace de favoritos' },
    cartLabel: { type: 'text', label: 'Texto del carrito' }, cartHref: { type: 'link', label: 'Enlace del carrito' },
    allLabel: { type: 'text', label: 'Botón de categorías' }, allHref: { type: 'link', label: 'Enlace del botón de categorías' },
    links: { type: 'textarea', label: 'Menú: Etiqueta | /ruta (uno por línea)' },
    active: { type: 'text', label: 'Ruta resaltada en el menú' },
    sticky: { type: 'toggle', label: 'Fija al hacer scroll' },
  },
  groups: [
    { label: 'Marca', fields: ['brand', 'tagline', 'logoSrc', 'announcements'] },
    { label: 'Buscador y cuenta', fields: ['searchPlaceholder', 'searchHref', 'accountLabel', 'accountHref', 'wishlistLabel', 'wishlistHref', 'cartLabel', 'cartHref'] },
    { label: 'Menú', fields: ['allLabel', 'allHref', 'links', 'active', 'sticky'] },
  ],
  render: (props) => <MercadoHeader {...props} />,
})

// ─── Hero slider ─────────────────────────────────────────────────────────────

const HERO_CSS = `.mk-slide{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .9s ease,visibility 0s linear .9s}
.mk-slide[data-on="true"]{opacity:1;visibility:visible;transition:opacity .9s ease}
.mk-slide[data-on="true"] .mk-kb{animation:mk-kb var(--mk-int,6s) ease-out both}@keyframes mk-kb{from{transform:scale(1)}to{transform:scale(1.07)}}
.mk-slide[data-on="true"] .mk-copy>*{animation:mk-rise .8s cubic-bezier(.2,.7,.2,1) both}.mk-slide[data-on="true"] .mk-copy>*:nth-child(2){animation-delay:.12s}.mk-slide[data-on="true"] .mk-copy>*:nth-child(3){animation-delay:.24s}
.mk-seal{animation:mk-float 5s ease-in-out infinite}@keyframes mk-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.mk-cta{transition:transform .2s ease,box-shadow .2s ease}.mk-cta:hover{transform:translateY(-2px);box-shadow:0 12px 24px rgba(20,67,47,.28)}.mk-cta:hover svg{transform:translateX(4px)}.mk-cta svg{transition:transform .2s ease}
.mk-dot{width:10px;height:10px;border-radius:999px;border:0;padding:0;background:rgba(21,36,28,.25);cursor:pointer;transition:width .3s ease,background .3s ease}.mk-dot[aria-current="true"]{width:28px;background:${GREEN}}
@media (max-width:767px){.mk-hero-box{min-height:600px!important}.mk-hero-art{opacity:.35}.mk-copy{padding-top:150px!important}.mk-seal{animation:none}}`

function StillLife() {
  return (
    <svg className="mk-kb mk-hero-art" viewBox="0 0 600 420" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: '68%', height: '100%' }}>
      <ellipse cx="380" cy="400" rx="230" ry="16" fill="rgba(21,36,28,.08)" />
      <g fill="#2F6B4A"><path d="M140 60c60-40 140 0 150 80-60 30-140 10-150-80z" /><path d="M120 120c30-70 120-80 160-20-40 60-120 70-160 20z" opacity=".85" /></g>
      <path d="M210 80 280 300" stroke="#1F4A33" strokeWidth="4" />
      <rect x="320" y="110" width="170" height="250" rx="22" fill="#7FA48D" /><rect x="380" y="70" width="50" height="44" rx="10" fill="none" stroke="#4E6F5C" strokeWidth="8" />
      {[350, 385, 420, 455].map((x) => <path key={x} d={`M${x} 130v210`} stroke="#6A8F78" strokeWidth="6" strokeLinecap="round" />)}
      <rect x="470" y="210" width="56" height="150" rx="14" fill="#2A2420" /><rect x="482" y="180" width="32" height="34" rx="6" fill="#1A1714" /><rect x="476" y="255" width="44" height="40" rx="4" fill="#EFE6D6" />
      <path d="M180 360c0-30 20-50 60-50h70c20 0 40 20 40 50z" fill="#FBFAF7" stroke="#D8D2C4" strokeWidth="3" />
      <circle cx="300" cy="360" r="28" fill="#1C2A23" /><circle cx="300" cy="360" r="20" fill="#2F4A3C" stroke="#C9B48A" strokeWidth="3" />
      <rect x="60" y="290" width="120" height="80" rx="12" fill="#C8B796" /><rect x="74" y="304" width="92" height="30" rx="4" fill="#A88F64" />
    </svg>
  )
}

function MercadoHero({ slides, image1, image2, image3, sealTop, sealValue, sealBottom, trust, autoplay, interval }) {
  const list = rows(slides, 3).map(([title, text, cta, href], i) => ({ title, text, cta, href: safeHref(href), img: safeImg([image1, image2, image3][i]) }))
  const trustItems = rows(trust, 4)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const ms = Number(interval) || 6000

  useEffect(() => {
    if (!autoplay || paused || userPaused || list.length < 2) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const t = setTimeout(() => setIndex((i) => (i + 1) % list.length), ms)
    return () => clearTimeout(t)
  }, [autoplay, paused, userPaused, index, list.length, ms])

  return (
    <section className="mk" style={sectionPad} aria-roledescription="carrusel" aria-label="Destacados">
      <Base /><style>{HERO_CSS}</style>
      <div className="mk-hero-box" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
        style={{ '--mk-int': `${ms}ms`, position: 'relative', maxWidth: 1280, marginInline: 'auto', minHeight: 'clamp(440px, 44vw, 560px)', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(120deg, #F1ECE2 0%, #E7DECD 100%)', boxShadow: '0 18px 40px rgba(21,36,28,.08)' }}>
        {list.map((s, i) => (
          <div key={i} className="mk-slide" data-on={i === index} aria-hidden={i !== index} role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${list.length}`}>
            {s.img
              ? <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><img className="mk-kb" src={s.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(241,236,226,.96) 0%, rgba(241,236,226,.75) 38%, rgba(241,236,226,0) 62%)' }} /></div>
              : <StillLife />}
            <div className="mk-copy" style={{ position: 'relative', zIndex: 1, maxWidth: 520, padding: 'clamp(32px, 6vw, 72px) clamp(24px, 4vw, 56px)' }}>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(38px, 5.4vw, 66px)', lineHeight: 1.04, letterSpacing: '-0.02em', color: INK }}>{s.title}</h1>
              {s.text ? <p style={{ margin: '20px 0 0', maxWidth: '40ch', fontFamily: SANS, fontSize: 17, lineHeight: 1.6, color: MUTED }}>{s.text}</p> : <span />}
              {s.cta ? <a className="mk-cta" href={s.href} tabIndex={i === index ? 0 : -1} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 28, minHeight: 48, padding: '0 26px', borderRadius: 12, background: GREEN, color: ON_GREEN, fontFamily: SANS, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>{s.cta}<Icon name="arrow" size={18} stroke={2} /></a> : <span />}
            </div>
          </div>
        ))}
        {sealValue && (
          <div className="mk-seal" style={{ position: 'absolute', top: 0, right: 'clamp(16px, 6vw, 72px)', zIndex: 2, padding: '18px 18px 20px', background: GREEN, color: ON_GREEN, borderRadius: '0 0 6px 6px', textAlign: 'center', fontFamily: SANS, boxShadow: '0 14px 30px rgba(20,67,47,.3)' }}>
            {sealTop && <div style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: '.06em', maxWidth: '9ch', marginInline: 'auto' }}>{sealTop}</div>}
            <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, lineHeight: 1, marginTop: 8, color: '#E9D8A6' }}>{sealValue}</div>
            {sealBottom && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 4 }}>{sealBottom}</div>}
          </div>
        )}
        <div style={{ position: 'absolute', left: 'clamp(24px, 4vw, 56px)', right: 24, bottom: 24, zIndex: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 'clamp(12px, 2.4vw, 28px)' }}>
            {trustItems.map(([icon, label]) => <li key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: INK }}><Icon name={icon} size={22} />{label}</li>)}
          </ul>
          {list.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {list.map((_, i) => <button key={i} type="button" className="mk-dot" aria-label={`Ir a la diapositiva ${i + 1}`} aria-current={i === index} onClick={() => setIndex(i)} />)}
              {autoplay && <button type="button" className="mk-round" onClick={() => setUserPaused((v) => !v)} aria-label={userPaused ? 'Reanudar carrusel' : 'Pausar carrusel'} style={{ width: 36, height: 36, marginLeft: 6 }}><Icon name={userPaused ? 'play' : 'pause'} size={16} stroke={2} /></button>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export const MercadoHeroBlock = defineBlock({
  type: 'MercadoHeroBlock',
  label: 'Mercado: portada en carrusel',
  category: 'atlas-ecommerce',
  defaultProps: {
    slides: 'Eleva tu día a día | Productos de calidad en todas las categorías, pensados para tu forma de vivir. | Comprar ahora | /productos\nTu casa, renovada | Textiles, iluminación y piezas que hacen hogar. | Ver hogar | /productos\nTecnología que acompaña | Audio, relojes y accesorios para todos los días. | Ver tecnología | /productos',
    image1: '', image2: '', image3: '',
    sealTop: 'Rebajas de verano', sealValue: '40%', sealBottom: 'de descuento',
    trust: 'escudo | Calidad garantizada\netiqueta | Precios justos\nclientes | Más de 10 mil clientes',
    autoplay: true, interval: '6000',
  },
  fields: {
    slides: { type: 'textarea', label: 'Diapositivas: Título | Texto | Botón | /ruta (una por línea, máximo 3)' },
    image1: { type: 'image', label: 'Imagen de la diapositiva 1' }, image2: { type: 'image', label: 'Imagen de la diapositiva 2' }, image3: { type: 'image', label: 'Imagen de la diapositiva 3' },
    sealTop: { type: 'text', label: 'Sello: texto superior' }, sealValue: { type: 'text', label: 'Sello: cifra (vacío lo oculta)' }, sealBottom: { type: 'text', label: 'Sello: texto inferior' },
    trust: { type: 'textarea', label: `Garantías: icono | texto (${ICON_HELP})` },
    autoplay: { type: 'toggle', label: 'Avance automático' },
    interval: { type: 'select', label: 'Tiempo por diapositiva', options: [{ value: '4000', label: '4 segundos' }, { value: '6000', label: '6 segundos' }, { value: '8000', label: '8 segundos' }] },
  },
  groups: [
    { label: 'Diapositivas', fields: ['slides', 'image1', 'image2', 'image3', 'autoplay', 'interval'] },
    { label: 'Sello y garantías', fields: ['sealTop', 'sealValue', 'sealBottom', 'trust'] },
  ],
  render: (props) => <MercadoHero {...props} />,
})

// ─── Category circles ────────────────────────────────────────────────────────

const TINTS = ['#E3EEF7', '#F9E4E1', '#FBEBD9', '#F7E3EA', '#E1EEF8', '#F8E6DC', '#ECE6F5', '#F3E9DA']
const CAT_CSS = `.mk-cat{display:flex;flex-direction:column;align-items:center;gap:12px;padding:6px 4px;text-decoration:none;color:${INK};font-family:${SANS};font-size:13px;font-weight:600;text-align:center}
.mk-cat-ring{width:clamp(64px,7vw,78px);height:clamp(64px,7vw,78px);border-radius:999px;display:flex;align-items:center;justify-content:center;border:4px solid #fff;box-shadow:0 6px 16px rgba(21,36,28,.1);transition:transform .3s cubic-bezier(.2,.7,.2,1),box-shadow .3s ease}
.mk-cat:hover .mk-cat-ring{transform:translateY(-6px);box-shadow:0 14px 26px rgba(21,36,28,.16)}.mk-cat:hover svg{animation:mk-wiggle .5s ease}
@keyframes mk-wiggle{0%,100%{transform:rotate(0)}30%{transform:rotate(-10deg)}60%{transform:rotate(8deg)}}`

function MercadoCategories({ title, items }) {
  const [ref, inView] = useInView()
  const list = rows(items, 10)
  return (
    <section className="mk" style={sectionPad}>
      <Base /><style>{CAT_CSS}</style>
      <div style={{ ...panel, padding: 'clamp(18px, 2.4vw, 28px)' }}>
        {title && <h2 style={{ ...h2, marginBottom: 18 }}>{title}</h2>}
        <div ref={ref} data-in={inView} className="mk-stagger mk-rail" style={{ gridAutoColumns: 'minmax(96px, 1fr)', gap: 8 }}>
          {list.map(([name, icon, href], i) => (
            <a key={name} className="mk-cat" href={safeHref(href)}>
              <span className="mk-cat-ring" style={{ background: icon === 'todo' ? '#fff' : TINTS[i % TINTS.length] }}><Icon name={icon} size={30} stroke={1.5} /></span>
              {name}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

export const MercadoCategoriesBlock = defineBlock({
  type: 'MercadoCategoriesBlock',
  label: 'Mercado: categorías con íconos',
  category: 'atlas-ecommerce',
  defaultProps: {
    title: '',
    items: 'Electrónica | tv | /productos?c=electronica\nModa | moda | /productos?c=moda\nHogar | hogar | /productos?c=hogar\nBelleza | belleza | /productos?c=belleza\nDeportes | deporte | /productos?c=deportes\nJuguetes | juguetes | /productos?c=juguetes\nLibros | libros | /productos?c=libros\nMascotas | mascotas | /productos?c=mascotas\nVer todo | todo | /productos',
  },
  fields: {
    title: { type: 'text', label: 'Título (opcional)' },
    items: { type: 'textarea', label: `Categorías: Nombre | icono | /ruta (${ICON_HELP})` },
  },
  groups: [{ label: 'Contenido', fields: ['title', 'items'] }],
  render: (props) => <MercadoCategories {...props} />,
})
