// Product detail and cart page blocks. Both run in the visitor's browser against the public catalog and checkout endpoints.
import { useEffect, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { fetchPublicCatalog, formatCatalogPrice, readAtlasConfig } from './catalogPublicClient.js'
import { ImageSlot } from './ProductsGridRenderer.jsx'
import { addToCart, clearCart, removeLine, setQty, startCheckout, useCartLines } from './storeCart.js'
import { ACCENT, INK, LINE, MUTED, PAPER, SANS, SERIF, Styles, button } from './storeUi.jsx'

const SAMPLE_PRODUCT = { id: 'sample', name: 'Camisa de lino lavado', category_name: 'Ropa', price: 890, currency: 'MXN', description: 'Corte holgado, lino lavado a la piedra y botones de coco. Suave desde el primer uso.', sample: true }
const wrap = { maxWidth: 1100, marginInline: 'auto' }
const section = { padding: 'clamp(40px, 6vw, 80px) 24px', background: PAPER }
const variantLabel = (v) => Object.values(v?.option_values ?? {}).join(' / ') || v?.sku || 'Opción'

function ProductDetail({ backHref, cartHref, addLabel }) {
  const [state, setState] = useState(() => (readAtlasConfig()?.apiUrl ? { status: 'loading', product: null } : { status: 'sample', product: SAMPLE_PRODUCT }))
  const [variantId, setVariantId] = useState('')
  const [qty, setQty2] = useState(1)
  const [added, setAdded] = useState(false)
  const cfg = readAtlasConfig()
  const configured = Boolean(cfg?.apiUrl && cfg?.company)

  useEffect(() => {
    if (!configured) { setState({ status: 'sample', product: SAMPLE_PRODUCT }); return undefined }
    const slug = new URLSearchParams(window.location.search).get('p')
    if (!slug) { setState({ status: 'missing', product: null }); return undefined }
    let cancelled = false
    fetchPublicCatalog(`products/${encodeURIComponent(slug)}`)
      .then((json) => { if (!cancelled) { setState({ status: json?.data ? 'ready' : 'missing', product: json?.data ?? null }); setVariantId(json?.data?.variants?.[0]?.id ?? '') } })
      .catch(() => { if (!cancelled) setState({ status: 'missing', product: null }) })
    return () => { cancelled = true }
  }, [configured])

  const { product } = state
  if (state.status === 'loading') return <section style={section}><div style={{ ...wrap, aspectRatio: '16 / 9', borderRadius: 20, background: '#EFE7DB' }} aria-busy="true" /></section>
  if (!product) {
    return (
      <section style={section}><div style={{ ...wrap, textAlign: 'center', padding: '64px 0' }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 36, color: INK, margin: 0 }}>Producto no disponible</h1>
        <p style={{ fontFamily: SANS, color: MUTED }}>Puede que ya no esté publicado.</p>
        <a className="rs-btn" href={backHref || '/productos'} style={button(true)}>Ver todos los productos</a>
      </div></section>
    )
  }
  const variant = product.variants?.find((v) => v.id === variantId)
  const price = variant?.price ?? product.price
  const out = product.track_stock && Number(variant?.stock ?? product.stock) <= 0
  const buy = () => {
    addToCart({ productId: product.id, variantId: variant?.id, variantLabel: variant ? variantLabel(variant) : '', name: product.name, slug: product.slug, price, currency: product.currency }, qty)
    setAdded(true)
  }
  return (
    <section style={section}>
      <Styles />
      <div style={{ ...wrap, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(28px, 5vw, 72px)' }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: '28px 28px 6px 6px', overflow: 'hidden', background: 'linear-gradient(160deg, #EFE7DB 0%, #E4D8C8 100%)' }}>
          <ImageSlot src={product.image_url} alt={product.name} />
        </div>
        <div style={{ alignSelf: 'center' }}>
          <a href={backHref || '/productos'} style={{ fontFamily: SANS, fontSize: 14, color: MUTED, display: 'inline-block', minHeight: 44, lineHeight: '44px' }}>← Volver a la tienda</a>
          {product.category_name && <p style={{ margin: '8px 0 0', fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: ACCENT }}>{product.category_name}</p>}
          <h1 style={{ margin: '10px 0 0', fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(34px, 4.6vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.02em', color: INK }}>{product.name}</h1>
          <p style={{ margin: '18px 0 0', fontFamily: SANS, fontSize: 24, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCatalogPrice(price, product.currency)}</p>
          {product.description && <p style={{ margin: '18px 0 0', maxWidth: '52ch', fontFamily: SANS, fontSize: 17, lineHeight: 1.7, color: MUTED }}>{product.description}</p>}
          {product.variants?.length > 0 && (
            <fieldset style={{ margin: '24px 0 0', padding: 0, border: 0 }}>
              <legend style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: INK, marginBottom: 10 }}>Opción</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {product.variants.map((v) => (
                  <button key={v.id} type="button" className="rs-chip" aria-pressed={v.id === variantId} onClick={() => setVariantId(v.id)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: `1.5px solid ${v.id === variantId ? INK : LINE}`, background: v.id === variantId ? INK : 'transparent', color: v.id === variantId ? PAPER : INK, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{variantLabel(v)}</button>
                ))}
              </div>
            </fieldset>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 28 }}>
            <div role="group" aria-label="Cantidad" style={{ display: 'inline-flex', alignItems: 'center', border: `1.5px solid ${LINE}`, borderRadius: 999 }}>
              <button type="button" className="rs-chip" aria-label="Menos" onClick={() => setQty2(Math.max(1, qty - 1))} style={{ width: 44, height: 44, border: 0, background: 'transparent', fontSize: 20, color: INK, cursor: 'pointer' }}>−</button>
              <output aria-live="polite" style={{ minWidth: 28, textAlign: 'center', fontFamily: SANS, fontWeight: 700, color: INK }}>{qty}</output>
              <button type="button" className="rs-chip" aria-label="Más" onClick={() => setQty2(Math.min(99, qty + 1))} style={{ width: 44, height: 44, border: 0, background: 'transparent', fontSize: 20, color: INK, cursor: 'pointer' }}>+</button>
            </div>
            <button type="button" className="rs-btn" disabled={out || product.sample} onClick={buy} style={{ ...button(true), flex: '1 1 200px', opacity: out ? 0.5 : 1 }}>{out ? 'Agotado' : addLabel || 'Agregar al carrito'}</button>
          </div>
          <p role="status" style={{ minHeight: 24, margin: '14px 0 0', fontFamily: SANS, fontSize: 15, color: INK }}>
            {added && <>Agregado. <a href={cartHref || '/carrito'} style={{ color: ACCENT, fontWeight: 700 }}>Ver carrito</a></>}
          </p>
        </div>
      </div>
    </section>
  )
}

export const ProductDetailBlock = defineBlock({
  type: 'ProductDetailBlock',
  label: 'Detalle de producto',
  category: 'atlas-ecommerce',
  defaultProps: { addLabel: 'Agregar al carrito', backHref: '/productos', cartHref: '/carrito' },
  fields: {
    addLabel: { type: 'text', label: 'Texto del boton' },
    backHref: { type: 'link', label: 'Enlace "volver a la tienda"' },
    cartHref: { type: 'link', label: 'Enlace al carrito' },
  },
  groups: [{ label: 'Contenido', fields: ['addLabel', 'backHref', 'cartHref'] }],
  render: (props) => <ProductDetail {...props} />,
})

const SAMPLE_LINES = [{ productId: 's1', name: 'Camisa de lino lavado', price: 890, currency: 'MXN', qty: 1, variantLabel: 'M' }, { productId: 's2', name: 'Vela de soya', price: 320, currency: 'MXN', qty: 2 }]

function CartPage({ mode, checkoutLabel, shopHref, promoNote }) {
  const live = useCartLines()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const preview = !readAtlasConfig()?.apiUrl
  const lines = preview ? SAMPLE_LINES : live

  useEffect(() => { if (mode === 'thanks' && !preview) clearCart() }, [mode, preview])

  if (mode === 'thanks') {
    return (
      <section style={section}><div style={{ ...wrap, maxWidth: 640, textAlign: 'center', padding: '48px 0' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m7.5 12.5 3 3 6-7" /></svg>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(34px, 5vw, 56px)', color: INK, margin: '16px 0 0' }}>Gracias por tu compra</h1>
        <p style={{ fontFamily: SANS, fontSize: 17, lineHeight: 1.7, color: MUTED }}>Recibimos tu pedido y te enviaremos la confirmación por correo.</p>
        <a className="rs-btn" href={shopHref || '/productos'} style={{ ...button(true), marginTop: 12 }}>Seguir comprando</a>
      </div></section>
    )
  }
  const currency = lines[0]?.currency
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const pay = async () => {
    setBusy(true); setError('')
    try { await startCheckout(lines) } catch (e) { setError(e.message === 'config-missing' ? 'La tienda aún no tiene el pago configurado.' : e.message || 'No se pudo iniciar el pago.'); setBusy(false) }
  }
  if (lines.length === 0) {
    return (
      <section style={section}><div style={{ ...wrap, textAlign: 'center', padding: '64px 0' }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 40, color: INK, margin: 0 }}>Tu carrito está vacío</h1>
        <p style={{ fontFamily: SANS, color: MUTED }}>Agrega algo que te guste y vuelve aquí para pagar.</p>
        <a className="rs-btn" href={shopHref || '/productos'} style={button(true)}>Explorar la tienda</a>
      </div></section>
    )
  }
  return (
    <section style={section}>
      <Styles />
      <div style={{ ...wrap, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(28px, 5vw, 64px)', alignItems: 'start' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, gridColumn: 'span 1' }}>
          {lines.map((l) => (
            <li key={`${l.productId}-${l.variantId}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr auto', gap: 16, alignItems: 'center', padding: '18px 0', borderBottom: `1px solid ${LINE}` }}>
              <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(160deg, #EFE7DB, #E4D8C8)' }}><ImageSlot src="" alt="" /></div>
              <div>
                <p style={{ margin: 0, fontFamily: SERIF, fontSize: 19, color: INK }}>{l.name}</p>
                {l.variantLabel && <p style={{ margin: '2px 0 0', fontFamily: SANS, fontSize: 13, color: MUTED }}>{l.variantLabel}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <button type="button" className="rs-chip" aria-label={`Menos ${l.name}`} onClick={() => setQty(l, l.qty - 1)} style={{ width: 44, height: 44, borderRadius: 999, border: `1.5px solid ${LINE}`, background: 'transparent', color: INK, cursor: 'pointer' }}>−</button>
                  <span style={{ minWidth: 28, textAlign: 'center', fontFamily: SANS, fontWeight: 700, color: INK }}>{l.qty}</span>
                  <button type="button" className="rs-chip" aria-label={`Más ${l.name}`} onClick={() => setQty(l, l.qty + 1)} style={{ width: 44, height: 44, borderRadius: 999, border: `1.5px solid ${LINE}`, background: 'transparent', color: INK, cursor: 'pointer' }}>+</button>
                  <button type="button" className="rs-chip" onClick={() => removeLine(l)} style={{ minHeight: 44, padding: '0 12px', border: 0, background: 'transparent', fontFamily: SANS, fontSize: 14, color: MUTED, textDecoration: 'underline', cursor: 'pointer' }}>Quitar</button>
                </div>
              </div>
              <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{formatCatalogPrice(l.price * l.qty, l.currency)}</p>
            </li>
          ))}
        </ul>
        <aside style={{ padding: 28, borderRadius: 24, background: '#fff', border: `1px solid ${LINE}` }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 26, color: INK }}>Resumen</h2>
          <p style={{ display: 'flex', justifyContent: 'space-between', margin: '18px 0 0', fontFamily: SANS, color: INK }}><span>Subtotal estimado</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCatalogPrice(total, currency)}</strong></p>
          <p style={{ margin: '8px 0 20px', fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: MUTED }}>El total final y el envío se confirman en el pago seguro.{promoNote ? ` ${promoNote}` : ''}</p>
          <button type="button" className="rs-btn" disabled={busy || preview} onClick={pay} style={{ ...button(true), width: '100%' }}>{busy ? 'Redirigiendo…' : checkoutLabel || 'Pagar'}</button>
          <p role="alert" style={{ margin: '10px 0 0', minHeight: 20, fontFamily: SANS, fontSize: 14, color: ACCENT }}>{error}</p>
        </aside>
      </div>
    </section>
  )
}

export const CartPageBlock = defineBlock({
  type: 'CartPageBlock',
  label: 'Carrito y pago',
  category: 'atlas-ecommerce',
  defaultProps: { mode: 'cart', checkoutLabel: 'Pagar', shopHref: '/productos', promoNote: '¿Tienes un código? Lo ingresas al pagar.' },
  fields: {
    mode: { type: 'select', label: 'Modo', options: [{ value: 'cart', label: 'Carrito' }, { value: 'thanks', label: 'Gracias por tu compra' }] },
    checkoutLabel: { type: 'text', label: 'Texto del boton de pago' },
    shopHref: { type: 'link', label: 'Enlace a la tienda' },
    promoNote: { type: 'text', label: 'Nota de codigo de descuento (vacio la oculta)' },
  },
  groups: [{ label: 'Contenido', fields: ['mode', 'checkoutLabel', 'shopHref', 'promoNote'] }],
  render: (props) => <CartPage {...props} />,
})
