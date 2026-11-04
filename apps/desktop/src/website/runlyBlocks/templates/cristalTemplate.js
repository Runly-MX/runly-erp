import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const nav = (active) => ({ id: 'navbar', type: 'CrNavbarBlock', props: { brand: 'Aura', links: 'Inicio | /\nFunciones | /funciones\nPrecios | /precios\nContacto | /contacto', active, ctaLabel: 'Descargar app', ctaHref: '/precios' }, children: {} })
const FOOTER = { id: 'footer', type: 'CrFooterBlock', props: { copyright: `© ${new Date().getFullYear()} Aura. Todos los derechos reservados.` }, children: {} }

const block = (id, type, props, children = {}) => ({ id, type, props, children })
const page = (...blocks) => ({ rootIds: blocks.filter((b) => !b.nested).map((b) => b.id), blocks: Object.fromEntries(blocks.map(({ nested, ...b }) => [b.id, b])) })
const nested = (b) => ({ ...b, nested: true })
// Form placeholders become real site forms when the template is applied (website-template-forms.js).
const closing = () => [
  block('closing', 'CrClosingBlock', {}, { form: ['closing-form'] }),
  nested(block('closing-form', 'ContactFormBlock', { formId: '@newsletter', successMessage: 'Listo, te escribiremos pronto.', buttonLabel: 'Suscribirme' })),
]

export const cristalTemplate = defineTemplate({
  id: 'atlas-aura',
  label: 'Aura Vidrio',
  description: 'Lanzamiento de app con estilo de vidrio líquido: cielo luminoso, tarjetas translúcidas, teléfono flotante, ventana con paisaje animado y orbe iridiscente.',
  category: 'app',
  build() {
    return page(
      nav('/'),
      block('hero', 'CrHeroBlock', {}),
      block('features', 'CrFeaturesBlock', {}),
      block('window', 'CrWindowBlock', {}),
      block('steps', 'CrStepsBlock', {}),
      block('voices', 'CrVoicesBlock', {}),
      ...closing(),
      FOOTER,
    )
  },
})

export const cristalSitePages = [
  {
    id: 'funciones', label: 'Funciones', routePath: '/funciones', required: false, description: 'Funciones de la app, cómo funciona y opiniones.',
    build: () => page(
      nav('/funciones'),
      block('hero', 'CrPageHeroBlock', {}),
      block('features', 'CrFeaturesBlock', { eyebrow: 'Lo que puedes hacer', title: 'Pequeñas herramientas,', highlight: 'grandes cambios' }),
      block('steps', 'CrStepsBlock', {}),
      block('window', 'CrWindowBlock', { badge: 'Modo enfoque', title: 'Un rato de calma', titleStrong: 'en medio del día', text: 'Activa el modo enfoque y Aura silencia lo que no importa durante el tiempo que elijas.', ctaLabel: 'Ver planes', ctaHref: '/precios' }),
      block('voices', 'CrVoicesBlock', {}),
      FOOTER,
    ),
  },
  {
    id: 'precios', label: 'Precios', routePath: '/precios', required: false, description: 'Planes mensuales o anuales y preguntas frecuentes.',
    build: () => page(
      nav('/precios'),
      block('hero', 'CrPageHeroBlock', { eyebrow: 'Precios', title: 'Un plan para', highlight: 'cada ritmo', text: 'Empieza gratis y mejora cuando lo necesites. Sin letras pequeñas.', crumb: 'Precios' }),
      block('pricing', 'CrPricingBlock', {}),
      block('faq', 'CrFaqBlock', {}),
      ...closing(),
      FOOTER,
    ),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', required: false, description: 'Formulario y canales de contacto.',
    build: () => page(
      nav('/contacto'),
      block('hero', 'CrPageHeroBlock', { eyebrow: 'Contacto', title: 'Hablemos,', highlight: 'te escuchamos', text: 'Cuéntanos qué necesitas y te respondemos en menos de un día hábil.', crumb: 'Contacto' }),
      block('contact', 'CrContactBlock', {}, { form: ['contact-form'] }),
      nested(block('contact-form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' })),
      FOOTER,
    ),
  },
]
