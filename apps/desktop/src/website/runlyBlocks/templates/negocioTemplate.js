import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'light',
    brand: 'Empresa',
    links: 'Inicio | /\nServicios | /servicios\nNosotros | /nosotros\nContacto | /contacto',
    ctaLabel: 'Solicitar diagnóstico',
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
    variant: 'light',
    brand: 'Empresa',
    tagline: 'Tu aliado estratégico para el crecimiento empresarial.',
    columns: 'Servicios | Servicios\nConsultoría | /servicios\nOptimización | /servicios\nCapacitación | /servicios\nTransformación Digital | /servicios\n---\nEmpresa | Empresa\nNosotros | /nosotros\nCasos de éxito | /\nContacto | /contacto\n---\nLegal | Legal\nPolítica de privacidad | /\nTérminos | /',
    copyright: `© ${new Date().getFullYear()} Empresa. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const block = (id, type, props) => ({ id, type, props, children: {} })
const SEP = '\n---\n'

const WHY = [
  'Metodología comprobada | Validada\nProcesos aplicados en más de 200 proyectos para obtener resultados consistentes y medibles.',
  'Equipo senior dedicado\nTu cuenta la atienden profesionales con experiencia real en tu industria, no perfiles junior.',
  'Comunicación transparente\nReportes semanales, tablero en tiempo real y contacto directo con tu equipo asignado.',
  'Sin contratos forzosos | Mes a mes\nCreemos tanto en el trabajo que no necesitamos atarte con contratos largos.',
].join(SEP)

const SERVICES = [
  'Consultoría estratégica | Desde 4 h/mes\nAnálisis de tu modelo de negocio con un plan de acción priorizado y métricas de seguimiento.',
  'Optimización de procesos | Hasta -30% costos\nIdentificamos cuellos de botella, eliminamos ineficiencias y automatizamos tareas repetitivas.',
  'Capacitación empresarial | Presencial o remota\nProgramas a la medida para equipos comerciales, directivos y operativos.',
  'Transformación digital | 3 a 9 meses\nDesde la estrategia hasta la implementación de herramientas tecnológicas adecuadas.',
  'Gestión de proyectos | Metodologías ágiles\nDirigimos proyectos complejos con entregas en tiempo, forma y presupuesto.',
  'Auditoría financiera | Revisión integral\nRecomendaciones concretas para optimizar recursos y aumentar la rentabilidad.',
].join(SEP)

const PROCESS = [
  'Diagnóstico | Semanas 1-2\nEntrevistas, análisis de datos y un mapa claro de oportunidades.',
  'Plan | Semana 3\nIniciativas priorizadas con responsables, fechas y métricas.',
  'Implementación | Meses 2-4\nEjecución acompañada con tablero de seguimiento semanal.',
  'Optimización | Mes 5 en adelante\nMedición, ajustes y transferencia del conocimiento a tu equipo.',
].join(SEP)

const KPIS = '350+ | Empresas asesoradas\n$50M+ | En ahorros generados\n97% | Renovación de contratos\n10+ | Años en el mercado'

const CASES = [
  'Grupo Lozano | Industrial | -28% | costos operativos en 6 meses\nReestructuramos compras y logística sin sacrificar calidad ni tiempos de entrega.\nFernando Lozano, Director General',
  'Distribuidora Valdez | Distribución | -35% | costo financiero tras la reestructura\nOrdenamos la estructura financiera hasta acceder a mejores condiciones bancarias.\nMónica Valdez, CFO',
  'Tech Startup | Tecnología | Serie A | cerrada con operación ordenada\nAcompañamos del MVP a la ronda manteniendo el control de la operación.\nGustavo Aranda, CEO',
].join(SEP)

const ENGAGEMENT = {
  eyebrow: 'Modelos de trabajo', title: 'Elige cómo quieres trabajar con nosotros', subtitle: 'Precios claros desde el primer día, sin cargos ocultos.', highlight: '2', ctaLabel: 'Solicitar propuesta', ctaHref: '/contacto',
  models: 'Diagnóstico | Acompañamiento | Equipo dedicado', prices: 'Inversión | $18,000 único | $12,000 / mes | A medida',
  rows: 'Diagnóstico inicial | si | si | si\nConsultoría mensual | no | 16 horas | Ilimitada\nProyectos activos | no | 1 | Varios\nTablero de métricas | no | si | si\nCapacitación | no | Trimestral | Continua\nSLA de respuesta | no | no | si',
}

const TRUST = { title: 'Empresas que confían en nosotros', clients: 'Grupo Lozano · Distribuidora Valdez · NovaTech · Altiva · Ferrum', badges: 'ISO 9001 | Gestión de calidad\nNDA firmado | Confidencialidad total\nAuditoría anual | Procesos verificados' }

const hero = (props) => block('hero', 'BizHeroBlock', { eyebrow: '', highlight: '', ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '', proofs: '', panelLabel: '', panelValue: '', panelCaption: '', size: 'compact', ...props })
const closing = (props) => block('cta', 'BizClosingBlock', { eyebrow: 'Diagnóstico gratuito', title: '45 minutos que pueden cambiar tu empresa', subtitle: 'Analizamos tu situación y te decimos con honestidad si podemos ayudarte.', points: 'Sin costo ni compromiso\nRespuesta en menos de 24 horas\nPlan de acción por escrito', ctaLabel: 'Agendar sesión', ctaHref: '/contacto', ctaSecondLabel: '', ctaSecondHref: '', ...props })

export const negocioTemplate = defineTemplate({
  id: 'atlas-negocio',
  label: 'Negocio & Servicios',
  description: 'Consultoría y servicios B2B sobrios y orientados a datos: propuesta de valor clara, proceso, KPIs, casos de éxito y modelos de trabajo.',
  category: 'negocio',
  build() {
    return {
      rootIds: ['navbar', 'hero', 'trust', 'why', 'process', 'kpis', 'cases', 'engagement', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: block('hero', 'BizHeroBlock', { eyebrow: 'Consultoría para empresas', title: 'Decisiones claras, resultados', highlight: 'medibles.', subtitle: 'Acompañamos a empresas medianas a reducir costos, ordenar su operación y crecer con un plan que se puede ejecutar.', ctaLabel: 'Agendar diagnóstico', ctaHref: '/contacto', ctaSecondLabel: 'Ver servicios', ctaSecondHref: '/servicios', proofs: 'Sin contratos forzosos\nEquipo senior dedicado\nReportes semanales', panelLabel: 'Ahorro operativo promedio', panelValue: '-28%', panelCaption: 'En los primeros 6 meses de acompañamiento', size: 'full' }),
        trust: block('trust', 'BizTrustBlock', TRUST),
        why: block('why', 'BizPillarsBlock', { eyebrow: 'Por qué elegirnos', title: 'La ventaja de trabajar con nosotros', subtitle: 'Somos aliados estratégicos de tu crecimiento, no proveedores.', background: 'white', items: WHY }),
        process: block('process', 'BizProcessBlock', { eyebrow: 'Cómo trabajamos', title: 'Un proceso claro, de la idea al resultado', subtitle: 'Cada etapa tiene entregables, responsables y fechas acordadas desde el inicio.', steps: PROCESS }),
        kpis: block('kpis', 'BizKpiBandBlock', { eyebrow: 'Resultados', title: 'Una trayectoria respaldada por números', kpis: KPIS }),
        cases: block('cases', 'BizCasesBlock', { eyebrow: 'Casos de éxito', title: 'Resultados que otras empresas ya consiguieron', subtitle: '', cases: CASES }),
        engagement: block('engagement', 'BizEngagementBlock', ENGAGEMENT),
        cta: closing({}),
        footer: FOOTER,
      },
    }
  },
})

export const negocioSitePages = [
  {
    id: 'servicios',
    label: 'Servicios',
    routePath: '/servicios',
    required: false,
    description: 'Catálogo de servicios y modelos de trabajo.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'services', 'process', 'engagement', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Qué ofrecemos', title: 'Servicios diseñados para empresas como la tuya', subtitle: 'Cada servicio resuelve un problema real y genera valor medible desde el primer mes.', ctaLabel: 'Agendar sesión', ctaHref: '/contacto' }),
        services: block('services', 'BizPillarsBlock', { eyebrow: 'Soluciones', title: 'Seis formas de crecer con orden', subtitle: 'Se contratan por separado o combinadas.', background: 'white', items: SERVICES }),
        process: block('process', 'BizProcessBlock', { eyebrow: 'Metodología', title: 'Así se desarrolla cada proyecto', subtitle: '', steps: PROCESS }),
        engagement: block('engagement', 'BizEngagementBlock', ENGAGEMENT),
        cta: closing({}),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'nosotros',
    label: 'Nosotros',
    routePath: '/nosotros',
    required: false,
    description: 'Historia, valores y trayectoria de la empresa.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'story', 'kpis', 'trust', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Quiénes somos', title: 'Más de una década generando resultados', subtitle: 'Conoce la historia, los valores y el equipo detrás de más de 10 años de trabajo comprobado.', ctaLabel: 'Ver servicios', ctaHref: '/servicios' }),
        story: block('story', 'BizPillarsBlock', { eyebrow: 'Nuestra historia', title: 'Nacimos para ser aliados, no proveedores', subtitle: 'Las empresas merecen socios estratégicos reales, no servicios genéricos.', background: 'white', items: ['Fundados en 2014 | 2014\nComenzamos como firma boutique con foco en empresas medianas del sector industrial y de servicios.', 'Crecimiento sostenido | 2018\nAmpliamos nuestras capacidades hacia transformación digital y capacitación.', 'Equipo multidisciplinar\nEspecialistas en finanzas, operaciones, marketing, tecnología y personas bajo un mismo techo.', 'Presencia nacional | 12 ciudades\nEquipos locales que conocen a fondo cada mercado regional.'].join(SEP) }),
        kpis: block('kpis', 'BizKpiBandBlock', { eyebrow: 'En números', title: 'Una trayectoria que habla por sí sola', kpis: KPIS }),
        trust: block('trust', 'BizTrustBlock', TRUST),
        cta: closing({}),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'contacto',
    label: 'Contacto',
    routePath: '/contacto',
    required: false,
    description: 'Agenda una sesión o envíanos un mensaje.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'channels', 'form', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Hablemos', title: 'Agenda tu sesión de diagnóstico', subtitle: 'Respondemos en menos de 24 horas. Sin compromiso, solo una conversación honesta.' }),
        channels: block('channels', 'BizPillarsBlock', { eyebrow: 'Canales de atención', title: 'Elige cómo prefieres contactarnos', subtitle: '', background: 'muted', items: ['Correo electrónico\nhola@empresa.com para consultas, propuestas y solicitudes de diagnóstico.', 'WhatsApp\n+52 55 0000 0000 de lunes a viernes para consultas rápidas y seguimiento.', 'LinkedIn\nCasos de éxito, artículos y novedades de nuestros servicios.'].join(SEP) }),
        form: block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
        footer: FOOTER,
      },
    }),
  },
]
