import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const b = (id, type, props) => ({ id, type, props, children: {} })
const page = (blocks) => ({ rootIds: blocks.map((x) => x.id), blocks: Object.fromEntries(blocks.map((x) => [x.id, x])) })

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'light',
    brand: 'Serenity Spa',
    links: 'Inicio | /\nServicios | /servicios\nEquipo | /equipo\nContacto | /contacto',
    ctaLabel: 'Reservar cita',
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
    tone: 'light',
    brand: 'Serenity Spa',
    tagline: 'Bienestar integral para cuerpo, mente y espíritu.',
    columns: 'Servicios | Servicios\nMasajes | /servicios\nFaciales | /servicios\nAromaterapia | /servicios\nYoga | /servicios\n---\nInformación | Información\nNosotros | /\nEquipo | /equipo\nPolítica de privacidad | /\n---\nContacto | Contacto\nReservar cita | /contacto\nWhatsApp | /\nInstagram | /',
    copyright: `© ${new Date().getFullYear()} Serenity Spa. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const RITUALS = 'Masaje terapéutico | Técnicas para soltar la tensión y mejorar la circulación. | 60 – 90 min | 1,200\nFacial premium | Limpieza profunda y activos naturales para una piel luminosa. | 75 min | 1,450\nAromaterapia | Aceites esenciales puros que equilibran cuerpo y mente. | 60 min | 1,100\nCircuito de hidroterapia | Agua a distintas temperaturas para renovar la energía. | 90 min | 980\nYoga y meditación | Clases guiadas, en grupo pequeño o privadas. | 60 min | 450\nNutrición holística | Asesoría para sostener los resultados de tus rituales. | 45 min | 700'

const TESTIMONIALS = b('testimonials', 'TestimonialsBlock', {
  eyebrow: 'Experiencias reales',
  title: 'Lo que dicen nuestras clientas',
  columns: '3',
  background: 'white',
  testimonials: 'Mariana López|Clienta desde 2019|5\nSerenity cambió por completo mi rutina de bienestar. Llevo cinco años visitándolas y cada vez la experiencia es mejor. El masaje de aromaterapia es mi favorito.\n---\nPatricia Ruiz|Empresaria|5\nUn oasis en medio de la ciudad. Vengo cada dos semanas y es lo que me mantiene equilibrada. Las terapeutas son expertas y muy profesionales.\n---\nAlejandra Torres|Médica|5\nComo profesional de la salud, aprecio el rigor de sus protocolos y la calidad de sus productos. Me siento en muy buenas manos.',
})

const QUOTE = b('quote', 'QuoteBlock', { quote: 'El bienestar no es un destino: es un ritual que eliges cada día.', attribution: '— El equipo Serenity', background: 'cream', size: 'large', ornament: 'true' })

const closing = (props = {}) => b('booking', 'SpaClosingBlock', {
  eyebrow: 'Agenda tu cita', title: 'Tu momento de calma empieza hoy',
  body: 'Primera consulta sin costo y 20% de descuento en tu primer ritual.',
  ctaLabel: 'Reservar ahora', ctaHref: '/contacto', ctaSecondLabel: 'WhatsApp', ctaSecondHref: 'https://wa.me/525500000000',
  hours: 'Lunes a sábado | 9:00 – 20:00\nDomingos | 10:00 – 17:00',
  ...props,
})

const pageHero = (eyebrow, title, accent, subtitle, extra = {}) => b('hero', 'SpaHeroBlock', {
  size: 'page', eyebrow, title, accent, subtitle, ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '', inhale: '', exhale: '', facts: '', ...extra,
})

const TEAM = 'Dra. Elena Vidal|Directora y terapeuta senior\nEspecialista en bienestar holístico con certificación internacional en terapias integrativas y más de 12 años de experiencia.\n---\nCarolina Jiménez|Esteticista premium\nExperta en tratamientos faciales avanzados y técnicas de rejuvenecimiento no invasivo.\n---\nValeria Moreno|Instructora de yoga\nCertificada en yoga terapéutico y meditación mindfulness. Imparte clases para todos los niveles.'

export const spaTemplate = defineTemplate({
  id: 'atlas-spa',
  label: 'Spa & Bienestar',
  description: 'Diseño sereno y premium para spas, yoga y wellness: formas orgánicas, respiración guiada y rituales en lista.',
  category: 'belleza',
  build() {
    return page([
      NAVBAR,
      b('hero', 'SpaHeroBlock', {
        size: 'full', eyebrow: 'Spa urbano en Polanco', title: 'Un lugar para', accent: 'volver a ti',
        subtitle: 'Masajes, faciales y rituales de agua en espacios privados, con productos naturales y todo el tiempo del mundo.',
        ctaLabel: 'Reservar un ritual', ctaHref: '/contacto', ctaSecondLabel: 'Ver rituales', ctaSecondHref: '/servicios',
        inhale: 'Inhala', exhale: 'Exhala', facts: 'Rituales | 25+\nTerapeutas certificadas | 12\nAños de calma | 12',
      }),
      b('rituals', 'SpaRitualsBlock', { eyebrow: 'Rituales', title: 'Tratamientos pensados para bajar el ritmo', subtitle: 'Cada ritual se adapta a tu cuerpo y a tu día. Sin prisa, sin ruido.', currency: '$', rituals: RITUALS, ctaLabel: 'Reservar un ritual', ctaHref: '/contacto' }),
      QUOTE,
      b('features', 'FeaturesSectionBlock', {
        eyebrow: 'La diferencia Serenity', title: 'Una experiencia diseñada para ti',
        subtitle: 'Cada detalle de tu visita está pensado para que salgas renovada y con ganas de volver.',
        layout: 'grid-2', iconStyle: 'check', background: 'muted',
        features: 'Total privacidad\nEspacios íntimos para desconectarte por completo del exterior.\n---\nProductos 100% naturales\nIngredientes orgánicos y cruelty-free en todos nuestros tratamientos.\n---\nTerapeutas certificadas\nCertificaciones internacionales y años de experiencia especializada.\n---\nPersonalización total\nCada tratamiento se adapta a tu piel, tu cuerpo y tus objetivos.',
      }),
      TESTIMONIALS,
      b('team', 'TeamGridBlock', { eyebrow: 'Nuestras expertas', title: 'El equipo que cuida de ti', subtitle: 'Profesionales apasionadas y certificadas, dedicadas a tu bienestar.', columns: '3', layout: 'centered', team: TEAM, photo1: '', photo2: '', photo3: '' }),
      closing(),
      FOOTER,
    ])
  },
})

export const spaSitePages = [
  {
    id: 'servicios', label: 'Servicios', routePath: '/servicios', required: false, description: 'Catálogo completo de tratamientos y servicios.',
    build: () => page([
      NAVBAR,
      pageHero('Tratamientos', 'Rituales para', 'cada momento', 'Cada tratamiento está personalizado y lo realizan especialistas certificadas.', { ctaLabel: 'Reservar cita', ctaHref: '/contacto' }),
      b('rituals', 'SpaRitualsBlock', { eyebrow: 'Todos los rituales', title: 'Elige el que tu cuerpo pide', subtitle: 'Duración y precio de cada ritual. Si dudas, te orientamos al reservar.', currency: '$', rituals: RITUALS, ctaLabel: 'Reservar cita', ctaHref: '/contacto' }),
      b('features', 'FeaturesSectionBlock', {
        eyebrow: 'Por qué elegirnos', title: 'La diferencia Serenity', subtitle: 'No somos un spa más. Somos tu aliada en bienestar.',
        layout: 'grid-2', iconStyle: 'check', background: 'muted',
        features: 'Productos 100% naturales\nIngredientes orgánicos y cruelty-free, sin excepción.\n---\nTerapeutas certificadas\nCertificaciones internacionales y experiencia en cada área.\n---\nPersonalización total\nCada tratamiento se adapta a tu piel y tus objetivos.\n---\nReservas fáciles\nAgenda en minutos, en línea o por WhatsApp.',
      }),
      closing(),
      FOOTER,
    ]),
  },
  {
    id: 'equipo', label: 'Equipo', routePath: '/equipo', required: false, description: 'Conoce al equipo de expertas que cuidan de ti.',
    build: () => page([
      NAVBAR,
      pageHero('Las manos que cuidan', 'Personas que', 'te escuchan', 'Profesionales apasionadas, certificadas y dedicadas a tu bienestar en cada visita.', { ctaLabel: 'Reservar cita', ctaHref: '/contacto' }),
      b('team', 'TeamGridBlock', {
        eyebrow: 'Nuestras especialistas', title: 'El equipo que cuida de ti', subtitle: 'Cada integrante está certificada y apasionada por el bienestar.', columns: '3', layout: 'centered',
        team: `${TEAM}\n---\nSofía Ramírez|Terapeuta en hidroterapia\nEspecialista en circuitos de agua, baños de inmersión y terapias de contraste.\n---\nAna Gutiérrez|Nutrióloga holística\nAlimentación consciente y planes personalizados para complementar los rituales.\n---\nLorena Castro|Masajista deportiva\nMasaje deportivo, relajación profunda y liberación miofascial.`,
        photo1: '', photo2: '', photo3: '', photo4: '', photo5: '', photo6: '',
      }),
      TESTIMONIALS,
      closing({ title: 'Elige a tu terapeuta favorita', body: 'Reserva tu cita y dinos con quién prefieres trabajar.' }),
      FOOTER,
    ]),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', required: false, description: 'Agenda tu cita e información de contacto.',
    build: () => page([
      NAVBAR,
      pageHero('Agenda tu cita', 'Escríbenos y', 'respira', 'Cuéntanos qué necesitas y te proponemos el ritual ideal. Respondemos el mismo día.'),
      b('info', 'FeaturesSectionBlock', {
        eyebrow: 'Cómo encontrarnos', title: 'Información de contacto', subtitle: 'Visítanos, llámanos o escríbenos.',
        layout: 'grid-3', iconStyle: 'check', background: 'white',
        features: 'Dirección\nColonia Polanco, Ciudad de México. Un ambiente de total privacidad y tranquilidad.\n---\nHorario\nLunes a sábado: 9:00 – 20:00\nDomingos: 10:00 – 17:00\n---\nTeléfono y WhatsApp\n+52 55 0000 0000 para agendar tu cita de manera rápida.',
      }),
      b('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, recibimos tu solicitud y te escribiremos muy pronto.', buttonLabel: 'Solicitar cita' }),
      FOOTER,
    ]),
  },
]
