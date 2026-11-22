import { useEffect, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'

// Native runly.ticketing block (F6E): places a published event of the company on the site.
// Everything live (dates, availability, issuing tickets) stays in the ERP's event portal;
// the block shows it embedded (a compact event card or the full portal), as a button or as
// a link. `portalUrl` is pinned by the server at publication (absolute ERP address); while
// editing inside the ERP the address is built from the ERP origin itself.
const DISPLAYS = [
  { value: 'card', label: 'Tarjeta del evento' },
  { value: 'portal', label: 'Portal integrado' },
  { value: 'button', label: 'Botón' },
  { value: 'link', label: 'Enlace' },
]

export function ticketingEventHref({ portalUrl, event }, { embed = false, compact = false } = {}) {
  const base = portalUrl || (event && typeof window !== 'undefined' ? `${window.location.origin}/app/p/boletos/${event}` : '')
  if (!base) return ''
  let url
  try { url = new URL(base) } catch { return '' }
  if (!/^https?:$/.test(url.protocol)) return ''
  if (embed) { url.searchParams.set('embed', '1'); url.searchParams.set('canal', 'website') }
  if (compact) url.searchParams.set('vista', 'tarjeta')
  return url.toString()
}

// Grows with the portal: only height messages from that iframe and the portal's origin count.
function TicketsFrame({ src, minHeight }) {
  const ref = useRef(null)
  const [height, setHeight] = useState(minHeight)
  useEffect(() => {
    let origin
    try { origin = new URL(src).origin } catch { return undefined }
    const onMessage = (event) => {
      if (event.origin !== origin || event.source !== ref.current?.contentWindow || event.data?.type !== 'runly-tickets:height') return
      const next = Number(event.data.height)
      if (Number.isFinite(next)) setHeight(Math.max(240, Math.min(5000, Math.ceil(next))))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [src])
  return (
    <iframe ref={ref} src={src} title="Boletos del evento" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
      style={{ display: 'block', width: '100%', height: `${height}px`, border: 0, background: 'transparent' }} />
  )
}

const placeholder = {
  padding: '24px', border: '1px dashed var(--atlas-color-border, #cbd5e1)', borderRadius: '8px', textAlign: 'center',
  color: 'var(--atlas-color-muted, #64748b)', fontFamily: 'var(--atlas-font-sans)', fontSize: 'var(--atlas-fontSize-sm, 14px)',
}

export const TicketingEventBlock = defineBlock({
  type: 'TicketingEventBlock',
  label: 'Evento con boletos',
  category: 'atlas-tickets',
  icon: 'calendar',
  defaultProps: { event: '', display: 'card', buttonLabel: 'Obtener boletos' },
  fields: {
    event: { type: 'text', label: 'Evento publicado' },
    display: { type: 'select', label: 'Presentación', options: DISPLAYS },
    buttonLabel: { type: 'text', label: 'Texto del botón o enlace' },
  },
  render(props) {
    const { display, buttonLabel } = props
    const href = ticketingEventHref(props)
    if (!href) return <div style={placeholder}>Elige un evento publicado en las propiedades del bloque.</div>
    if (display === 'button') {
      return (
        <a href={href} target="_blank" rel="noopener" style={{
          display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '10px 24px', borderRadius: '8px',
          background: 'var(--atlas-color-primary, #0F62FE)', color: 'var(--atlas-color-primaryForeground, #ffffff)',
          fontFamily: 'var(--atlas-font-sans)', fontWeight: 600, textDecoration: 'none',
        }}>{buttonLabel || 'Obtener boletos'}</a>
      )
    }
    if (display === 'link') {
      return <a href={href} target="_blank" rel="noopener" style={{ color: 'var(--atlas-color-primary, #0F62FE)', fontFamily: 'var(--atlas-font-sans)', fontWeight: 600 }}>{buttonLabel || 'Obtener boletos'}</a>
    }
    return display === 'portal'
      ? <TicketsFrame src={ticketingEventHref(props, { embed: true })} minHeight={900} />
      : <TicketsFrame src={ticketingEventHref(props, { embed: true, compact: true })} minHeight={420} />
  },
})
