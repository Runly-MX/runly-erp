import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'dark',
    brand: 'Nexus Studio',
    links: 'Inicio | /\nServicios | /servicios\nPortafolio | /portafolio\nEquipo | /equipo\nContacto | /contacto',
    ctaLabel: 'Hablemos',
    ctaHref: '/contacto',
    ctaVariant: 'solid',
    sticky: true,
    height: '68',
  },
  children: {},
}

const FOOTER = {
  id: 'footer',
  type: 'SiteFooterBlock',
  props: {
    tone: 'ink',
    brand: 'Nexus Studio',
    tagline: 'Creatividad, estrategia y tecnología al servicio de tu marca.',
    columns: 'Servicios | Servicios\nBranding | /servicios\nDiseño Web | /servicios\nMarketing Digital | /servicios\nDesarrollo | /servicios\n---\nAgencia | Agencia\nNosotros | /\nPortafolio | /portafolio\nEquipo | /equipo\n---\nContacto | Contacto\nHablemos | /contacto\nLinkedIn | /\nInstagram | /',
    copyright: `© ${new Date().getFullYear()} Nexus Studio. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const block = (id, type, props) => ({ id, type, props, children: {} })
const SEP = '\n---\n'

const WORK = [
  'Aurora | Identidad y web | 2025 | +180% tráfico\nMarca de bienestar con un sistema visual propio y un sitio que convierte.',
  'Ruta | Producto digital | 2025 | 40k usuarios\nApp de logística urbana pensada para el día a día de los repartidores.',
  'Origen | Campaña | 2024 | 3x prospectos\nContenido y performance para una marca de consumo en crecimiento.',
  'Nómada | E-commerce | 2024 | +62% ventas\nTienda en línea con pago en un solo paso y catálogo editorial.',
  'Marea | Identidad | 2023 | 12 países\nRediseño completo de una marca de bebidas con presencia regional.',
  'Faro | Sitio y estrategia | 2023 | 2x retención\nPlataforma educativa construida desde cero con enfoque en comunidad.',
]

const VOICES = [
  'Ricardo Blanco | CEO, FinTech México\nNexus transformó nuestra presencia digital. En tres meses duplicamos el tráfico orgánico y subimos las conversiones 180%.',
  'Cristina Pacheco | Marketing, Retailmex\nEl rebrand fue exactamente lo que necesitábamos: moderno, coherente y con una identidad poderosa.',
  'Samuel Orozco | Fundador, EduTech\nEntregaron a tiempo, dentro del presupuesto y con una calidad excepcional.',
].join(SEP)

const SERVICES = [
  'Estrategia de marca\nPosicionamiento, narrativa y un plan claro de crecimiento medible.',
  'Identidad visual\nLogotipo, sistema gráfico y un manual vivo que tu equipo sí usa.',
  'Sitios web y producto\nDiseño y desarrollo rápido, accesible y listo para convertir.',
  'Contenido y campañas\nSocial, video y performance con una sola voz de marca.',
]

const TEAM = [
  'Andrés Villanueva | Dirección creativa\nMás de 12 años liderando identidad y diseño digital en Europa y Latinoamérica.',
  'Valeria Cruz | Estrategia\nMarketing digital y consultoría de marca en firmas globales.',
  'Jorge Medina | Desarrollo\nArquitecturas web limpias, rápidas y escalables.',
  'Natalia Ríos | Diseño UX\nInvestigación de usuarios y diseño centrado en la conversión.',
].join(SEP)

const hero = (props) => block('hero', 'AgencyHeroBlock', { eyebrow: '', tag: '', highlight: '', ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '', size: 'compact', ...props })
const closing = (props) => block('cta', 'AgencyClosingBlock', { eyebrow: 'Siguiente paso', title: 'Tu marca merece algo', highlight: 'inolvidable.', email: 'hola@nexusstudio.com', ctaLabel: 'Iniciar proyecto', ctaHref: '/contacto', ctaSecondLabel: '', ctaSecondHref: '', ...props })

export const agenciaTemplate = defineTemplate({
  id: 'atlas-agencia',
  label: 'Agencia & Portafolio',
  description: 'Estudio creativo atrevido: tipografía gigante, marquesina cinética, casos como pósters y fondo casi negro con acento eléctrico.',
  category: 'agencia',
  build() {
    return {
      rootIds: ['navbar', 'hero', 'marquee', 'work', 'services', 'facts', 'voices', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: block('hero', 'AgencyHeroBlock', { eyebrow: 'Estudio creativo', tag: 'Agenda abierta para nuevos proyectos', title: 'Marcas que no pasan', highlight: 'desapercibidas', subtitle: 'Estrategia, identidad y producto digital para empresas que quieren ser recordadas, no solo vistas.', ctaLabel: 'Ver trabajo', ctaHref: '/portafolio', ctaSecondLabel: 'Hablemos', ctaSecondHref: '/contacto', size: 'full' }),
        marquee: block('marquee', 'AgencyMarqueeBlock', { items: 'Estrategia · Identidad · Sitios web · Producto digital · Contenido · Performance', speed: 'normal' }),
        work: block('work', 'AgencyWorkBlock', { eyebrow: 'Trabajo selecto', title: 'Casos que se notan', projects: WORK.slice(0, 3).join(SEP), ctaLabel: 'Ver todo el portafolio', ctaHref: '/portafolio' }),
        services: block('services', 'AgencyServicesBlock', { eyebrow: 'Servicios', title: 'Lo que hacemos mejor', showArrow: true, services: SERVICES.join(SEP) }),
        facts: block('facts', 'AgencyFactsBlock', { stats: '200+ | Proyectos entregados\n50+ | Clientes activos\n98% | Retención\n15 | Premios' }),
        voices: block('voices', 'AgencyVoicesBlock', { eyebrow: 'Clientes', title: 'Lo que dicen de nosotros', voices: VOICES }),
        cta: closing({}),
        footer: FOOTER,
      },
    }
  },
})

export const agenciaSitePages = [
  {
    id: 'servicios',
    label: 'Servicios',
    routePath: '/servicios',
    required: false,
    description: 'Servicios y especialidades de la agencia.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'services', 'process', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Lo que hacemos', title: 'Servicios para marcas', highlight: 'con ambición', subtitle: 'Estrategia, diseño y tecnología trabajando en un solo equipo.' }),
        services: block('services', 'AgencyServicesBlock', { eyebrow: 'Especialidades', title: 'Todo para tu marca digital', showArrow: true, services: [...SERVICES, 'Consultoría\nAuditoría de tu presencia digital y una hoja de ruta accionable.'].join(SEP) }),
        process: block('process', 'AgencyServicesBlock', { eyebrow: 'Proceso', title: 'Cómo trabajamos', showArrow: false, services: ['Descubrimiento\nEntendemos tu negocio, tu audiencia y tus objetivos.', 'Estrategia\nPlan con tiempos, entregables y métricas claras.', 'Diseño\nPrototipos validados contigo antes de producir.', 'Desarrollo y lanzamiento\nCódigo limpio, pruebas rigurosas y acompañamiento después.'].join(SEP) }),
        cta: closing({}),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'portafolio',
    label: 'Portafolio',
    routePath: '/portafolio',
    required: false,
    description: 'Proyectos y trabajos realizados.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'work', 'voices', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Portafolio', title: 'Trabajo que', highlight: 'habla fuerte', subtitle: 'Una selección de proyectos de los que estamos más orgullosos.' }),
        work: block('work', 'AgencyWorkBlock', { eyebrow: 'Proyectos recientes', title: 'Seis historias', projects: WORK.join(SEP), ctaLabel: '', ctaHref: '' }),
        voices: block('voices', 'AgencyVoicesBlock', { eyebrow: 'Clientes', title: 'Lo que dicen', voices: VOICES }),
        cta: closing({ title: '¿Tu proyecto será', highlight: 'el siguiente?' }),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'equipo',
    label: 'Equipo',
    routePath: '/equipo',
    required: false,
    description: 'El equipo creativo detrás de la agencia.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'team', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Equipo', title: 'Personas', highlight: 'detrás de Nexus', subtitle: 'Diseñadores, estrategas y desarrolladores apasionados por crear cosas extraordinarias.' }),
        team: block('team', 'AgencyTeamBlock', { eyebrow: 'Equipo creativo', title: 'Las mentes', team: TEAM }),
        cta: closing({ title: '¿Quieres trabajar', highlight: 'con nosotros?' }),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'contacto',
    label: 'Contacto',
    routePath: '/contacto',
    required: false,
    description: 'Inicia tu proyecto o envíanos un mensaje.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'channels', 'formwrap', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Contacto', title: 'Hablemos de', highlight: 'tu proyecto', subtitle: 'Respondemos en menos de 24 horas con una propuesta sin compromiso.' }),
        channels: block('channels', 'AgencyServicesBlock', { eyebrow: 'Canales', title: 'Elige cómo escribirnos', showArrow: false, services: ['Correo\nhola@nexusstudio.com para proyectos, propuestas y consultas.', 'WhatsApp\n+52 55 0000 0000 para consultas rápidas y proyectos activos.', 'LinkedIn\nSíguenos para ver proyectos recientes y novedades del equipo.'].join(SEP) }),
        // A light panel keeps the injected form readable on the dark page.
        formwrap: { id: 'formwrap', type: 'SectionBlock', props: { paddingY: '16', background: 'white' }, children: { children: ['form'] } },
        form: block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
        footer: FOOTER,
      },
    }),
  },
]
