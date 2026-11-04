import { defineTemplate } from '@raulbellosom/atlas-web-builder'
import { HOVER_LIFT } from './_effects.js'

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
const drift = (speed) => ({ _parallax: { speed } })

// Every section is a ParallaxSection: its background and shapes drift at their own speeds inside a clipped frame,
// and the content blocks drift a little too (small speeds, so nothing leaves the section's padding).
// Dark tones put the text in the theme's "on primary" color.
const DARK = new Set(['sky', 'sunset', 'forest', 'ink', 'primary'])

// Flat helper: returns [sectionBlock, ...allDescendants] given the section id and its direct content blocks (each
// content item is { block, extra: [descendant blocks] }).
function parallaxSection(id, tone, shapes, items, props) {
  const sectionBlock = block(id, 'ParallaxSectionBlock', { tone, shapes, speed: '0.2', paddingY: '16', minHeight: '', align: 'center', ...props }, { children: items.map((item) => item.block.id) })
  return [sectionBlock, ...items.flatMap((item) => [item.block, ...(item.extra ?? [])])]
}
const item = (b, extra) => ({ block: b, extra })

const heading = (id, text, tone, extra = {}) => item(block(id, 'HeadingBlock', { text, level: 'h2', align: 'center', size: '2xl', weight: '800', color: DARK.has(tone) ? 'primaryFg' : 'fg', paddingY: '2', ...extra }))
const lead = (id, text, tone, extra = {}) => item(block(id, 'TextBlock', { text, align: 'center', size: 'lg', color: DARK.has(tone) ? 'primaryFg' : 'muted', maxWidth: '640px', paddingY: '4', ...extra }))

const SPEEDS = [-0.06, 0.08, -0.04, 0.06, -0.07, 0.05]

function cardGrid(id, cards, tone) {
  const ids = cards.map((_, index) => `${id}-card-${index + 1}`)
  const cardBlocks = cards.map(([name, description, href], index) => block(ids[index], 'CardBlock', {
    variant: 'default', title: name, titleSize: 'xl', titleWeight: '700', description, ctaLabel: 'Ver detalles', ctaHref: href, ctaStyle: 'link',
    align: 'left', padding: '8', radius: 'lg', shadow: 'lg', background: 'bg', ...drift(SPEEDS[index % SPEEDS.length]), ...HOVER_LIFT,
  }))
  return item(block(id, 'GridBlock', { minItemWidth: 280, gap: '8' }, { children: ids }), cardBlocks)
}

function counterGrid(id, counters, tone) {
  const ids = counters.map((_, index) => `${id}-counter-${index + 1}`)
  const counterBlocks = counters.map(([value, suffix, label, decimals = 0], index) => block(ids[index], 'CounterBlock', {
    value, from: 0, prefix: '', suffix, label, duration: 1600, decimals, grouping: true, color: DARK.has(tone) ? 'primaryFg' : 'primary', size: '3xl', align: 'center', ...drift(SPEEDS[index % SPEEDS.length] / 2),
  }))
  return item(block(id, 'GridBlock', { minItemWidth: 200, gap: '8' }, { children: ids }), counterBlocks)
}

function buttons(id, [primaryLabel, primaryHref], [secondLabel, secondHref], solidSecond = false) {
  const cols = block(id, 'ColumnsBlock', { count: '2', gap: '4', valign: 'center', layout: 'equal', stackOnMobile: true, paddingY: '0' }, { col0: [`${id}-a`], col1: [`${id}-b`] })
  const first = block(`${id}-a`, 'ButtonBlock', { label: primaryLabel, href: primaryHref, variant: 'solid', size: 'lg', color: 'accent', radius: 'pill', align: 'full', newTab: false })
  const second = block(`${id}-b`, 'ButtonBlock', { label: secondLabel, href: secondHref, variant: solidSecond ? 'solid' : 'outline', size: 'lg', color: solidSecond ? 'fg' : 'accent', radius: 'pill', align: 'full', newTab: false })
  return item(block(`${id}-wrap`, 'ContainerBlock', { maxWidth: 'sm', paddingX: '0' }, { children: [id] }), [cols, first, second])
}

function hero({ eyebrow, title, subtitle, primary, secondary, tone = 'sky', minHeight = '600px' }) {
  const items = [
    item(block('hero-eyebrow', 'TextBlock', { text: eyebrow, align: 'center', size: 'sm', color: 'primaryFg', letterSpacing: '0.08em', weight: '700', ...drift(0.03) })),
    item(block('hero-title', 'HeadingBlock', { text: title, level: 'h1', align: 'center', size: '3xl', weight: '800', color: 'primaryFg', maxWidth: '768px', lineHeight: '1.2', ...drift(0.05) })),
    item(block('hero-text', 'TextBlock', { text: subtitle, align: 'center', size: 'lg', color: 'primaryFg', maxWidth: '640px', ...drift(0.08) })),
  ]
  if (primary) items.push(buttons('hero-buttons', primary, secondary))
  return parallaxSection('hero', tone, 'circles', items, { minHeight, paddingY: '24', speed: '0.3' })
}

