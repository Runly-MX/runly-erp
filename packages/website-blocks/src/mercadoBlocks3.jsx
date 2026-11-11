// Mercado template: newsletter band (holds the real form as a child block), service promises and the footer.
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { parseColumns } from './siteFooterBlock.jsx'
import { Base, GREEN, ICON_NAMES, INK, Icon, MUTED, ON_GREEN, SANS, SERIF, panel, rows, safeHref, sectionPad, useInView } from './mercadoUi.jsx'

// ─── Newsletter ──────────────────────────────────────────────────────────────

// The child ContactFormBlock renders the storefront form; these rules make it read on the dark band.
const NEWS_CSS = `.mk-news{color:${ON_GREEN}}.mk-news label{color:${ON_GREEN}}
.mk-news input{min-height:48px;border-radius:999px!important;border:0!important;padding:0 20px!important;background:#fff!important;color:${INK}!important}
.mk-news button{min-height:48px;border-radius:999px!important;border:0!important;padding:0 26px!important;background:#D8E6C4!important;color:${GREEN}!important;font-weight:700;cursor:pointer;transition:transform .2s ease}.mk-news button:hover{transform:translateY(-1px)}
@keyframes mk-env{0%,100%{transform:rotate(0)}10%{transform:rotate(-8deg)}20%{transform:rotate(6deg)}30%{transform:rotate(0)}}`

