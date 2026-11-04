import { defineTemplate } from '@raulbellosom/atlas-web-builder'
import { counterBand } from './_effects.js'

const HERO_TINT = { kind: 'gradient', angle: 180, from: '#D9F2E6', to: '#F6FBF8' }

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'light',
    brand: 'Finora',
    links: 'Inicio | /\nPréstamos | /prestamos\nCómo funciona | /como-funciona\nNosotros | /nosotros\nContacto | /contacto',
    ctaLabel: 'Comenzar',
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
    brand: 'Finora',
    tagline: 'Banca moderna para un futuro más brillante.',
    columns: 'Préstamos | Préstamos\nPersonal | /prestamos\nHipotecario | /prestamos\nAutomotriz | /prestamos\nEmpresarial | /prestamos\n---\nFinora | Finora\nCómo funciona | /como-funciona\nNosotros | /nosotros\nContacto | /contacto\n---\nLegal | Legal\nAviso de privacidad | /\nTérminos y condiciones | /',
    copyright: `© ${new Date().getFullYear()} Finora. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const hero = (props) => ({
  id: 'hero',
  type: 'HeroBlock',
  props: {
    variant: 'centered', ctaVariant: 'solid', imageSrc: '', background: HERO_TINT, align: 'center',
    paddingY: '16', contentMaxWidth: '768px', shadow: 'none', ...props,
  },
  children: {},
})

const block = (id, type, props) => ({ id, type, props, children: {} })

const TESTIMONIALS = 'Sarah Johnson|Cliente de crédito hipotecario|5\nFinora hizo que comprar mi casa fuera muy fácil. El proceso fue sencillo y el equipo me acompañó en cada paso.\n---\nMichael Brown|Cliente de préstamo personal|5\nMe aprobaron mi préstamo en menos de 24 horas. Es la mejor experiencia bancaria que he tenido.\n---\nEmily Davis|Cliente de crédito automotriz|5\nExcelentes tasas, servicio rápido y una experiencia en línea muy clara. Totalmente recomendado.'

const cta = (title, subtitle) => block('cta', 'FinClosingBlock', { title, subtitle })

export const finoraTemplate = defineTemplate({
  id: 'atlas-finora',
  label: 'Finora',
  description: 'Banca y préstamos con estética fintech limpia en verde. Sitio de varias páginas con productos, pasos y confianza.',
  category: 'finanzas',
  build() {
    return {
      rootIds: ['navbar', 'hero', 'trust', 'loans', 'steps', 'payment', 'testimonials', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: block('hero', 'FinHeroBlock', {}),
        ...Object.fromEntries(counterBand('trust', [[1, 'M+', 'Clientes felices'], [4.8, '/5', 'Calificación promedio', 1], [100, '%', 'Seguro y confiable'], [24, ' h', 'Para tu aprobación']]).map((b) => [b.id, b])),
        loans: block('loans', 'FinLoanCardsBlock', { background: 'white' }),
        steps: block('steps', 'FinStepsBlock', { background: 'muted' }),
        payment: block('payment', 'FinCalculatorBlock', {}),
        testimonials: block('testimonials', 'TestimonialsBlock', {
          eyebrow: 'Testimonios', title: 'Lo que dicen nuestros clientes', columns: '3', background: 'muted', testimonials: TESTIMONIALS,
        }),
        cta: cta('Tus metas financieras están más cerca de lo que crees', 'Únete a miles de clientes satisfechos y da el primer paso hacia un futuro financiero más brillante.'),
        footer: FOOTER,
      },
    }
  },
})

export const finoraSitePages = [
  {
    id: 'prestamos',
    label: 'Préstamos',
    routePath: '/prestamos',
    description: 'Préstamos personales, hipotecarios, automotrices y empresariales.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'loans', 'calc', 'features', 'split', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Nuestros productos', title: 'Encuentra el crédito ideal para ti', subtitle: 'Tasas bajas, plazos flexibles y aprobación rápida, sin comisiones ocultas.', ctaLabel: 'Solicitar ahora', ctaHref: '/contacto', titleSize: '2xl', minHeight: '360px' }),
        loans: block('loans', 'FinLoanCardsBlock', { eyebrow: 'Créditos', title: 'Elige el que mejor se adapta a ti', subtitle: '', columns: '2', background: 'white' }),
        calc: block('calc', 'FinCalculatorBlock', { title: 'Simula tu crédito antes de solicitarlo' }),
        features: block('features', 'FeaturesSectionBlock', {
          eyebrow: 'Beneficios', title: 'Ventajas de elegir Finora', subtitle: '', layout: 'grid-2', iconStyle: 'check', background: 'muted',
          features: 'Tasas competitivas\nOfrecemos tasas bajas y fijas para que sepas siempre cuánto pagarás.\n---\nSin comisiones ocultas\nTodo el costo del crédito se muestra desde el inicio, sin sorpresas.\n---\nPagos flexibles\nElige la fecha y el plazo que mejor se ajusten a tu presupuesto.\n---\nAprobación en 24 horas\nSolicita en línea y recibe una respuesta rápida de nuestro equipo.',
        }),
        split: block('split', 'SplitFeatureBlock', {
          variant: 'image-right', eyebrow: 'Hipotecas', title: 'Tu hogar empieza aquí',
          body: 'Financiamos hasta el 90% del valor de tu vivienda, con plazos de hasta 30 años y asesoría personalizada de principio a fin.',
          ctaLabel: 'Hablar con un asesor', ctaHref: '/contacto', imageSrc: '', imageAlt: '', background: 'cream', imageHeight: 'contained',
        }),
        cta: cta('Da el primer paso hacia tu próximo crédito', 'Cuéntanos qué necesitas y te ayudamos a elegir la mejor opción.'),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'como-funciona',
    label: 'Cómo funciona',
    routePath: '/como-funciona',
    description: 'El proceso de solicitud en tres pasos.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'steps', 'requirements', 'stats', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Pasos simples', title: 'Del trámite a tu cuenta en tres pasos', subtitle: 'Todo el proceso es en línea, claro y sin filas.', ctaLabel: 'Comenzar solicitud', ctaHref: '/contacto', titleSize: '2xl', minHeight: '360px' }),
        steps: block('steps', 'FinStepsBlock', { eyebrow: 'El proceso', title: 'Así de fácil', subtitle: '', background: 'white' }),
        requirements: block('requirements', 'FeaturesSectionBlock', {
          eyebrow: 'Antes de empezar', title: 'Lo que necesitas', subtitle: 'Ten estos documentos a la mano para agilizar tu solicitud.', layout: 'list', iconStyle: 'check', background: 'muted',
          features: 'Identificación oficial\nVigente y legible, por ambos lados.\n---\nComprobante de domicilio\nCon antigüedad no mayor a tres meses.\n---\nComprobante de ingresos\nÚltimos recibos de nómina o estados de cuenta.',
        }),
        stats: block('stats', 'StatsBlock', { eyebrow: '', title: '', stats: '24 h\nRespuesta\nPara tu aprobación\n---\n0\nComisiones ocultas\nTransparencia total\n---\n100%\nProceso en línea\nSin salir de casa', background: 'dark', align: 'center' }),
        cta: cta('Empieza tu solicitud hoy', 'Toma menos de diez minutos.'),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'nosotros',
    label: 'Nosotros',
    routePath: '/nosotros',
    description: 'Historia, valores y equipo.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'values', 'stats', 'team', 'testimonials', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Sobre Finora', title: 'Banca moderna con rostro humano', subtitle: 'Creemos que las finanzas deben ser simples, justas y estar al alcance de todos.', ctaLabel: '', titleSize: '2xl', minHeight: '360px' }),
        values: block('values', 'FeaturesSectionBlock', {
          eyebrow: 'Nuestros valores', title: 'Lo que nos guía', subtitle: '', layout: 'grid-3', iconStyle: 'dot', background: 'white',
          features: 'Transparencia\nCostos claros desde el primer día, sin letras chiquitas.\n---\nSeguridad\nProtegemos tus datos y tu dinero con los más altos estándares.\n---\nCercanía\nPersonas reales listas para ayudarte cuando lo necesitas.',
        }),
        stats: block('stats', 'StatsBlock', { eyebrow: '', title: '', stats: '1M+\nClientes\nConfían en nosotros\n---\n4.8/5\nCalificación\nOpiniones verificadas\n---\n12\nAños de experiencia\nEn el sector financiero', background: 'primary', align: 'center' }),
        team: block('team', 'TeamGridBlock', {
          eyebrow: 'Equipo', title: 'Las personas detrás de Finora', subtitle: '', columns: '3', layout: 'centered',
          team: "Daniela Ortega|Directora General\nMás de 15 años en banca de consumo.\n---\nJavier Salinas|Director de Riesgos\nEspecialista en análisis crediticio responsable.\n---\nLucía Fernández|Directora de Experiencia\nDiseña cada paso para que sea simple y claro.",
        }),
        testimonials: block('testimonials', 'TestimonialsBlock', { eyebrow: 'Testimonios', title: 'Clientes que confían en nosotros', columns: '3', background: 'muted', testimonials: TESTIMONIALS }),
        footer: FOOTER,
      },
    }),
  },
  {
    id: 'contacto',
    label: 'Contacto',
    routePath: '/contacto',
    description: 'Canales de atención y solicitud.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'channels', 'form', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: hero({ eyebrow: 'Contacto', title: 'Hablemos de tus metas', subtitle: 'Un asesor te responderá en menos de 24 horas.', ctaLabel: '', titleSize: '2xl', minHeight: '360px' }),
        channels: block('channels', 'FeaturesSectionBlock', {
          eyebrow: 'Canales de atención', title: 'Elige cómo prefieres contactarnos', subtitle: '', layout: 'grid-3', iconStyle: 'arrow', background: 'white',
          features: 'Correo electrónico\nhola@finora.com — para solicitudes, dudas y seguimiento de tu crédito.\n---\nTeléfono y WhatsApp\n+52 55 0000 0000 — de lunes a viernes de 9:00 a 18:00 horas.\n---\nSucursal\nAv. Reforma 100, Ciudad de México — con cita previa.',
        }),
        form: block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
        footer: FOOTER,
      },
    }),
  },
]