function closing(title) {
  return parallaxSection('cta', 'sunset', 'blobs', [
    item(block('cta-title', 'HeadingBlock', { text: title, level: 'h2', align: 'center', size: '2xl', weight: '800', color: 'primaryFg', ...drift(0.04) })),
    item(block('cta-text', 'TextBlock', { text: 'Cuéntanos a dónde quieres ir y te respondemos con una propuesta en menos de 24 horas.', align: 'center', size: 'lg', color: 'primaryFg', maxWidth: '640px', ...drift(0.07) })),
    buttons('cta-buttons', ['Planear mi viaje', '/contacto'], ['Ver destinos', '/destinos'], true),
  ], { minHeight: '480px', paddingY: '24', speed: '0.3' })
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

const testimonials = (title, background = 'dark') => [block('testimonials', 'TestimonialsBlock', { eyebrow: 'Viajeros felices', title, columns: '3', background, testimonials: TESTIMONIALS })]

// Top-level ids come from the sections themselves: the first block of every parallaxSection(...) result.
const page = (...parts) => {
  const flat = parts.flat()
  const rootIds = parts.map((part) => part[0].id)
  return { rootIds, blocks: Object.fromEntries(flat.map((b) => [b.id, b])) }
}

export const auroraTemplate = defineTemplate({
  id: 'atlas-aurora',
  label: 'Aurora Viajes',
  description: 'Agencia de viajes con parallax en toda la página: fondos y formas que flotan a distinta velocidad, tarjetas con profundidad y contadores animados.',
  category: 'viajes',
  build() {
    return page(
      [NAVBAR],
      hero({
        eyebrow: 'VIAJES DISEÑADOS PARA RECORDARSE',
        title: 'Viaja a donde el cielo cambia de color',
        subtitle: 'Itinerarios a la medida, guías locales y hoteles con encanto. Tú eliges el destino, nosotros cuidamos cada detalle.',
        primary: ['Ver destinos', '/destinos'], secondary: ['Planear mi viaje', '/contacto'],
      }),
      parallaxSection('numbers', 'light', 'blobs', [counterGrid('numbers-grid', [[12, '+', 'Años organizando viajes'], [4800, '+', 'Viajeros felices'], [60, '+', 'Destinos'], [4.9, '/5', 'Calificación promedio', 1]], 'light')], { paddingY: '12', speed: '0.1' }),
      parallaxSection('destinations', 'ink', 'rings', [
        heading('destinations-title', 'A dónde te gustaría ir', 'ink', drift(0.04)),
        lead('destinations-text', 'Seis lugares para empezar a soñar. Todos pueden ajustarse a tu fecha y presupuesto.', 'ink', drift(0.07)),
        cardGrid('destinations-grid', DESTINATIONS, 'ink'),
      ]),
      parallaxSection('experiences', 'light', 'blobs', [
        heading('experiences-title', 'Formas de viajar', 'light', drift(0.04)),
        lead('experiences-text', 'Elige el estilo que va contigo.', 'light', drift(0.07)),
        cardGrid('experiences-grid', EXPERIENCES, 'light'),
      ]),
      testimonials('Lo que cuentan de su viaje'),
      closing('Tu aventura empieza con un mensaje'),
      [FOOTER],
    )
  },
})

export const auroraSitePages = [
  {
    id: 'destinos', label: 'Destinos', routePath: '/destinos', description: 'Destinos disponibles.',
    build: () => page(
      [NAVBAR],
      hero({ eyebrow: 'DESTINOS', title: 'Elige tu próximo destino', subtitle: 'Mar, montaña, ciudad o desierto: todo con itinerario y reservas incluidos.', minHeight: '480px' }),
      parallaxSection('destinations', 'light', 'blobs', [
        heading('destinations-title', 'Inspiración para tu viaje', 'light', drift(0.04)),
        lead('destinations-text', 'Cada destino puede combinarse con otro para armar una ruta más larga.', 'light', drift(0.07)),
        cardGrid('destinations-grid', DESTINATIONS, 'light'),
      ]),
      closing('¿No encuentras tu destino?'),
      [FOOTER],
    ),
  },
  {
    id: 'experiencias', label: 'Experiencias', routePath: '/experiencias', description: 'Formas de viajar y lo que incluyen.',
    build: () => page(
      [NAVBAR],
      hero({ eyebrow: 'EXPERIENCIAS', title: 'Viajes pensados para ti', subtitle: 'Desde una escapada de fin de semana hasta una ruta de dos semanas.', tone: 'forest', minHeight: '480px' }),
      parallaxSection('experiences', 'light', 'blobs', [
        heading('experiences-title', 'Formas de viajar', 'light', drift(0.04)),
        lead('experiences-text', 'Cada una incluye asesoría personal.', 'light', drift(0.07)),
        cardGrid('experiences-grid', EXPERIENCES, 'light'),
      ]),
      [block('included', 'FeaturesSectionBlock', { eyebrow: 'Incluido', title: 'En todos nuestros viajes', subtitle: '', layout: 'grid-2', iconStyle: 'check', background: 'muted', features: 'Asesor personal\nUna persona te acompaña antes, durante y después del viaje.\n---\nHoteles seleccionados\nVisitamos y elegimos cada hospedaje.\n---\nGuías locales\nConocedores que cuentan la historia del lugar.\n---\nAsistencia 24 horas\nSoporte por teléfono y mensaje durante todo el viaje.' })],
      testimonials('Opiniones', 'dark'),
      closing('Diseñemos tu viaje'),
      [FOOTER],
    ),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', description: 'Canales de contacto.',
    build: () => page(
      [NAVBAR],
      hero({ eyebrow: 'CONTACTO', title: 'Cuéntanos a dónde quieres ir', subtitle: 'Respondemos con una propuesta en menos de 24 horas.', tone: 'sunset', minHeight: '480px' }),
      [block('channels', 'FeaturesSectionBlock', { eyebrow: 'Hablemos', title: 'Elige cómo prefieres escribirnos', subtitle: '', layout: 'grid-3', iconStyle: 'arrow', background: 'white', features: 'Correo electrónico\nhola@auroraviajes.com — cuéntanos fechas, destino y presupuesto.\n---\nWhatsApp\n+52 55 0000 0000 — de lunes a sábado de 9:00 a 20:00.\n---\nOficina\nAv. del Mar 200, Ciudad de México — con cita previa.' })],
      [FOOTER],
    ),
  },
]
