// Store navbar: same look as NavbarBlock plus a "Carrito" link with a live item count read from the browser cart.
import { useEffect, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { useCartLines } from './storeCart.js'
import { ACCENT, INK, LINE, PAPER, SANS, SERIF } from './storeUi.jsx'

const parseLinks = (raw) => String(raw ?? '').split('\n').map((l) => l.split('|').map((p) => p.trim())).filter(([label]) => label).slice(0, 8).map(([label, href]) => ({ label, href: href || '#' }))

const CSS = `.sn-bar a,.sn-bar button{outline-offset:2px}.sn-bar a:focus-visible,.sn-bar button:focus-visible{outline:3px solid ${ACCENT}}
.sn-link{transition:opacity .18s ease}.sn-link:hover{opacity:.7}.sn-burger{display:none}
@media (max-width:767px){.sn-burger{display:inline-flex}.sn-links{display:none!important}.sn-bar[data-open="true"] .sn-links{display:flex!important;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;gap:0;padding:8px 24px 16px;background:var(--sn-bg);border-bottom:1px solid ${LINE}}.sn-links a{min-height:44px}}
@media (prefers-reduced-motion:reduce){.sn-link{transition:none}}`

function StoreNavbar({ variant, brand, links, cartLabel, cartHref, sticky }) {
  const dark = variant === 'dark'
  const bg = dark ? INK : PAPER
  const fg = dark ? PAPER : INK
  const count = useCartLines().reduce((sum, l) => sum + l.qty, 0)
  const [open, setOpen] = useState(false)
  const barRef = useRef(null)
  const toggleRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    barRef.current?.querySelector('.sn-links a')?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const linkStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 4px', fontFamily: SANS, fontSize: 15, fontWeight: 500, color: fg, textDecoration: 'none' }
  return (
    <header ref={barRef} className="sn-bar" data-open={open} style={{ '--sn-bg': bg, position: sticky ? 'sticky' : 'relative', top: 0, zIndex: 40, background: bg, color: fg, borderBottom: `1px solid ${dark ? 'rgba(250,247,242,.18)' : LINE}` }}>
      <style>{CSS}</style>
      <nav aria-label="Principal" style={{ maxWidth: 1280, marginInline: 'auto', padding: '0 24px', minHeight: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <a href="/" style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: fg, textDecoration: 'none' }}>{brand}</a>
        <div id="sn-links" className="sn-links" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {parseLinks(links).map((l) => <a key={l.label + l.href} className="sn-link" href={l.href} style={linkStyle}>{l.label}</a>)}
          <a className="sn-link" href={cartHref || '/carrito'} style={{ ...linkStyle, gap: 8 }} aria-label={count ? `${cartLabel}, ${count} artículos` : cartLabel}>
            {cartLabel}
            {count > 0 && <span aria-hidden="true" style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999, background: ACCENT, color: '#fff', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>{count > 99 ? '99+' : count}</span>}
          </a>
        </div>
        <button ref={toggleRef} type="button" className="sn-burger" aria-expanded={open} aria-controls="sn-links" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen((v) => !v)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', border: 0, background: 'transparent', color: fg, cursor: 'pointer' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </nav>
    </header>
  )
}

export const StoreNavbarBlock = defineBlock({
  type: 'StoreNavbarBlock',
  label: 'Navbar de tienda con carrito',
  category: 'atlas-ecommerce',
  defaultProps: { variant: 'light', brand: 'Mi Tienda', links: 'Inicio | /\nTienda | /productos\nNosotros | /nosotros\nContacto | /contacto', cartLabel: 'Carrito', cartHref: '/carrito', sticky: true },
  fields: {
    variant: { type: 'select', label: 'Estilo', options: ['light', 'dark'] },
    brand: { type: 'text', label: 'Nombre de marca' },
    links: { type: 'textarea', label: 'Enlace | /ruta (uno por linea)' },
    cartLabel: { type: 'text', label: 'Texto del carrito' },
    cartHref: { type: 'link', label: 'Enlace del carrito' },
    sticky: { type: 'toggle', label: 'Pegajoso (sticky)' },
  },
  groups: [{ label: 'Contenido', fields: ['variant', 'brand', 'links', 'cartLabel', 'cartHref', 'sticky'] }],
  render: (props) => <StoreNavbar {...props} />,
})
