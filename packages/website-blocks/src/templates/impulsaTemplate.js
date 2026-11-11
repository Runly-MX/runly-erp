import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const nav = (active) => ({ id: 'navbar', type: 'ImNavbarBlock', props: { brand: 'Impulsa', links: 'Nosotros | /nosotros\nServicios | /servicios\nPrecios | /precios\nContacto | /contacto', active, ctaLabel: 'Pedir cotización', ctaHref: '/contacto' }, children: {} })
const FOOTER = {
  id: 'footer',
  type: 'SiteFooterBlock',
  props: {
    tone: 'light', brand: 'Impulsa', tagline: 'Tu agencia de marketing digital: más tráfico, más prospectos y más ventas, medidos mes con mes.',
    columns: 'Explorar\nNosotros | /nosotros\nServicios | /servicios\nPrecios | /precios\nContacto | /contacto\n---\nServicios\nPosicionamiento SEO | /servicios\nPublicidad digital | /servicios\nRedes sociales | /servicios\nEmail marketing | /servicios\n---\nContacto\nhola@example.com | mailto:hola@example.com\n+52 33 1234 5678 | tel:+523312345678\nGuadalajara, Jalisco | /contacto',
    copyright: `© ${new Date().getFullYear()} Impulsa. Todos los derechos reservados.`, showBrand: true, backToTop: true,
  },
  children: {},
}

const block = (id, type, props, children = {}) => ({ id, type, props, children })
const page = (...blocks) => ({ rootIds: blocks.filter((b) => !b.nested).map((b) => b.id), blocks: Object.fromEntries(blocks.map(({ nested, ...b }) => [b.id, b])) })
const pageHero = (props) => block('hero', 'ImPageHeroBlock', props)
const closing = () => block('closing', 'ImTestimonialCtaBlock', {})
// '@newsletter' becomes the site's "Newsletter" form when the template is applied (website-template-forms.js).
const newsletter = () => [
  block('newsletter', 'ImNewsletterBlock', {}, { form: ['newsletter-form'] }),
  { ...block('newsletter-form', 'ContactFormBlock', { formId: '@newsletter', successMessage: 'Gracias por suscribirte.', buttonLabel: 'Suscribirme' }), nested: true },
]

export const impulsaTemplate = defineTemplate({
  id: 'atlas-impulsa',
  label: 'Impulsa Marketing',
  description: 'Agencia de marketing digital: verde de marca, cohete animado, tarjetas de servicios ilustradas, contadores y planes con cambio mensual o anual.',
  category: 'marketing',
  build() {
    return page(
      nav('/'),
      block('hero', 'ImHeroBlock', {}),
      block('logos', 'ImLogosBlock', {}),
      block('services', 'ImServicesBlock', {}),
      block('results', 'ImResultsBlock', {}),
      block('process', 'ImProcessBlock', {}),
      closing(),
      ...newsletter(),
      FOOTER,
    )
  },
})

export const impulsaSitePages = [
  {
    id: 'nosotros', label: 'Nosotros', routePath: '/nosotros', required: false, description: 'Quiénes somos, cómo trabajamos y por qué confían en nosotros.',
    build: () => page(
      nav('/nosotros'),
      pageHero({ eyebrow: 'Nosotros', title: 'Personas reales detrás de', highlight: 'tus resultados', text: 'Estrategas, creativos y analistas que trabajan como una extensión de tu equipo.', crumb: 'Nosotros' }),
      block('about', 'ImAboutBlock', {}),
      block('results', 'ImResultsBlock', { title: 'Una década', highlight: 'haciendo crecer marcas', ctaLabel: 'Conoce nuestros servicios' }),
      block('logos', 'ImLogosBlock', {}),
      closing(),
      FOOTER,
    ),
  },
  {
    id: 'servicios', label: 'Servicios', routePath: '/servicios', required: false, description: 'Servicios de marketing digital con el detalle de cada uno.',
    build: () => page(
      nav('/servicios'),
      pageHero({ eyebrow: 'Servicios', title: 'Todo lo que necesitas para', highlight: 'crecer en línea', text: 'Estrategia, contenido, campañas y medición en un solo equipo.', crumb: 'Servicios' }),
      block('detail', 'ImServiceDetailBlock', {}),
      block('process', 'ImProcessBlock', {}),
      closing(),
      FOOTER,
    ),
  },
  {
    id: 'precios', label: 'Precios', routePath: '/precios', required: false, description: 'Planes mensuales o anuales y preguntas frecuentes.',
    build: () => page(
      nav('/precios'),
      pageHero({ eyebrow: 'Precios', title: 'Invierte en lo que', highlight: 'sí da resultados', text: 'Elige el plan que va con tu etapa. Puedes cambiarlo cuando lo necesites.', crumb: 'Precios' }),
      block('pricing', 'ImPricingBlock', {}),
      block('faq', 'ImFaqBlock', {}),
      ...newsletter(),
      FOOTER,
    ),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', required: false, description: 'Formulario, datos de contacto y horario.',
    build: () => page(
      nav('/contacto'),
      pageHero({ eyebrow: 'Contacto', title: 'Hablemos de', highlight: 'tu crecimiento', text: 'Cuéntanos de tu negocio y te enviamos una propuesta sin costo en menos de 48 horas.', crumb: 'Contacto' }),
      block('channels', 'ImChannelsBlock', {}),
      block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos en menos de 48 horas.', buttonLabel: 'Enviar mensaje' }),
      FOOTER,
    ),
  },
]
