// Product grid for the public catalog: search, category chips, add to cart. Without a configured site (editor, template
// preview) it draws placeholder cards with empty image slots so the layout can be designed.
import { useEffect, useState } from 'react'
import { fetchPublicCatalog, formatCatalogPrice, readAtlasConfig } from './catalogPublicClient.js'
import { addToCart } from './storeCart.js'
import { ACCENT, INK, LINE, MUTED, PAPER, SANS, SERIF, Styles, button } from './storeUi.jsx'

const SAMPLE = ['Camisa de lino', 'Bolsa de cuero', 'Vela de soya', 'Taza de barro', 'Cuaderno artesanal', 'Lámpara de mesa', 'Cojín tejido', 'Set de té'].map((name, i) => ({
  id: `sample-${i}`, name, slug: '', category_name: ['Ropa', 'Accesorios', 'Hogar', 'Hogar'][i % 4], price: 380 + i * 120, currency: 'MXN', sample: true,
}))

export function ImageSlot({ src, alt }) {
  return src
    ? <img src={src} alt={alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : (
      <svg viewBox="0 0 100 125" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <circle cx="50" cy="56" r="22" fill="none" stroke="rgba(31,26,23,.14)" strokeWidth=".6" />
        <circle cx="50" cy="56" r="34" fill="none" stroke="rgba(31,26,23,.08)" strokeWidth=".6" />
      </svg>
    )
}

function Card({ product, showPrice, showAddToCart, detailHref }) {
  const [added, setAdded] = useState(false)
  const href = product.sample ? undefined : `${detailHref || '/producto'}?p=${encodeURIComponent(product.slug || product.id)}`
  const buy = () => {
    addToCart({ productId: product.id, name: product.name, slug: product.slug, price: product.price, currency: product.currency })
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }
  const out = product.track_stock && Number(product.stock) <= 0
  return (
    <article className="rs-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <a href={href} aria-label={product.name} style={{ position: 'relative', display: 'block', aspectRatio: '4 / 5', borderRadius: '20px 20px 4px 4px', overflow: 'hidden', background: 'linear-gradient(160deg, #EFE7DB 0%, #E4D8C8 100%)', textDecoration: 'none' }}>
        <ImageSlot src={product.image_url} alt={product.name} />
        {out && <span style={{ position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 999, background: INK, color: PAPER, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Agotado</span>}
      </a>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
        <div style={{ minWidth: 0 }}>
          {product.category_name && <p style={{ margin: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: MUTED }}>{product.category_name}</p>}
          <h3 style={{ margin: '4px 0 0', fontFamily: SERIF, fontSize: 20, fontWeight: 500, lineHeight: 1.2, color: INK }}>{href ? <a href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{product.name}</a> : product.name}</h3>
        </div>
        {showPrice && <p style={{ margin: 0, fontFamily: SANS, fontSize: 16, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCatalogPrice(product.price, product.currency)}</p>}
      </div>
      {showAddToCart && (
        <button type="button" className="rs-btn" disabled={out || product.sample} onClick={buy} style={{ ...button(false), width: '100%', opacity: out ? 0.5 : 1 }}>
          {out ? 'Agotado' : added ? 'Agregado al carrito' : 'Agregar al carrito'}
        </button>
      )}
    </article>
  )
}

export default function ProductsGridRenderer({ categorySlug = '', limit = 8, columns = '4', showPrice = true, showSearch = false, showCategories = false, showAddToCart = false, detailHref = '/producto' }) {
  const [state, setState] = useState({ status: 'loading', products: [] })
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState('')
  const cfg = readAtlasConfig()
  const configured = Boolean(cfg?.apiUrl && cfg?.company)

  // Header search (?q=) and category links (?c=) land here already filtered.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (showSearch && params.get('q')) setSearch(params.get('q'))
    if (showCategories && params.get('c')) setChip(params.get('c'))
  }, [showSearch, showCategories])

  useEffect(() => {
    if (!showCategories || !configured) return
    fetchPublicCatalog('categories').then((json) => setCategories(json?.data ?? [])).catch(() => {})
  }, [showCategories, configured])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const activeSlug = chip || categorySlug
  useEffect(() => {
    if (!configured) { setState({ status: 'unconfigured', products: [] }); return undefined }
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    fetchPublicCatalog('products', { categorySlug: activeSlug, limit, search: query })
      .then((json) => { if (!cancelled) setState({ status: 'ready', products: json?.data ?? [] }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', products: [] }) })
    return () => { cancelled = true }
  }, [activeSlug, limit, query, configured])

  const cols = Math.max(1, Math.min(4, Number(columns) || 4))
  const sample = state.status === 'unconfigured' || (!configured && state.status === 'loading')
  const products = sample ? SAMPLE.slice(0, Math.max(1, Math.min(Number(limit) || 8, SAMPLE.length))) : state.products
  const gridStyle = { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cols >= 4 ? 230 : cols === 3 ? 290 : 380}px), 1fr))`, gap: '40px 24px' }
  const chips = [{ slug: '', name: 'Todo' }, ...(sample ? [{ slug: 'ropa', name: 'Ropa' }, { slug: 'hogar', name: 'Hogar' }, { slug: 'accesorios', name: 'Accesorios' }] : categories)]

  return (
    <section style={{ padding: 'clamp(40px, 6vw, 72px) 24px', background: PAPER }}>
      <Styles />
      <div style={{ maxWidth: 1200, marginInline: 'auto' }}>
        {(showSearch || showCategories) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36, paddingBottom: 20, borderBottom: `1px solid ${LINE}` }}>
            {showCategories && (
              <div role="group" aria-label="Categorías" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chips.map((c) => (
                  <button key={c.slug || 'all'} type="button" className="rs-chip" aria-pressed={chip === c.slug} onClick={() => setChip(c.slug)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: `1.5px solid ${chip === c.slug ? INK : LINE}`, background: chip === c.slug ? INK : 'transparent', color: chip === c.slug ? PAPER : INK, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{c.name}</button>
                ))}
              </div>
            )}
            {showSearch && (
              <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1.5px solid ${LINE}`, background: '#fff', minWidth: 'min(100%, 260px)' }}>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Buscar productos</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input className="rs-field" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar productos" style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontFamily: SANS, fontSize: 16, color: INK }} />
              </label>
            )}
          </div>
        )}
        {state.status === 'error' && <p role="alert" style={{ fontFamily: SANS, color: ACCENT }}>No se pudo cargar el catálogo. Intenta de nuevo en un momento.</p>}
        {state.status === 'ready' && products.length === 0 && <p style={{ fontFamily: SANS, color: MUTED, textAlign: 'center', padding: '48px 0' }}>No encontramos productos{query ? ` para "${query}"` : ''}.</p>}
        <div style={gridStyle} aria-busy={state.status === 'loading'}>
          {state.status === 'loading' && configured
            ? Array.from({ length: Math.min(Number(limit) || 8, cols * 2) }).map((_, i) => <div key={i} style={{ aspectRatio: '4 / 5', borderRadius: 20, background: '#EFE7DB' }} />)
            : products.map((p) => <Card key={p.id} product={p} showPrice={showPrice} showAddToCart={showAddToCart} detailHref={detailHref} />)}
        </div>
      </div>
    </section>
  )
}
