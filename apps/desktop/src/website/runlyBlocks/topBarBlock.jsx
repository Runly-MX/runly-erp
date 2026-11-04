import { defineBlock } from '@raulbellosom/atlas-web-builder'

const COLORS = {
  dark: ['#0f172a', '#e2e8f0'],
  primary: ['var(--runly-color-primary, #2563eb)', 'var(--runly-color-primaryFg, #fff)'],
  muted: ['color-mix(in srgb, var(--runly-color-primary, #2563eb) 8%, #fff)', '#0f172a'],
}

export const TopBarBlock = defineBlock({
  type: 'TopBarBlock',
  label: 'Barra superior de contacto',
  category: 'atlas',
  defaultProps: { message: '¡Creemos algo increíble!', email: 'hola@ejemplo.com', phone: '(415) 555-0198', hours: 'Lun - Vie: 9:00 - 18:00', background: 'muted' },
  fields: {
    message: { type: 'text', label: 'Mensaje' },
    email: { type: 'text', label: 'Correo' },
    phone: { type: 'text', label: 'Teléfono' },
    hours: { type: 'text', label: 'Horario' },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'muted', label: 'Suave' }, { value: 'dark', label: 'Oscuro' }, { value: 'primary', label: 'Color principal' }] },
  },
  groups: [{ label: 'Contenido', fields: ['message', 'email', 'phone', 'hours'] }, { label: 'Estilo', fields: ['background'] }],
  render({ message, email, phone, hours, background }) {
    const [bg, fg] = COLORS[background] ?? COLORS.muted
    const link = { color: 'inherit', textDecoration: 'none' }
    const items = [
      message && <span key="m">{message}</span>,
      email && <a key="e" href={`mailto:${email}`} style={link}>{email}</a>,
      phone && <a key="p" href={`tel:${String(phone).replace(/[^\d+]/g, '')}`} style={link}>{phone}</a>,
      hours && <span key="h">{hours}</span>,
    ].filter(Boolean)
    return (
      <div style={{ background: bg, color: fg, padding: '8px 24px', fontFamily: 'var(--runly-font-sans)', fontSize: '13px' }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '6px 24px' }}>{items}</div>
      </div>
    )
  },
})
