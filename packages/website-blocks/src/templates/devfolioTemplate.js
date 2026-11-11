import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const nav = (active) => ({ id: 'navbar', type: 'DevNavbarBlock', props: { brand: 'DR', links: 'Inicio | /\nSobre mí | /sobre-mi\nProyectos | /proyectos\nExperiencia | /experiencia\nContacto | /contacto', active, ctaLabel: 'Hablemos', ctaHref: '/contacto' }, children: {} })
const FOOTER = {
  id: 'footer',
  type: 'SiteFooterBlock',
  props: {
    tone: 'ink', brand: 'Daniel Ramos', tagline: 'Ingeniero de software y desarrollador full stack. Código limpio, producto claro.',
    columns: 'Explorar\nInicio | /\nSobre mí | /sobre-mi\nProyectos | /proyectos\nExperiencia | /experiencia\n---\nContacto\nhola@example.com | mailto:hola@example.com\nEscríbeme | /contacto\n---\nEn la red\nGitHub | https://github.com/example\nLinkedIn | https://www.linkedin.com/in/example',
    copyright: `© ${new Date().getFullYear()} Daniel Ramos. Hecho a mano, con cariño por los detalles.`, showBrand: true, backToTop: true,
  },
  children: {},
}

const block = (id, type, props, children = {}) => ({ id, type, props, children })
const page = (...blocks) => ({ rootIds: blocks.map((b) => b.id), blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) })
const band = () => block('contact', 'DevContactBlock', {})
const pageHero = (props) => block('hero', 'DevPageHeroBlock', props)

export const devfolioTemplate = defineTemplate({
  id: 'atlas-devfolio',
  label: 'Portafolio Dev',
  description: 'Portafolio personal para ingenieros y desarrolladores: papel cálido, un solo acento naranja e ilustraciones de línea dibujadas a mano.',
  category: 'portafolio-dev',
  build() {
    return page(
      nav('/'),
      block('hero', 'DevHeroBlock', {}),
      block('about', 'DevAboutBlock', {}),
      block('skills', 'DevSkillsBlock', {}),
      block('work', 'DevWorkBlock', {}),
      block('timeline', 'DevTimelineBlock', {}),
      block('process', 'DevProcessBlock', {}),
      band(),
      FOOTER,
    )
  },
})

export const devfolioSitePages = [
  {
    id: 'sobre-mi', label: 'Sobre mí', routePath: '/sobre-mi', required: false, description: 'Historia, valores y herramientas de Daniel Ramos.',
    build: () => page(
      nav('/sobre-mi'),
      pageHero({ path: '~/sobre-mi', title: 'Una persona', highlight: 'detrás del código', subtitle: 'Ingeniero de software con ojo de diseñador y paciencia de artesano. Esta es mi historia, lo que me importa y cómo trabajo.', scene: 'ventana' }),
      block('story', 'DevStoryBlock', {}),
      block('values', 'DevValuesBlock', {}),
      block('about', 'DevAboutBlock', { eyebrow: 'rasgos', title: 'Así me describen', linkLabel: '', scene: 'puf' }),
      block('nowuses', 'DevNowUsesBlock', {}),
      band(),
      FOOTER,
    ),
  },
  {
    id: 'proyectos', label: 'Proyectos', routePath: '/proyectos', required: false, description: 'Proyectos seleccionados y un caso de estudio.',
    build: () => page(
      nav('/proyectos'),
      pageHero({ path: '~/proyectos', title: 'Cosas que', highlight: 'he construido', subtitle: 'Una selección de productos en los que he trabajado: del primer boceto al despliegue, con foco en que funcionen bien.', scene: 'escritorio' }),
      block('work', 'DevWorkBlock', {
        eyebrow: 'portafolio', title: 'Todos los proyectos', linkLabel: '', showFilters: true, allLabel: 'Todos',
        projects: 'Lumen Académico | Plataforma de cursos en línea con analítica de progreso y pagos integrados. | Next.js, TypeScript, Tailwind | monitor | Web | #\nPanel Meridiano | Tablero de visualización con resultados escolares del periodo 2016-2025. | Next.js, Recharts, Node.js | laptop | Datos | #\nAula Segura | App de aprendizaje con contenido protegido y accesos por rol. | Next.js, MongoDB, Stripe | phone | Móvil | #\nRuta Viva | Seguimiento de entregas en tiempo real para una flotilla urbana. | React, Node.js, WebSockets | phone | Móvil | #\nCosecha Abierta | Mercado en línea para productores locales, con inventario y pedidos. | Next.js, PostgreSQL, Stripe | laptop | Web | #\nSignal Kit | Biblioteca de componentes accesibles con documentación interactiva. | React, TypeScript, Storybook | monitor | Datos | #',
      }),
      block('case', 'DevCaseBlock', {}),
      band(),
      FOOTER,
    ),
  },
  {
    id: 'experiencia', label: 'Experiencia', routePath: '/experiencia', required: false, description: 'Trayectoria, proceso de trabajo y nivel por habilidad.',
    build: () => page(
      nav('/experiencia'),
      pageHero({ path: '~/experiencia', title: 'Nueve años', highlight: 'aprendiendo en público', subtitle: 'Mi trayectoria, la forma en que trabajo y un mapa honesto de lo que domino y de lo que sigo aprendiendo.', scene: 'puf' }),
      block('timeline', 'DevTimelineBlock', {
        eyebrow: 'trayectoria', title: 'Dónde he trabajado', layout: 'vertical',
        items: '2024 - Actualidad | Desarrollador web | Estudio Brújula | Construyo aplicaciones web escalables y paneles de administración para clientes de salud y educación. | briefcase\n2023 - 2024 | Practicante full stack | Proyectos varios | Trabajé en proyectos reales y APIs con el stack MERN, con revisiones de código semanales. | window\n2021 - 2023 | Desarrollador freelance | Independiente | Entregué sitios y soluciones a medida para emprendimientos y negocios locales. | user\n2019 - 2021 | Soporte técnico y automatización | Red Escolar del Occidente | Automaticé reportes y procesos repetitivos con scripts, y aprendí a escuchar a quien usa el software. | code',
      }),
      block('process', 'DevProcessBlock', {}),
      block('bars', 'DevSkillBarsBlock', {}),
      band(),
      FOOTER,
    ),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', required: false, description: 'Formulario, canales de contacto y disponibilidad.',
    build: () => page(
      nav('/contacto'),
      pageHero({ path: '~/contacto', title: 'Hablemos de', highlight: 'tu proyecto', subtitle: 'Cuéntame qué quieres construir o qué problema quieres resolver. Respondo cada mensaje personalmente.', scene: 'ventana' }),
      block('channels', 'DevChannelsBlock', {}),
      block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderé muy pronto.', buttonLabel: 'Enviar mensaje' }),
      FOOTER,
    ),
  },
]
