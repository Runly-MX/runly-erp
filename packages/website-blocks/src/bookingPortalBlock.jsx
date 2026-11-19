import { useEffect, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Native runly.bookings block: shows a published BookingPage of the company. The
// availability, the booking and its rules stay in the Booking Engine (the portal);
// this block only places it on the site as an embedded calendar, a button or a link.
// `portalUrl` is pinned by the server at publication (absolute ERP address); while
// editing inside the ERP the address is built from the ERP origin itself.
const DISPLAYS = [
  { value: 'calendar', label: 'Calendario integrado' },
  { value: 'button', label: 'Botón' },
  { value: 'link', label: 'Enlace' },
]

export function bookingPortalHref({ portalUrl, bookingPage, serviceId }, { embed = false } = {}) {
  const base = portalUrl || (bookingPage && typeof window !== 'undefined' ? `${window.location.origin}/app/p/reservar/${bookingPage}` : '')
  if (!base) return ''
  let url
  try { url = new URL(base) } catch { return '' }
  if (!/^https?:$/.test(url.protocol)) return ''
  if (serviceId) url.searchParams.set('servicio', serviceId)
  if (embed) url.searchParams.set('embed', '1')
  return url.toString()
}

// Grows with the portal: the embedded page posts its content height. Only messages
// from that iframe and the portal's origin are accepted.
function BookingFrame({ src }) {
  const ref = useRef(null)
  const [height, setHeight] = useState(760)
  useEffect(() => {
    let origin
    try { origin = new URL(src).origin } catch { return undefined }
    const onMessage = (event) => {
      if (event.origin !== origin || event.source !== ref.current?.contentWindow || event.data?.type !== 'runly-booking:height') return
      const next = Number(event.data.height)
      if (Number.isFinite(next)) setHeight(Math.max(360, Math.min(4000, Math.ceil(next))))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [src])
  return (
    <iframe ref={ref} src={src} title="Reservaciones en línea" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
      style={{ display: 'block', width: '100%', height: `${height}px`, border: 0, background: 'transparent' }} />
  )
}

const placeholder = {
  padding: '24px', border: '1px dashed var(--atlas-color-border, #cbd5e1)', borderRadius: '8px', textAlign: 'center',
  color: 'var(--atlas-color-muted, #64748b)', fontFamily: 'var(--atlas-font-sans)', fontSize: 'var(--atlas-fontSize-sm, 14px)',
}

export const BookingPortalBlock = defineBlock({
  type: 'BookingPortalBlock',
  label: 'Reservaciones',
  category: 'atlas-bookings',
  icon: 'calendar',
  defaultProps: { bookingPage: '', serviceId: '', display: 'calendar', buttonLabel: 'Reservar ahora' },
  fields: {
    bookingPage: { type: 'text', label: 'Página de reservaciones' },
    serviceId: { type: 'text', label: 'Servicio (opcional)' },
    display: { type: 'select', label: 'Presentación', options: DISPLAYS },
    buttonLabel: { type: 'text', label: 'Texto del botón o enlace' },
  },
  render(props) {
    const { display, buttonLabel } = props
    const embedSrc = bookingPortalHref(props, { embed: true })
    const href = bookingPortalHref(props)
    if (!href) return <div style={placeholder}>Elige una página de reservaciones en las propiedades del bloque.</div>
    if (display === 'button') {
      return (
        <a href={href} target="_blank" rel="noopener" style={{
          display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '10px 24px', borderRadius: '8px',
          background: 'var(--atlas-color-primary, #0F62FE)', color: 'var(--atlas-color-primaryForeground, #ffffff)',
          fontFamily: 'var(--atlas-font-sans)', fontWeight: 600, textDecoration: 'none',
        }}>{buttonLabel || 'Reservar ahora'}</a>
      )
    }
    if (display === 'link') {
      return <a href={href} target="_blank" rel="noopener" style={{ color: 'var(--atlas-color-primary, #0F62FE)', fontFamily: 'var(--atlas-font-sans)', fontWeight: 600 }}>{buttonLabel || 'Reservar ahora'}</a>
    }
    return <BookingFrame src={embedSrc} />
  },
})
