import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const block0 = (id, type, props) => ({ id, type, props, children: {} })
const HERO_TINT = { kind: 'gradient', angle: 180, from: '#DCEBFF', to: '#FFF8E8' }

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
  type: 'FooterBlock',
  props: {
    variant: 'dark',
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

const hero = (props) => block('hero', 'HeroBlock', {
  variant: 'centered', ctaVariant: 'solid', imageSrc: '', background: HERO_TINT, align: 'center',
  paddingY: '16', contentMaxWidth: '768px', shadow: 'none', ...props,
})

const WORK = 'Bloom & Wild\nTienda en línea para una florería artesanal con checkout en un paso.\n---\nNorthland Studio\nSitio de agencia creativa con portafolio y casos de estudio.\n---\nPure Balance\nSitio de bienestar con reservas y blog de contenido.\n---\nOceanic\nMarca de viajes con landing de campaña y captación de contactos.\n---\nLeaf & Co.\nCatálogo para una marca de plantas y decoración.\n---\nSundaze\nSitio de eventos con agenda y venta de boletos.'

const WORK_CARDS = 'Bloom & Wild | Tienda en línea | /trabajo\n---\nNorthland Studio | Sitio de agencia creativa | /trabajo\n---\nPure Balance | Sitio de bienestar | /trabajo\n---\nOceanic | Landing de campaña | /trabajo\n---\nLeaf & Co. | Catálogo de marca | /trabajo\n---\nSundaze | Sitio de eventos | /trabajo'
const work = (props) => block('work', 'ProjectCardsBlock', { columns: '3', background: 'white', ...props })

const CLIENTS = 'oceanic\npaperplane\nleaf & co.\nnorthern\nsundaze\nhive digital'

const TESTIMONIALS = 'Jessica Miller|Fundadora, Bloom & Wild|5\nMaya transformó por completo nuestra presencia en línea. El sitio se ve increíble y funciona mejor que nunca.\n---\nDaniel Kim|CEO, Northland Studio|5\nCreativa, profesional y muy fácil de trabajar. La recomiendo a cualquier marca que quiera destacar en línea.\n---\nSofía Reyes|Dueña, Pure Balance|5\nEntendió mi negocio desde la primera llamada y entregó a tiempo un sitio que mis clientes aman.'

const plan = (id, props) => block(id, 'PricingBlock', { currency: '$', period: '', ctaLabel: 'Empezar', ctaHref: '/contacto', radius: 'lg', shadow: 'md', ...props })

// Heading plus three plans side by side, inside a section with the given background.
const packages = (background) => [
  block('pricing', 'SectionBlock', { paddingY: '12', background }, { children: ['pricing-head', 'pricing-sub', 'pricing-grid'] }),
  block('pricing-head', 'HeadingBlock', { text: 'Paquetes simples, gran impacto', level: 'h2', align: 'center' }),
  block('pricing-sub', 'TextBlock', { text: 'Soluciones flexibles para negocios en cada etapa.', align: 'center' }),
  block('pricing-grid', 'GridBlock', { minItemWidth: 260, gap: '4' }, { children: ['plan-1', 'plan-2', 'plan-3'] }),
  plan('plan-1', { plan: 'Inicial', price: '750', description: 'Ideal para proyectos pequeños', features: 'Sitio de 3 páginas\nDiseño adaptable a celular\nSEO básico\nFormulario de contacto' }),
  plan('plan-2', { plan: 'Crecimiento', price: '1,350', description: 'Para negocios en crecimiento', features: 'Hasta 7 páginas\nDiseño personalizado\nOptimización SEO\nOptimización de velocidad\n30 días de soporte', highlighted: true, badge: 'Más popular' }),
  plan('plan-3', { plan: 'Premium', price: '2,200', description: 'Servicio completo listo para escalar', features: 'Hasta 15 páginas\nFunciones avanzadas\nTienda en línea\nSoporte prioritario\n60 días de soporte' }),
]

const cta = (title) => block('cta', 'CtaBannerBlock', {
  eyebrow: '¿Tienes un proyecto en mente?', title, subtitle: 'Me encantará conocerlo. Envíame un mensaje y empecemos juntos.',
  ctaLabel: 'Enviar mensaje', ctaHref: '/contacto', ctaSecondLabel: 'Ver mi trabajo', ctaSecondHref: '/trabajo', variant: 'gradient-primary', size: 'large', align: 'center',
})

const clients = () => block('clients', 'LogoCloudBlock', { title: 'Marcas que confían en mí', names: CLIENTS, background: 'white' })
const testimonials = (title) => block('testimonials', 'TestimonialsBlock', { eyebrow: 'Clientes felices', title, columns: '3', background: 'muted', testimonials: TESTIMONIALS })

const showcase = (props) => block('hero', 'ShowcaseHeroBlock', { badgeValue: '6+', badgeLabel: 'Años de experiencia', ...props })

const NO_REVEAL = new Set(['topbar', 'navbar', 'hero', 'footer'])
const page = (rootIds, list) => ({ rootIds, blocks: Object.fromEntries(list.map((b) => [b.id, NO_REVEAL.has(b.id) || !rootIds.includes(b.id) ? b : reveal(b)])) })

export const mayaTemplate = defineTemplate({
  id: 'atlas-maya',
  label: 'Maya Studio',
  description: 'Portafolio de diseñadora web freelance: alegre, con paquetes de precios, trabajos y testimonios.',
  category: 'portafolio',
  build() {
    return page(
      ['topbar', 'navbar', 'hero', 'stats', 'work', 'pricing', 'clients', 'testimonials', 'cta', 'footer'],
      [
        TOPBAR,
        NAVBAR,
        showcase({
          eyebrow: 'Diseñadora web freelance',
          title: 'Diseño sitios web',
          highlight: 'que inspiran y brillan',
          subtitle: 'Creo sitios web hermosos y fáciles de usar que ayudan a las marcas a destacar y crecer en línea.',
          ctaLabel: 'Ver mi trabajo', ctaHref: '/trabajo', ctaSecondLabel: 'Mis servicios', ctaSecondHref: '/servicios',
        }),
        block('stats', 'StatsBlock', { eyebrow: '', title: '', stats: '6+\nAños de experiencia\nDiseñando para marcas\n---\n120+\nProyectos entregados\nEn distintos sectores\n---\n98%\nClientes satisfechos\nQue vuelven a trabajar conmigo', background: 'white', align: 'center' }),
        work({ eyebrow: 'Trabajo seleccionado', title: 'Algunos de mis favoritos', subtitle: 'Cada proyecto es único. Estos son algunos de los que más me enorgullecen.', projects: WORK_CARDS.split('\n---\n').slice(0, 3).join('\n---\n') }),
        ...packages('muted'),
        clients(),
        testimonials('Resultados reales'),
        cta('Hagamos algo increíble juntos'),
        FOOTER,
      ],
    )
  },
})

export const mayaSitePages = [
  {
    id: 'servicios', label: 'Servicios', routePath: '/servicios', description: 'Servicios y paquetes de diseño web.',
    build: () => page(['topbar', 'navbar', 'hero', 'services', 'pricing', 'cta', 'footer'], [
      TOPBAR,
      NAVBAR,
      hero({ eyebrow: 'Servicios y paquetes', title: 'Todo lo que tu sitio necesita', subtitle: 'Desde el diseño hasta la puesta en marcha, me encargo de cada detalle.', ctaLabel: 'Solicitar cotización', ctaHref: '/contacto', titleSize: '2xl', minHeight: '360px' }),
      block('services', 'ServicesGridBlock', { eyebrow: 'Qué hago', title: 'Diseño con propósito', subtitle: '', columns: '3', services: 'Diseño web\nSitios a la medida de tu marca, claros y fáciles de navegar.\n---\nTiendas en línea\nCatálogo, carrito y pagos para vender desde el primer día.\n---\nOptimización SEO\nTu sitio listo para que te encuentren en buscadores.\n---\nIdentidad visual\nLogotipo, paleta y tipografías coherentes con tu marca.\n---\nMantenimiento\nActualizaciones, respaldos y soporte continuo.\n---\nCapacitación\nAprende a editar tu sitio con confianza.', cardStyle: 'bordered', align: 'left' }),
      ...packages('muted'),
      cta('Elige tu paquete y empecemos'),
      FOOTER,
    ]),
  },
  {
    id: 'trabajo', label: 'Trabajo', routePath: '/trabajo', description: 'Proyectos recientes.',
    build: () => page(['topbar', 'navbar', 'hero', 'work', 'clients', 'testimonials', 'cta', 'footer'], [
      TOPBAR,
      NAVBAR,
      hero({ eyebrow: 'Portafolio', title: 'Proyectos que me enorgullecen', subtitle: 'Marcas de distintos sectores que confiaron en mí para crecer en línea.', ctaLabel: '', titleSize: '2xl', minHeight: '360px' }),
      work({ eyebrow: 'Casos', title: 'Trabajo reciente', projects: WORK_CARDS }),
      clients(),
      testimonials('Lo que dicen de trabajar conmigo'),
      cta('¿Tu proyecto sería el siguiente?'),
      FOOTER,
    ]),
  },
  {
    id: 'proceso', label: 'Proceso', routePath: '/proceso', description: 'Cómo trabajamos juntos.',
    build: () => page(['topbar', 'navbar', 'hero', 'steps', 'faq', 'cta', 'footer'], [
      TOPBAR,
      NAVBAR,
      hero({ eyebrow: 'Mi proceso', title: 'Trabajar conmigo es simple', subtitle: 'Un proceso claro, con entregas definidas y comunicación constante.', ctaLabel: '', titleSize: '2xl', minHeight: '360px' }),
      block('steps', 'FeaturesSectionBlock', { eyebrow: 'Paso a paso', title: 'De la idea al lanzamiento', subtitle: '', layout: 'grid-3', iconStyle: 'number', background: 'white', features: 'Descubrimiento\nNos conocemos, definimos objetivos y aterrizamos el alcance.\n---\nDiseño\nTe presento propuestas visuales y afinamos juntos cada detalle.\n---\nDesarrollo\nConstruyo el sitio, lo pruebo en todos los dispositivos y lo optimizo.\n---\nLanzamiento\nPublicamos, medimos y te acompaño durante los primeros días.\n---\nSoporte\nResuelvo dudas y hago ajustes durante el periodo incluido.\n---\nCrecimiento\nPlanificamos mejoras para seguir creciendo.' }),
      block('faq', 'FeaturesSectionBlock', { eyebrow: 'Preguntas frecuentes', title: 'Antes de empezar', subtitle: '', layout: 'list', iconStyle: 'arrow', background: 'muted', features: '¿Cuánto tarda un proyecto?\nUn sitio de 3 páginas toma de 2 a 3 semanas; uno de 7 páginas, de 4 a 5.\n---\n¿Puedo editar el sitio yo misma?\nSí, te dejo todo listo y te enseño a hacerlo.\n---\n¿Qué necesito para empezar?\nTu logotipo, textos e imágenes si los tienes; si no, te ayudo a conseguirlos.' }),
      cta('Cuéntame sobre tu proyecto'),
      FOOTER,
    ]),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', description: 'Canales de contacto.',
    build: () => page(['topbar', 'navbar', 'hero', 'channels', 'footer'], [
      TOPBAR,
      NAVBAR,
      hero({ eyebrow: 'Contacto', title: '¿Tienes un proyecto en mente?', subtitle: 'Me encantaría escucharlo. Respondo en menos de 24 horas.', ctaLabel: '', titleSize: '2xl', minHeight: '360px' }),
      block('channels', 'FeaturesSectionBlock', { eyebrow: 'Hablemos', title: 'Elige cómo prefieres escribirme', subtitle: '', layout: 'grid-3', iconStyle: 'arrow', background: 'white', features: 'Correo electrónico\nhola@mayadesigns.com — cuéntame tu idea y te respondo pronto.\n---\nTeléfono\n(415) 555-0198 — de lunes a viernes de 9:00 a 18:00.\n---\nUbicación\nSan Diego, California — reuniones en línea o en persona.' }),
      FOOTER,
    ]),
  },
]