function MercadoNewsletter({ title, text, note, ctx }) {
  return (
    <section className="mk" style={sectionPad}>
      <Base /><style>{NEWS_CSS}</style>
      <div style={{ position: 'relative', maxWidth: 1280, marginInline: 'auto', borderRadius: 20, overflow: 'hidden', background: GREEN, color: ON_GREEN, padding: 'clamp(24px, 3.5vw, 40px) clamp(20px, 5vw, 72px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'center', gap: 'clamp(20px, 4vw, 48px)' }}>
        <svg aria-hidden="true" viewBox="0 0 400 200" preserveAspectRatio="xMinYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }}>
          <g fill="#fff"><path d="M-20 160c60-80 160-90 200-40-60 70-150 80-200 40z" /><path d="M320 -10c40 60 30 140-20 170-40-60-30-130 20-170z" /></g>
        </svg>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 32px)' }}>
          <span style={{ flex: 'none', width: 'clamp(72px, 8vw, 96px)', height: 'clamp(72px, 8vw, 96px)', borderRadius: 999, background: '#fff', color: GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="mail" size={40} stroke={1.4} style={{ transformOrigin: '50% 80%', animation: 'mk-env 4s ease-in-out infinite' }} /></span>
          <div>
            <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(24px, 2.6vw, 32px)', lineHeight: 1.15 }}>{title}</h2>
            {text && <p style={{ margin: '8px 0 0', maxWidth: '36ch', fontFamily: SANS, fontSize: 14, lineHeight: 1.6, opacity: 0.88 }}>{text}</p>}
          </div>
        </div>
        <div className="mk-news" style={{ position: 'relative' }}>
          {ctx.slot('children')}
          {note && <p style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 12, opacity: 0.85 }}><Icon name="escudo" size={16} />{note}</p>}
        </div>
      </div>
    </section>
  )
}

export const MercadoNewsletterBlock = defineBlock({
  type: 'MercadoNewsletterBlock',
  label: 'Mercado: banda de suscripción',
  category: 'atlas-ecommerce',
  slots: { children: {} },
  defaultProps: { title: 'No te pierdas nada', text: 'Ofertas exclusivas, novedades e ideas de estilo directo en tu correo.', note: 'Respetamos tu privacidad. Cancela cuando quieras.' },
  fields: {
    title: { type: 'text', label: 'Título' }, text: { type: 'textarea', label: 'Texto' }, note: { type: 'text', label: 'Nota de privacidad' },
  },
  groups: [{ label: 'Contenido', fields: ['title', 'text', 'note'] }],
  render: (props) => <MercadoNewsletter {...props} />,
})

// ─── Service promises ────────────────────────────────────────────────────────

const SERVICE_CSS = `.mk-svc-ico{transition:background .3s ease,color .3s ease,transform .3s ease}.mk-svc:hover .mk-svc-ico{background:${GREEN};color:${ON_GREEN};transform:rotate(-6deg)}`

function MercadoServices({ items }) {
  const [ref, inView] = useInView()
  return (
    <section className="mk" style={sectionPad}>
      <Base /><style>{SERVICE_CSS}</style>
      <ul ref={ref} data-in={inView} className="mk-stagger" style={{ ...panel, listStyle: 'none', margin: '0 auto', padding: 'clamp(18px, 2.4vw, 24px) clamp(18px, 3vw, 40px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 20 }}>
        {rows(items, 4).map(([icon, title, text]) => (
          <li key={title} className="mk-svc" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="mk-svc-ico" style={{ flex: 'none', width: 52, height: 52, borderRadius: 999, background: '#EEF3EC', color: GREEN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={26} /></span>
            <span style={{ fontFamily: SANS }}>
              <strong style={{ display: 'block', fontSize: 15, color: INK }}>{title}</strong>
              {text && <span style={{ fontSize: 13, color: MUTED }}>{text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const MercadoServicesBlock = defineBlock({
  type: 'MercadoServicesBlock',
  label: 'Mercado: garantías de servicio',
  category: 'atlas-ecommerce',
  defaultProps: { items: 'envio | Envío gratis | En compras desde $999\ndevolucion | Devoluciones fáciles | Tienes 30 días para cambiar\ncandado | Pago seguro | Compra 100% protegida\nsoporte | Atención 24/7 | Estamos para ayudarte' },
  fields: { items: { type: 'textarea', label: `Garantías: icono | Título | Texto (máximo 4; iconos: ${ICON_NAMES.join(', ')})` } },
  groups: [{ label: 'Contenido', fields: ['items'] }],
  render: (props) => <MercadoServices {...props} />,
})

// ─── Footer ──────────────────────────────────────────────────────────────────

const SOCIAL = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', tiktok: 'TikTok' }
const FOOT_CSS = `.mk-foot a{color:inherit;text-decoration:none;transition:opacity .2s ease,color .2s ease}.mk-foot a:hover{opacity:1!important;color:#D8E6C4}
.mk-social{transition:transform .2s ease,background .2s ease}.mk-social:hover{transform:translateY(-3px);background:rgba(255,255,255,.14)}
.mk-store{transition:transform .2s ease,border-color .2s ease}.mk-store:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.6)!important}`

function StoreBadge({ href, small, big }) {
  return (
    <a className="mk-store" href={safeHref(href)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '6px 16px 6px 12px', borderRadius: 10, background: '#000', border: '1px solid rgba(255,255,255,.25)', color: '#fff', minWidth: 170 }}>
      <Icon name="phone" size={24} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}><span style={{ fontSize: 10, opacity: 0.8 }}>{small}</span><span style={{ fontSize: 16, fontWeight: 600 }}>{big}</span></span>
    </a>
  )
}

function MercadoFooter({ brand, tagline, social, columns, appTitle, appText, appStoreHref, playStoreHref, copyright, legal, region }) {
  const cols = parseColumns(columns).slice(0, 4)
  const socials = rows(social, 5).filter(([net]) => SOCIAL[net])
  return (
    <footer className="mk mk-foot" style={{ marginTop: 12, background: GREEN, color: ON_GREEN, fontFamily: SANS }}>
      <Base /><style>{FOOT_CSS}</style>
      <div style={{ maxWidth: 1280, marginInline: 'auto', padding: 'clamp(40px, 5vw, 56px) clamp(16px, 3vw, 24px) 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 32 }}>
        <div style={{ gridColumn: 'span 1', minWidth: 0 }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, border: '2px solid currentColor', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="hoja" size={24} stroke={1.8} /></span>
            <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, letterSpacing: '.04em' }}>{brand}</span>
          </a>
          {tagline && <p style={{ margin: '14px 0 0', maxWidth: '30ch', fontSize: 13, lineHeight: 1.6, opacity: 0.8 }}>{tagline}</p>}
          {socials.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'flex', gap: 8 }}>
              {socials.map(([net, href]) => <li key={net}><a className="mk-social" href={safeHref(href)} aria-label={SOCIAL[net]} style={{ width: 40, height: 40, borderRadius: 999, border: '1.5px solid rgba(255,255,255,.6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={net} size={18} /></a></li>)}
            </ul>
          )}
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{col.title}</h2>
            <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 2 }}>
              {col.links.map((l) => <li key={l.label}><a href={l.href} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, fontSize: 13, opacity: 0.8 }}>{l.label}</a></li>)}
            </ul>
          </nav>
        ))}
        {(appStoreHref || playStoreHref) && (
          <div>
            {appTitle && <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{appTitle}</h2>}
            {appText && <p style={{ margin: '10px 0 14px', fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>{appText}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
              {appStoreHref && <StoreBadge href={appStoreHref} small="Descárgala en" big="App Store" />}
              {playStoreHref && <StoreBadge href={playStoreHref} small="Disponible en" big="Google Play" />}
            </div>
          </div>
        )}
      </div>
      <div style={{ maxWidth: 1280, marginInline: 'auto', padding: '16px clamp(16px, 3vw, 24px) 24px', borderTop: '1px solid rgba(255,255,255,.14)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontSize: 12 }}>
        <p style={{ margin: 0, opacity: 0.8 }}>{copyright}</p>
        <nav aria-label="Legal" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {rows(legal, 4).map(([label, href]) => <a key={label} href={safeHref(href)} style={{ opacity: 0.8, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>{label}</a>)}
        </nav>
        {region && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.25)' }}><Icon name="globe" size={16} />{region}</span>}
      </div>
    </footer>
  )
}

export const MercadoFooterBlock = defineBlock({
  type: 'MercadoFooterBlock',
  label: 'Mercado: pie de página',
  category: 'navigation',
  defaultProps: {
    brand: 'Brote', tagline: 'Tu tienda para todo lo de cada día: calidad en todas las categorías.',
    social: 'facebook | https://facebook.com\ninstagram | https://instagram.com\nx | https://x.com\nyoutube | https://youtube.com',
    columns: 'Tienda\nTodas las categorías | /productos\nNovedades | /productos\nMás vendidos | /productos\nOfertas | /productos\n---\nAtención al cliente\nMi carrito | /carrito\nEnvíos y devoluciones | /contacto\nPreguntas frecuentes | /contacto\nContacto | /contacto\n---\nEmpresa\nNosotros | /nosotros\nTrabaja con nosotros | /contacto\nSustentabilidad | /nosotros',
    appTitle: 'Descarga nuestra app', appText: 'Compra desde donde estés con nuestra app.', appStoreHref: '', playStoreHref: '',
    copyright: `© ${new Date().getFullYear()} Brote. Todos los derechos reservados.`,
    legal: 'Aviso de privacidad | /\nTérminos y condiciones | /\nPolítica de cookies | /', region: 'México (MXN)',
  },
  fields: {
    brand: { type: 'text', label: 'Nombre' }, tagline: { type: 'textarea', label: 'Descripción' },
    social: { type: 'textarea', label: 'Redes: red | enlace (facebook, instagram, x, youtube, tiktok)' },
    columns: { type: 'textarea', label: 'Columnas (título en la primera línea; Etiqueta | /ruta; separadas por ---)' },
    appTitle: { type: 'text', label: 'Título de la app' }, appText: { type: 'text', label: 'Texto de la app' },
    appStoreHref: { type: 'link', label: 'Enlace App Store (vacío lo oculta)' }, playStoreHref: { type: 'link', label: 'Enlace Google Play (vacío lo oculta)' },
    copyright: { type: 'text', label: 'Derechos' }, legal: { type: 'textarea', label: 'Enlaces legales: Etiqueta | /ruta' }, region: { type: 'text', label: 'País y moneda (vacío lo oculta)' },
  },
  groups: [
    { label: 'Marca', fields: ['brand', 'tagline', 'social'] },
    { label: 'Enlaces', fields: ['columns', 'legal'] },
    { label: 'App y región', fields: ['appTitle', 'appText', 'appStoreHref', 'playStoreHref', 'region', 'copyright'] },
  ],
  render: (props) => <MercadoFooter {...props} />,
})
