// Mercado template: live product carousel, promo tiles and the review carousel.
import { useEffect, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { fetchPublicCatalog, formatCatalogPrice, readAtlasConfig } from './catalogPublicClient.js'
import { addToCart } from './storeCart.js'
import { Base, CARD, GREEN, INK, Icon, LINE, MUTED, ON_GREEN, SALE, SANS, SERIF, Stars, h2, panel, rows, safeHref, safeImg, sectionPad, useInView, useRail } from './mercadoUi.jsx'

// ─── Product carousel ────────────────────────────────────────────────────────

// Shown only where no catalog is configured (editor, template preview) so the card design can be seen.
const SAMPLE = [
  ['Audífonos con cancelación de ruido', 'audio', 1599, 1999, 1234], ['Camisa casual de lino', 'moda', 599, 799, 812], ['Sérum de niacinamida', 'belleza', 339, 399, 645],
  ['Cafetera compacta', 'hogar', 969, 1389, 963], ['Mochila de viaje urbana', 'bolsa', 799, 999, 1108], ['Reloj minimalista', 'reloj', 1290, 1590, 540],
  ['Sillón de lectura', 'sofa', 4890, 5790, 211], ['Set de regalo', 'regalo', 449, 529, 387],
].map(([name, icon, price, was, reviews], i) => ({ id: `sample-${i}`, name, icon, price, was, reviews, currency: 'MXN', sample: true }))

const PICK_CSS = `.mk-pcard{transition:transform .3s cubic-bezier(.2,.7,.2,1),box-shadow .3s ease}.mk-pcard:hover{transform:translateY(-6px);box-shadow:0 18px 34px rgba(21,36,28,.12)}
.mk-pcard img,.mk-pcard .mk-pimg svg{transition:transform .5s cubic-bezier(.2,.7,.2,1)}.mk-pcard:hover img,.mk-pcard:hover .mk-pimg svg{transform:scale(1.06)}
.mk-add{transition:transform .2s ease,background .2s ease}.mk-add:hover:not(:disabled){transform:scale(1.1)}.mk-add[data-done="true"]{background:${SALE}!important}
.mk-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`

function PickCard({ product, detailHref, showRating }) {
  const [done, setDone] = useState(false)
  const href = product.sample ? undefined : `${detailHref || '/producto'}?p=${encodeURIComponent(product.slug || product.id)}`
  const out = product.track_stock && Number(product.stock) <= 0
  const off = product.was ? Math.round((1 - product.price / product.was) * 100) : 0
  const buy = () => {
    addToCart({ productId: product.id, name: product.name, slug: product.slug, price: product.price, currency: product.currency })
    setDone(true)
    setTimeout(() => setDone(false), 1600)
  }
  return (
    <article className="mk-pcard" style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, border: `1px solid ${LINE}`, background: CARD, overflow: 'hidden' }}>
      <a href={href} aria-label={product.name} className="mk-pimg" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1 / 0.9', background: '#F1F0EC', color: 'rgba(21,36,28,.28)', overflow: 'hidden' }}>
        {safeImg(product.image_url) ? <img src={product.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name={product.icon || 'bolsa'} size={84} stroke={1} />}
        {off > 0 && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 8px', borderRadius: 6, background: '#FBE3DD', color: SALE, fontFamily: SANS, fontSize: 12, fontWeight: 700 }}>-{off}%</span>}
        {out && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 8px', borderRadius: 6, background: INK, color: '#fff', fontFamily: SANS, fontSize: 12, fontWeight: 700 }}>Agotado</span>}
      </a>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 14px 16px', flex: 1 }}>
        <h3 className="mk-clamp" style={{ margin: 0, fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: INK, minHeight: '2.7em' }}>{href ? <a href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{product.name}</a> : product.name}</h3>
        {showRating && product.reviews ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12, color: MUTED }}><Stars value={5} size={12} />({product.reviews.toLocaleString('es-MX')})</span> : null}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>
            <strong style={{ fontSize: 17, color: product.was ? SALE : INK }}>{formatCatalogPrice(product.price, product.currency)}</strong>
            {product.was ? <s style={{ fontSize: 12, color: MUTED }}>{formatCatalogPrice(product.was, product.currency)}</s> : null}
          </p>
          <button type="button" className="mk-add" data-done={done} disabled={out || product.sample} onClick={buy} aria-label={done ? 'Agregado al carrito' : `Agregar ${product.name} al carrito`}
            style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, border: 0, background: GREEN, color: ON_GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: out ? 'not-allowed' : 'pointer', opacity: out ? 0.4 : 1 }}>
            <Icon name={done ? 'check' : 'cart'} size={18} stroke={2} />
          </button>
        </div>
      </div>
    </article>
  )
}

