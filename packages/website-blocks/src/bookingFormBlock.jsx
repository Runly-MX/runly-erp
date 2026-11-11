import { defineBlock } from '@raulbellosom/atlas-web-builder'

export const BookingFormBlock = defineBlock({
  type:     'BookingFormBlock',
  label:    'Formulario de reservacion',
  category: 'atlas-bookings',
  defaultProps: {
    calendarId:      '',
    serviceDuration: 60,
    successMessage:  'Reservacion solicitada. Te contactaremos para confirmar.',
    buttonLabel:     'Solicitar reservacion',
  },
  fields: {
    calendarId:      { type: 'text',   label: 'ID del calendario (runly.calendar)' },
    serviceDuration: { type: 'number', label: 'Duracion del servicio (minutos)' },
    successMessage:  { type: 'text',   label: 'Mensaje de exito' },
    buttonLabel:     { type: 'text',   label: 'Texto del boton' },
  },
  render({ calendarId, buttonLabel }) {
    if (!calendarId) {
      return (
        <div style={{ padding: '24px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Configura el ID del calendario en las propiedades del bloque</p>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <p style={{ fontWeight: 600, fontSize: '16px' }}>Solicitar reservacion</p>
        <input placeholder="Nombre completo" disabled style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', background: '#f8fafc' }} />
        <input placeholder="Email" disabled style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', background: '#f8fafc' }} />
        <input type="date" disabled style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', background: '#f8fafc' }} />
        <button type="button" disabled style={{ padding: '10px 24px', background: 'var(--runly-color-primary, #6D28D9)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', opacity: 0.7 }}>
          {buttonLabel}
        </button>
      </div>
    )
  },
})
