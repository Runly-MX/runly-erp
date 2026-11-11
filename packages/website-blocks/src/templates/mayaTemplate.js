import { defineTemplate } from '@raulbellosom/atlas-web-builder'
import { counterBand } from './_effects.js'

const block0 = (id, type, props) => ({ id, type, props, children: {} })
const TOPBAR = block0('topbar', 'TopBarBlock', { message: '¡Creemos algo increíble!', email: 'hola@mayadesigns.com', phone: '(415) 555-0198', hours: 'Lun - Vie: 9:00 - 18:00', background: 'muted' })

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'light',
    brand: 'Maya Web Studio',
    links: 'Inicio | /\nServicios | /servicios\nTrabajo | /trabajo\nProceso | /proceso\nContacto | /contacto',
    ctaLabel: 'Hablemos',
    ctaHref: '/contacto',
    ctaVariant: 'solid',
    sticky: true,
    height: '64',
  },
  children: {},
}

const FOOTER = {
  id: 'footer',
  type: 'SiteFooterBlock',
  props: {
    tone: 'ink',
    brand: 'Maya Web Studio',
    tagline: 'Sitios web bonitos y funcionales para marcas que quieren crecer.',
    columns: 'Explorar | Explorar\nServicios | /servicios\nTrabajo | /trabajo\nProceso | /proceso\n---\nContacto | Contacto\nhola@mayadesigns.com | /contacto\n(415) 555-0198 | /contacto\nSan Diego, CA | /contacto\n---\nLegal | Legal\nAviso de privacidad | /\nTérminos y condiciones | /',
    copyright: `© ${new Date().getFullYear()} Maya Web Studio. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const REVEAL = { _animation: { preset: 'slide-up', duration: 700, delay: 0, easing: 'ease-out' }, _scrollReveal: true }
const block = (id, type, props, children = {}) => ({ id, type, props, children })
const reveal = (b) => ({ ...b, props: { ...b.props, ...REVEAL } })

const WORK_CARDS = 'Bloom & Wild | Tienda en línea | /trabajo\nNorthland Studio | Sitio de agencia creativa | /trabajo\nPure Balance | Sitio de bienestar | /trabajo\nOceanic | Landing de campaña | /trabajo\nLeaf & Co. | Catálogo de marca | /trabajo\nSundaze | Sitio de eventos | /trabajo'
const work = (props) => block('work', 'MayaWorkBlock', props)

const CLIENTS = 'oceanic\npaperplane\nleaf & co.\nnorthern\nsundaze\nhive digital'
const clients = () => block('clients', 'LogoCloudBlock', { title: 'Marcas que confían en mí', names: CLIENTS, background: 'white' })

const TESTIMONIALS = 'Jessica Miller|Fundadora, Bloom & Wild|5\nMaya transformó por completo nuestra presencia en línea. El sitio se ve increíble y funciona mejor que nunca.\n---\nDaniel Kim|CEO, Northland Studio|5\nCreativa, profesional y muy fácil de trabajar. La recomiendo a cualquier marca que quiera destacar en línea.\n---\nSofía Reyes|Dueña, Pure Balance|5\nEntendió mi negocio desde la primera llamada y entregó a tiempo un sitio que mis clientes aman.'
const notes = (title, highlight) => block('testimonials', 'MayaNotesBlock', { eyebrow: 'Clientes felices', title, highlight, testimonials: TESTIMONIALS })

const ticker = (items = 'Diseño web\nMarca\nTiendas en línea\nSEO\nUI/UX\nVelocidad', tone = 'yellow') => block('ticker', 'MayaTickerBlock', { items, tone })
const closing = (title, highlight) => block('cta', 'MayaClosingBlock', { eyebrow: '¿Tienes un proyecto en mente?', title, highlight, subtitle: 'Me encantará conocerlo. Envíame un mensaje y empecemos juntos.', ctaLabel: 'Enviar mensaje', ctaHref: '/contacto', email: 'hola@mayadesigns.com', phone: '(415) 555-0198', location: 'San Diego, CA' })
const pageHero = (props) => block('hero', 'MayaPageHeroBlock', props)

const PLANS = 'Inicial|750\nIdeal para proyectos pequeños\nSitio de 3 páginas\nDiseño adaptable a celular\nSEO básico\nFormulario de contacto\n---\nCrecimiento|1,350|Más popular\nPara negocios en crecimiento\nHasta 7 páginas\nDiseño personalizado\nOptimización SEO\nOptimización de velocidad\n30 días de soporte\n---\nPremium|2,200\nServicio completo listo para escalar\nHasta 15 páginas\nFunciones avanzadas\nTienda en línea\nSoporte prioritario\n60 días de soporte'
const packages = () => [block('pricing', 'MayaPlansBlock', { eyebrow: 'Paquetes', title: 'Simples, con gran', highlight: 'impacto', subtitle: 'Soluciones flexibles para negocios en cada etapa.', currency: '$', ctaLabel: 'Empezar', ctaHref: '/contacto', plans: PLANS })]

const NO_REVEAL = new Set(['topbar', 'navbar', 'hero', 'ticker', 'footer'])
const page = (rootIds, list) => ({ rootIds, blocks: Object.fromEntries(list.map((b) => [b.id, NO_REVEAL.has(b.id) || !rootIds.includes(b.id) ? b : reveal(b)])) })

const HERO_BG = { kind: 'gradient', angle: 180, from: '#DCEBFF', to: '#F5F9FF' }
// Home hero: handwritten tag, rotating headline (typewriter), copy and buttons on the left; portrait collage on the right.
const homeHero = () => [
  block('hero', 'SectionBlock', { paddingY: '12', paddingX: '6', background: HERO_BG, fullBleed: true }, { children: ['hero-grid'] }),
  block('hero-grid', 'GridBlock', { minItemWidth: 340, gap: '12' }, { children: ['hero-copy', 'hero-art'] }),
  block('hero-copy', 'ContainerBlock', { maxWidth: 'full', paddingX: '0', background: null }, { children: ['hero-tag', 'hero-type', 'hero-text', 'hero-btns'] }),
  block('hero-tag', 'MayaTagBlock', { text: 'Diseñadora web freelance', tone: 'yellow', align: 'left' }),
  block('hero-type', 'TypewriterBlock', { prefix: 'Diseño sitios web que', phrases: 'inspiran\nbrillan\nvenden\nenamoran', suffix: '', typeSpeed: 90, deleteSpeed: 45, pause: 1800, loop: true, color: 'primary', size: '3xl', align: 'left' }),
  block('hero-text', 'TextBlock', { text: 'Creo sitios web hermosos y fáciles de usar que ayudan a las marcas a destacar y crecer en línea.', size: 'lg', color: 'muted', maxWidth: '480px', paddingY: '4' }),
  block('hero-btns', 'GridBlock', { minItemWidth: 170, gap: '3' }, { children: ['hero-btn-1', 'hero-btn-2'] }),
  block('hero-btn-1', 'ButtonBlock', { label: 'Ver mi trabajo', href: '/trabajo', variant: 'solid', size: 'lg', color: 'primary', radius: 'pill', align: 'left' }),
  block('hero-btn-2', 'ButtonBlock', { label: 'Mis servicios', href: '/servicios', variant: 'outline', size: 'lg', color: 'fg', radius: 'pill', align: 'left' }),
  block('hero-art', 'MayaPortraitBlock', { imageSrc: '', imageAlt: '', badgeValue: '6+', badgeLabel: 'años creando webs', note: '¡Hola, soy Maya!', chipOne: 'UI/UX', chipTwo: 'Marca' }),
]

export const mayaTemplate = defineTemplate({
  id: 'atlas-maya',
  label: 'Maya Studio',
  description: 'Portafolio de diseñadora web freelance: alegre, con paquetes de precios, trabajos y testimonios.',
  category: 'portafolio',
  build() {
    return page(
      ['topbar', 'navbar', 'hero', 'ticker', 'stats', 'work', 'pricing', 'clients', 'testimonials', 'cta', 'footer'],
      [
        TOPBAR,
        NAVBAR,
        ...homeHero(),
        ticker(),
        ...counterBand('stats', [[6, '+', 'Años de experiencia'], [120, '+', 'Proyectos entregados'], [98, '%', 'Clientes satisfechos']]),
        work({ eyebrow: 'Trabajo seleccionado', title: 'Algunos de mis', highlight: 'favoritos', subtitle: 'Cada proyecto es único. Estos son algunos de los que más me enorgullecen.', projects: WORK_CARDS.split('\n').slice(0, 3).join('\n') }),
        ...packages(),
        clients(),
        notes('Resultados', 'reales'),
        closing('Hagamos algo', 'increíble'),
        FOOTER,
      ],
    )
  },
})

export const mayaSitePages = [
  {
    id: 'servicios', label: 'Servicios', routePath: '/servicios', description: 'Servicios y paquetes de diseño web.',
    build: () => page(['topbar', 'navbar', 'hero', 'services', 'ticker', 'pricing', 'cta', 'footer'], [
      TOPBAR,
      NAVBAR,
      pageHero({ eyebrow: 'Servicios y paquetes', title: 'Todo lo que tu sitio', highlight: 'necesita', subtitle: 'Desde el diseño hasta la puesta en marcha, me encargo de cada detalle.' }),
      block('services', 'ServicesGridBlock', { eyebrow: 'Qué hago', title: 'Diseño con propósito', subtitle: '', columns: '3', services: 'Diseño web\nSitios a la medida de tu marca, claros y fáciles de navegar.\n---\nTiendas en línea\nCatálogo, carrito y pagos para vender desde el primer día.\n---\nOptimización SEO\nTu sitio listo para que te encuentren en buscadores.\n---\nIdentidad visual\nLogotipo, paleta y tipografías coherentes con tu marca.\n---\nMantenimiento\nActualizaciones, respaldos y soporte continuo.\n---\nCapacitación\nAprende a editar tu sitio con confianza.', cardStyle: 'bordered', align: 'left' }),
      ticker('Identidad\nDiseño web\nTiendas\nSEO\nCapacitación\nSoporte', 'blue'),
      ...packages(),
      closing('Elige tu paquete y', 'empecemos'),
      FOOTER,
    ]),
  },
  {
    id: 'trabajo', label: 'Trabajo', routePath: '/trabajo', description: 'Proyectos recientes.',
    build: () => page(['topbar', 'navbar', 'hero', 'work', 'clients', 'testimonials', 'cta', 'footer'], [
      TOPBAR,
      NAVBAR,
      pageHero({ eyebrow: 'Portafolio', title: 'Proyectos que me', highlight: 'enorgullecen', subtitle: 'Marcas de distintos sectores que confiaron en mí para crecer en línea.' }),
      work({ eyebrow: 'Casos', title: 'Trabajo', highlight: 'reciente', subtitle: '', projects: WORK_CARDS }),
      clients(),
      notes('Lo que dicen de', 'trabajar conmigo'),
      closing('¿Tu proyecto será el', 'siguiente?'),
      FOOTER,
    ]),
  },
  {
    id: 'proceso', label: 'Proceso', routePath: '/proceso', description: 'Cómo trabajamos juntos.',
    build: () => page(['topbar', 'navbar', 'hero', 'steps', 'faq', 'cta', 'footer'], [
      TOPBAR,
      NAVBAR,
      pageHero({ eyebrow: 'Mi proceso', title: 'Trabajar conmigo es', highlight: 'simple', subtitle: 'Un proceso claro, con entregas definidas y comunicación constante.' }),
      block('steps', 'FeaturesSectionBlock', { eyebrow: 'Paso a paso', title: 'De la idea al lanzamiento', subtitle: '', layout: 'grid-3', iconStyle: 'number', background: 'white', features: 'Descubrimiento\nNos conocemos, definimos objetivos y aterrizamos el alcance.\n---\nDiseño\nTe presento propuestas visuales y afinamos juntos cada detalle.\n---\nDesarrollo\nConstruyo el sitio, lo pruebo en todos los dispositivos y lo optimizo.\n---\nLanzamiento\nPublicamos, medimos y te acompaño durante los primeros días.\n---\nSoporte\nResuelvo dudas y hago ajustes durante el periodo incluido.\n---\nCrecimiento\nPlanificamos mejoras para seguir creciendo.' }),
      block('faq', 'FeaturesSectionBlock', { eyebrow: 'Preguntas frecuentes', title: 'Antes de empezar', subtitle: '', layout: 'list', iconStyle: 'arrow', background: 'muted', features: '¿Cuánto tarda un proyecto?\nUn sitio de 3 páginas toma de 2 a 3 semanas; uno de 7 páginas, de 4 a 5.\n---\n¿Puedo editar el sitio yo misma?\nSí, te dejo todo listo y te enseño a hacerlo.\n---\n¿Qué necesito para empezar?\nTu logotipo, textos e imágenes si los tienes; si no, te ayudo a conseguirlos.' }),
      closing('Cuéntame sobre tu', 'proyecto'),
      FOOTER,
    ]),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', description: 'Canales de contacto.',
    build: () => page(['topbar', 'navbar', 'hero', 'channels', 'form', 'footer'], [
      TOPBAR,
      NAVBAR,
      pageHero({ eyebrow: 'Contacto', title: '¿Tienes un proyecto', highlight: 'en mente?', subtitle: 'Me encantaría escucharlo. Respondo en menos de 24 horas.' }),
      block('channels', 'FeaturesSectionBlock', { eyebrow: 'Hablemos', title: 'Elige cómo prefieres escribirme', subtitle: '', layout: 'grid-3', iconStyle: 'arrow', background: 'white', features: 'Correo electrónico\nhola@mayadesigns.com — cuéntame tu idea y te respondo pronto.\n---\nTeléfono\n(415) 555-0198 — de lunes a viernes de 9:00 a 18:00.\n---\nUbicación\nSan Diego, California — reuniones en línea o en persona.' }),
      block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
      FOOTER,
    ]),
  },
]