function MercadoPicks({ title, linkLabel, linkHref, categorySlug, limit, detailHref }) {
  const cfg = readAtlasConfig()
  const configured = Boolean(cfg?.apiUrl && cfg?.company)
  const [state, setState] = useState({ status: configured ? 'loading' : 'sample', products: [] })
  const [railRef, scroll] = useRail()
  const max = Number(limit) || 10

  useEffect(() => {
    if (!configured) return undefined
    let cancelled = false
    fetchPublicCatalog('products', { categorySlug, limit: max })
      .then((json) => { if (!cancelled) setState({ status: 'ready', products: json?.data ?? [] }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', products: [] }) })
    return () => { cancelled = true }
  }, [configured, categorySlug, max])

  const products = state.status === 'sample' ? SAMPLE.slice(0, max) : state.products
  return (
    <section className="mk" style={sectionPad}>
      <Base /><style>{PICK_CSS}</style>
      <div style={{ ...panel, padding: 'clamp(18px, 2.4vw, 28px)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <h2 style={{ ...h2, display: 'inline-flex', alignItems: 'center', gap: 10 }}>{title}<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="#E8B931"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg></h2>
          {linkLabel && <a className="mk-link" href={safeHref(linkHref)}>{linkLabel}<Icon name="arrow" size={16} stroke={2} /></a>}
        </div>
        {state.status === 'error' && <p role="alert" style={{ fontFamily: SANS, color: SALE }}>No se pudo cargar el catálogo. Intenta de nuevo en un momento.</p>}
        {state.status === 'ready' && products.length === 0 && <p style={{ fontFamily: SANS, color: MUTED, padding: '32px 0', textAlign: 'center' }}>Pronto tendremos productos aquí.</p>}
        <div ref={railRef} className="mk-rail" aria-busy={state.status === 'loading'} style={{ gridAutoColumns: 'clamp(180px, calc((100% - 64px) / 5), 260px)', gap: 16, padding: '4px 2px 12px' }}>
          {state.status === 'loading'
            ? Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 320, borderRadius: 16, background: '#F1F0EC' }} />)
            : products.map((p) => <PickCard key={p.id} product={p} detailHref={detailHref} showRating={p.sample} />)}
        </div>
        {products.length > 4 && (
          <>
            <button type="button" className="mk-round mk-arrow" aria-label="Productos anteriores" onClick={() => scroll(-1)} style={{ position: 'absolute', left: -10, top: '52%' }}><Icon name="left" size={20} stroke={2} /></button>
            <button type="button" className="mk-round mk-arrow" aria-label="Más productos" onClick={() => scroll(1)} style={{ position: 'absolute', right: -10, top: '52%' }}><Icon name="right" size={20} stroke={2} /></button>
          </>
        )}
      </div>
    </section>
  )
}

export const MercadoPicksBlock = defineBlock({
  type: 'MercadoPicksBlock',
  label: 'Mercado: carrusel de productos',
  category: 'atlas-ecommerce',
  defaultProps: { title: 'Elegidos para ti', linkLabel: 'Ver todas las ofertas', linkHref: '/productos', categorySlug: '', limit: '10', detailHref: '/producto' },
  fields: {
    title: { type: 'text', label: 'Título' },
    linkLabel: { type: 'text', label: 'Texto del enlace' }, linkHref: { type: 'link', label: 'Enlace' },
    categorySlug: { type: 'text', label: 'Categoría (slug, vacío = todas)' },
    limit: { type: 'select', label: 'Cantidad de productos', options: ['5', '10', '15', '20'] },
    detailHref: { type: 'link', label: 'Página de detalle' },
  },
  groups: [{ label: 'Contenido', fields: ['title', 'linkLabel', 'linkHref'] }, { label: 'Catálogo', fields: ['categorySlug', 'limit', 'detailHref'] }],
  render: (props) => <MercadoPicks {...props} />,
})

// ─── Promo tiles ─────────────────────────────────────────────────────────────

const TILE_TONES = [['#E3EBDD', 'bolsa'], ['#EFE3D3', 'sofa'], ['#DCE8F2', 'reloj']]
const TILE_CSS = `.mk-tile{transition:transform .3s cubic-bezier(.2,.7,.2,1),box-shadow .3s ease}.mk-tile:hover{transform:translateY(-4px);box-shadow:0 18px 34px rgba(21,36,28,.12)}
.mk-tile .mk-tile-art{transition:transform .6s cubic-bezier(.2,.7,.2,1)}.mk-tile:hover .mk-tile-art{transform:scale(1.08) rotate(-2deg)}.mk-tile:hover .mk-link svg{transform:translateX(4px)}`

function MercadoPromoTiles({ tiles, image1, image2, image3 }) {
  const [ref, inView] = useInView()
  const images = [image1, image2, image3]
  return (
    <section className="mk" style={sectionPad}>
      <Base /><style>{TILE_CSS}</style>
      <div ref={ref} data-in={inView} className="mk-stagger" style={{ maxWidth: 1280, marginInline: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
        {rows(tiles, 3).map(([eyebrow, title, cta, href], i) => {
          const [bg, icon] = TILE_TONES[i % TILE_TONES.length]
          const img = safeImg(images[i])
          return (
            <a key={title} className="mk-tile" href={safeHref(href)} style={{ position: 'relative', display: 'flex', minHeight: 180, borderRadius: 18, overflow: 'hidden', background: bg, textDecoration: 'none', color: INK }}>
              <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px, 2.4vw, 28px)', maxWidth: '58%', display: 'flex', flexDirection: 'column' }}>
                {eyebrow && <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: MUTED }}>{eyebrow}</span>}
                <span style={{ marginTop: 8, fontFamily: SERIF, fontSize: 'clamp(22px, 2vw, 28px)', lineHeight: 1.1, color: INK }}>{title}</span>
                {cta && <span className="mk-link" style={{ marginTop: 'auto', fontSize: 13 }}>{cta}<Icon name="arrow" size={16} stroke={2} /></span>}
              </div>
              <div className="mk-tile-art" aria-hidden="true" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: GREEN }}>
                {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Icon name={icon} size={110} stroke={0.9} style={{ opacity: 0.55 }} />}
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}

export const MercadoPromoTilesBlock = defineBlock({
  type: 'MercadoPromoTilesBlock',
  label: 'Mercado: tres promociones',
  category: 'atlas-ecommerce',
  defaultProps: {
    tiles: 'Novedades | Estilos frescos recién llegados | Comprar | /productos\nRenueva tu hogar | Haz de tu espacio algo mejor | Comprar | /productos\nTecnología esencial | Mejora tu estilo de vida | Comprar | /productos',
    image1: '', image2: '', image3: '',
  },
  fields: {
    tiles: { type: 'textarea', label: 'Promociones: Antetítulo | Título | Botón | /ruta (máximo 3)' },
    image1: { type: 'image', label: 'Imagen de la promoción 1' }, image2: { type: 'image', label: 'Imagen de la promoción 2' }, image3: { type: 'image', label: 'Imagen de la promoción 3' },
  },
  groups: [{ label: 'Contenido', fields: ['tiles', 'image1', 'image2', 'image3'] }],
  render: (props) => <MercadoPromoTiles {...props} />,
})

// ─── Reviews ─────────────────────────────────────────────────────────────────

const AVATARS = ['#E9D8C4', '#D7E6DC', '#E4DDF0', '#F3D9D3', '#D9E7F1']
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

function MercadoReviews({ title, score, scoreLabel, reviews }) {
  const [railRef, scroll] = useRail()
  const list = String(reviews ?? '').split('---').map((chunk) => chunk.split('\n').map((l) => l.trim()).filter(Boolean)).filter((l) => l.length)
    .slice(0, 9).map(([head, ...text]) => { const [name, stars] = head.split('|').map((p) => p.trim()); return { name, stars: Number(stars) || 5, text: text.join(' ') } })
  return (
    <section className="mk" style={sectionPad}>
      <Base />
      <div style={{ ...panel, padding: 'clamp(18px, 2.4vw, 28px)', position: 'relative' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <h2 style={{ ...h2, display: 'inline-flex', alignItems: 'center', gap: 10 }}>{title}<svg width="20" height="20" viewBox="0 0 24 24" fill="#EF7C74" aria-hidden="true"><path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z" /></svg></h2>
          {score && <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: SANS, fontSize: 14, color: INK }}><strong>{score}/5</strong> {scoreLabel}<Stars value={Math.round(Number(score) || 5)} size={18} /></p>}
        </div>
        <div ref={railRef} className="mk-rail" style={{ gridAutoColumns: 'clamp(260px, calc((100% - 32px) / 3), 420px)', gap: 16, padding: '2px 2px 8px' }}>
          {list.map((r, i) => (
            <figure key={r.name + i} style={{ margin: 0, display: 'flex', gap: 16, padding: 20, borderRadius: 16, border: `1px solid ${LINE}`, background: '#FBFAF7' }}>
              <span aria-hidden="true" style={{ flex: 'none', width: 56, height: 56, borderRadius: 999, background: AVATARS[i % AVATARS.length], color: GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>{initials(r.name)}</span>
              <div>
                <figcaption style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 15, fontWeight: 700, color: INK }}>{r.name}<span title="Compra verificada" style={{ display: 'inline-flex', width: 16, height: 16, borderRadius: 999, background: '#2F8F5B', color: '#fff', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={11} stroke={3} /></span></figcaption>
                <div style={{ marginTop: 4 }}><Stars value={r.stars} size={13} /></div>
                <blockquote style={{ margin: '10px 0 0', fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: MUTED }}>“{r.text}”</blockquote>
              </div>
            </figure>
          ))}
        </div>
        {list.length > 3 && (
          <>
            <button type="button" className="mk-round mk-arrow" aria-label="Reseñas anteriores" onClick={() => scroll(-1)} style={{ position: 'absolute', left: -10, top: '55%' }}><Icon name="left" size={20} stroke={2} /></button>
            <button type="button" className="mk-round mk-arrow" aria-label="Más reseñas" onClick={() => scroll(1)} style={{ position: 'absolute', right: -10, top: '55%' }}><Icon name="right" size={20} stroke={2} /></button>
          </>
        )}
      </div>
    </section>
  )
}

export const MercadoReviewsBlock = defineBlock({
  type: 'MercadoReviewsBlock',
  label: 'Mercado: reseñas en carrusel',
  category: 'atlas-ecommerce',
  defaultProps: {
    title: 'Nos recomiendan miles', score: '4.8', scoreLabel: 'calificación promedio',
    reviews: 'Sara J. | 5\nCalidad increíble y entrega rapidísima. Se volvió mi tienda de confianza para todo.\n---\nMiguel T. | 5\nBuenos precios, atención excelente y devoluciones muy sencillas. La recomiendo.\n---\nPriya K. | 5\nMe encanta la variedad: encuentro todo en un solo lugar. Súper práctico.\n---\nLaura M. | 5\nEl empaque llegó impecable y el producto tal cual la foto. Volveré a comprar.',
  },
  fields: {
    title: { type: 'text', label: 'Título' },
    score: { type: 'text', label: 'Calificación promedio (vacío la oculta)' }, scoreLabel: { type: 'text', label: 'Texto de la calificación' },
    reviews: { type: 'textarea', label: 'Reseñas: Nombre | estrellas, en la siguiente línea el texto; separadas por ---' },
  },
  groups: [{ label: 'Contenido', fields: ['title', 'score', 'scoreLabel', 'reviews'] }],
  render: (props) => <MercadoReviews {...props} />,
})
