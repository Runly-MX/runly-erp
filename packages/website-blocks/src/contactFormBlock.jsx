import { defineBlock } from '@raulbellosom/atlas-web-builder'

import ContactFormRenderer from './ContactFormRenderer.jsx'

export const ContactFormBlock = defineBlock({
  type: 'ContactFormBlock',
  label: 'Formulario de contacto',
  category: 'atlas',
  defaultProps: {
    formId: '',
    successMessage: 'Mensaje enviado correctamente',
    buttonLabel: 'Enviar',
  },
  fields: {
    formId: { type: 'text', label: 'ID del formulario' },
    successMessage: { type: 'text', label: 'Mensaje de exito' },
    buttonLabel: { type: 'text', label: 'Texto del boton' },
  },
  render: ContactFormRenderer,
})
