import { defineTemplate } from '@raulbellosom/atlas-web-builder'
import { HOVER_LIFT, counterBand } from './_effects.js'

const HERO_SKY = { kind: 'gradient', angle: 165, from: '#0B1B2B', to: '#0E7490' }

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'dark',
    brand: 'Aurora Viajes',
    links: 'Inicio | /\nDestinos | /destinos\nExperiencias | /experiencias\nContacto | /contacto',
    ctaLabel: 'Planear mi viaje',
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
    brand: 'Aurora Viajes',
    tagline: 'Viajes diseñados para recordarse.',
    columns: 'Explorar | Explorar\nDestinos | /destinos\nExperiencias | /experiencias\nContacto | /contacto\n---\nAyuda | Ayuda\nPreguntas frecuentes | /\nPolíticas de cancelación | /\n---\nLegal | Legal\nAviso de privacidad | /\nTérminos y condiciones | /',
    copyright: `© ${new Date().getFullYear()} Aurora Viajes. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const block = (id, type, props, children = {}) => ({ id, type, props, children })

const hero = (props) => block('hero', 'HeroBlock', {
  variant: 'centered', ctaVariant: 'solid', imageSrc: '', background: HERO_SKY, align: 'center',
  paddingY: '16', contentMaxWidth: '768px', shadow: 'none', titleSize: '3xl', minHeight: '480px', ...props,
})

// Cards that drift at different speeds while scrolling: the staggered motion is what gives the grid its depth.
// Speeds stay small so a card never leaves the padding of its section.
const SPEEDS = [-0.07, 0.09, -0.04, 0.06, -0.08, 0.05]
const TONES = ['muted', 'primary', 'accent']

const floatGrid = (id, { eyebrow, title, subtitle, cards, background = 'bg' }) => {
  const ids = cards.map((_, index) => `${id}-card-${index + 1}`)
  return [
    block(id, 'SectionBlock', { paddingY: '16', background }, { children: [`${id}-title`, `${id}-text`, `${id}-grid`] }),
    block(`${id}-title`, 'HeadingBlock', { text: title, level: 'h2', align: 'center', size: '2xl', weight: '800' }),
    block(`${id}-text`, 'TextBlock', { text: subtitle, align: 'center', color: 'muted', maxWidth: '640px' }),
    block(`${id}-grid`, 'GridBlock', { minItemWidth: 280, gap: '8' }, { children: ids }),
    ...cards.map(([name, description, href], index) => block(ids[index], 'CardBlock', {
      variant: 'default', title: name, titleSize: 'xl', titleWeight: '700', description, ctaLabel: 'Ver detalles', ctaHref: href, ctaStyle: 'link',
      align: 'left', padding: '8', radius: 'lg', shadow: 'md', background: TONES[index % TONES.length],
      _parallax: { speed: SPEEDS[index % SPEEDS.length] }, ...HOVER_LIFT,
    })),
  ]
}

const DESTINATIONS = [
  ['Costa del Pacífico', 'Atardeceres largos, surf suave y cocina de mar a pie de playa. Desde 5 días.', '/destinos'],
  ['Sierra y bosque', 'Cabañas, rutas guiadas y noches de estrellas lejos del ruido.', '/destinos'],
  ['Ciudades con historia', 'Arquitectura, mercados y museos con guías locales que cuentan lo que no sale en el mapa.', '/destinos'],
  ['Islas del Caribe', 'Aguas cálidas, snorkel y hoteles pequeños con trato cercano.', '/destinos'],
  ['Desierto y cielo', 'Campamentos de lujo, astronomía y caminatas al amanecer.', '/destinos'],
  ['Ruta del vino', 'Valles, bodegas familiares y maridajes en terrazas con vista.', '/destinos'],
]

const EXPERIENCES = [
  ['Viaje a tu medida', 'Cuéntanos qué buscas y diseñamos el itinerario completo, con vuelos, hospedaje y actividades.', '/contacto'],
  ['Escapadas de fin de semana', 'Planes cortos y cercanos, listos para reservar, para desconectar sin complicaciones.', '/contacto'],
  ['Viajes en grupo', 'Familias, equipos y amigos: coordinamos todo, desde el transporte hasta las comidas.', '/contacto'],
]

const TESTIMONIALS = 'Valeria Núñez|Viaje a la costa|5\nNos armaron un itinerario perfecto. No tuvimos que preocuparnos por nada y cada día tuvo una sorpresa.\n---\nAndrés Pizarro|Escapada a la sierra|5\nLas cabañas, las rutas y hasta los horarios estaban pensados al detalle. Volveremos sin duda.\n---\nMarina Solís|Viaje en grupo|5\nOrganizar a doce personas parecía imposible. Con Aurora fue sencillo y todos quedaron felices.'

const cta = (title) => block('cta', 'CtaBannerBlock', {
  eyebrow: 'Tu próximo viaje', title, subtitle: 'Cuéntanos a dónde quieres ir y te respondemos con una propuesta en menos de 24 horas.',
  ctaLabel: 'Planear mi viaje', ctaHref: '/contacto', ctaSecondLabel: 'Ver destinos', ctaSecondHref: '/destinos', variant: 'gradient-dark', size: 'large', align: 'center',
})

const page = (rootIds, list) => ({ rootIds, blocks: Object.fromEntries(list.map((b) => [b.id, b])) })

export const auroraTemplate = defineTemplate({
  id: 'atlas-aurora',
  label: 'Aurora Viajes',
  description: 'Agencia de viajes con tarjetas que flotan a distinta velocidad al hacer scroll (parallax), contadores y secciones animadas.',
  category: 'viajes',
  build() {
    return page(
      ['navbar', 'hero', 'numbers', 'destinations', 'experiences', 'testimonials', 'cta', 'footer'],
      [
        NAVBAR,
        hero({
          eyebrow: 'Viajes diseñados para recordarse',
          title: 'Viaja a donde el cielo cambia de color',
          subtitle: 'Itinerarios a la medida, guías locales y hoteles con encanto. Tú eliges el destino, nosotros cuidamos cada detalle.',
          ctaLabel: 'Ver destinos', ctaHref: '/destinos', ctaSecondLabel: 'Planear mi viaje', ctaSecondHref: '/contacto',
        }),
        ...counterBand('numbers', [[12, '+', 'Años organizando viajes'], [4800, '+', 'Viajeros felices'], [60, '+', 'Destinos'], [4.9, '/5', 'Calificación promedio', 1]]),
        ...floatGrid('destinations', { eyebrow: 'Destinos', title: 'A dónde te gustaría ir', subtitle: 'Seis lugares para empezar a soñar. Todos pueden ajustarse a tu fecha y presupuesto.', cards: DESTINATIONS, background: 'muted' }),
        ...floatGrid('experiences', { eyebrow: 'Experiencias', title: 'Formas de viajar', subtitle: 'Elige el estilo que va contigo.', cards: EXPERIENCES }),
        block('testimonials', 'TestimonialsBlock', { eyebrow: 'Viajeros felices', title: 'Lo que cuentan de su viaje', columns: '3', background: 'muted', testimonials: TESTIMONIALS }),
        cta('Tu aventura empieza con un mensaje'),
        FOOTER,
      ],
    )
  },
})

export const auroraSitePages = [
  {
    id: 'destinos', label: 'Destinos', routePath: '/destinos', description: 'Destinos disponibles.',
    build: () => page(['navbar', 'hero', 'destinations', 'cta', 'footer'], [
      NAVBAR,
      hero({ eyebrow: 'Destinos', title: 'Elige tu próximo destino', subtitle: 'Mar, montaña, ciudad o desierto: todo con itinerario y reservas incluidos.', ctaLabel: 'Pedir propuesta', ctaHref: '/contacto', titleSize: '2xl', minHeight: '360px' }),
      ...floatGrid('destinations', { title: 'Inspiración para tu viaje', subtitle: 'Cada destino puede combinarse con otro para armar una ruta más larga.', cards: DESTINATIONS }),
      cta('¿No encuentras tu destino?'),
      FOOTER,
    ]),
  },
  {
    id: 'experiencias', label: 'Experiencias', routePath: '/experiencias', description: 'Formas de viajar y lo que incluyen.',
    build: () => page(['navbar', 'hero', 'experiences', 'included', 'testimonials', 'cta', 'footer'], [
      NAVBAR,
      hero({ eyebrow: 'Experiencias', title: 'Viajes pensados para ti', subtitle: 'Desde una escapada de fin de semana hasta una ruta de dos semanas.', ctaLabel: 'Planear mi viaje', ctaHref: '/contacto', titleSize: '2xl', minHeight: '360px' }),
      ...floatGrid('experiences', { title: 'Formas de viajar', subtitle: 'Cada una incluye asesoría personal.', cards: EXPERIENCES }),
      block('included', 'FeaturesSectionBlock', { eyebrow: 'Incluido', title: 'En todos nuestros viajes', subtitle: '', layout: 'grid-2', iconStyle: 'check', background: 'muted', features: 'Asesor personal\nUna persona te acompaña antes, durante y después del viaje.\n---\nHoteles seleccionados\nVisitamos y elegimos cada hospedaje.\n---\nGuías locales\nConocedores que cuentan la historia del lugar.\n---\nAsistencia 24 horas\nSoporte por teléfono y mensaje durante todo el viaje.' }),
      block('testimonials', 'TestimonialsBlock', { eyebrow: 'Viajeros felices', title: 'Opiniones', columns: '3', background: 'white', testimonials: TESTIMONIALS }),
      cta('Diseñemos tu viaje'),
      FOOTER,
    ]),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', description: 'Canales de contacto.',
    build: () => page(['navbar', 'hero', 'channels', 'footer'], [
      NAVBAR,
      hero({ eyebrow: 'Contacto', title: 'Cuéntanos a dónde quieres ir', subtitle: 'Respondemos con una propuesta en menos de 24 horas.', ctaLabel: '', titleSize: '2xl', minHeight: '360px' }),
      block('channels', 'FeaturesSectionBlock', { eyebrow: 'Hablemos', title: 'Elige cómo prefieres escribirnos', subtitle: '', layout: 'grid-3', iconStyle: 'arrow', background: 'white', features: 'Correo electrónico\nhola@auroraviajes.com — cuéntanos fechas, destino y presupuesto.\n---\nWhatsApp\n+52 55 0000 0000 — de lunes a sábado de 9:00 a 20:00.\n---\nOficina\nAv. del Mar 200, Ciudad de México — con cita previa.' }),
      FOOTER,
    ]),
  },
]
