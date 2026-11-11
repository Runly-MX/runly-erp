import { defineTemplate } from '@raulbellosom/atlas-web-builder'

export const habitiaThemeTokens = {
  color: {
    primary:    '#A4522E',
    bg:         '#FAF7F2',
    foreground: '#2A1E17',
    muted:      '#6B5A4C',
  },
}

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant:    'light',
    brand:      'Habitia',
    links:      'Inicio | /\nColección | /coleccion\nNosotros | /nosotros\nCuidados | /cuidados\nContacto | /contacto',
    ctaLabel:   'Ver colección',
    ctaHref:    '/coleccion',
    ctaVariant: 'solid',
    sticky:     true,
    height:     '68',
  },
  children: {},
}

const FOOTER = {
  id: 'footer',
  type: 'SiteFooterBlock',
  props: {
    tone: 'ink',
    brand:    'Habitia',
    tagline:  'Objetos que dan vida al hogar.',
    columns:  'Colecciones | Colecciones\nSala | /coleccion\nComedor | /coleccion\nRecámara | /coleccion\nJardín | /coleccion\n---\nHabitia | Habitia\nNuestra historia | /nosotros\nGuía de cuidados | /cuidados\nContacto | /contacto\n---\nAyuda | Ayuda\nEnvíos y devoluciones | /\nPreguntas frecuentes | /\nPolítica de privacidad | /',
    copyright: `© ${new Date().getFullYear()} Habitia. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const block = (id, type, props, children = {}) => ({ id, type, props, children })
const page = (...blocks) => ({ rootIds: blocks.map((b) => b.id), blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) })

// Live products only publish on ecommerce sites, and this template is also offered to plain websites, so the
// collections are presented as editorial blocks that link to the contact page.
const rooms = (props) => block('rooms', 'HabitiaRoomsBlock', props)
const materials = () => block('materials', 'HabitiaMaterialsBlock', { eyebrow: 'Materiales', title: 'Hecho para durar y envejecer bien', materials: 'Madera maciza | Aceite de teca cada seis meses.\nLino lavado | Lavado en frío, plancha en húmedo.\nCerámica | A mano y sin cambios bruscos de calor.\nCuero natural | Crema acondicionadora dos veces al año.\nRatán | Paño seco y a la sombra.' })
const closing = (props) => block('closing', 'HabitiaClosingBlock', props)
const masthead = (props) => block('hero', 'HabitiaPageHeroBlock', props)

export const habitiaTemplate = defineTemplate({
  id:          'atlas-habitia',
  label:       'Habitia',
  description: 'Tienda de hogar y decoración con aire de lookbook: tipografía serif, paleta tierra y objetos ilustrados en capas.',
  category:    'hogar',
  build() {
    return page(
      NAVBAR,
      block('hero', 'HabitiaHeroBlock', {}),
      rooms({ eyebrow: 'Índice', title: 'Un cuarto', highlight: 'a la vez', href: '/coleccion', rooms: 'Sala | Sofás de lino, mesas bajas y lámparas de luz cálida para quedarse a conversar. | 24 piezas\nComedor | Mesas de madera maciza, sillas tejidas y vajilla hecha a mano. | 18 piezas\nRecámara | Ropa de cama en algodón lavado, veladores y luz que baja el ritmo. | 21 piezas\nJardín | Macetas, bancas y textiles que aguantan sol, lluvia y sobremesas. | 15 piezas' }),
      block('pieces', 'HabitiaPiecesBlock', {}),
      materials(),
      block('quote', 'HabitiaQuoteBlock', {}),
      closing({ eyebrow: 'Comunidad Habitia', title: 'Deja la luz', highlight: 'encendida', subtitle: 'Escríbenos y te ayudamos a encontrar la pieza justa para tu espacio, sin compromiso.', ctaLabel: 'Hablar con nosotros', ctaHref: '/contacto', note: 'Respondemos en menos de 24 horas.' }),
      FOOTER,
    )
  },
})

export const habtiaSitePages = [
  {
    id:          'coleccion',
    label:       'Colección',
    routePath:   '/coleccion',
    required:    false,
    description: 'Catálogo de piezas por habitación.',
    build: () => page(
      NAVBAR,
      masthead({ folio: 'Colección · Nº 02', title: 'La colección,', highlight: 'cuarto por cuarto', subtitle: 'Piezas seleccionadas para transformar cualquier espacio.', scene: 'coleccion' }),
      rooms({ eyebrow: 'Explorar por espacio', title: 'Encuentra', highlight: 'tu estilo', href: '/contacto', rooms: 'Sala | Sofás, mesas, textiles y accesorios para el corazón del hogar. | 24 piezas\nComedor | Mesas, sillas y complementos para los momentos que importan. | 18 piezas\nRecámara | Ropa de cama, lámparas y objetos para el descanso. | 21 piezas\nJardín | Piezas que llevan el diseño al exterior. | 15 piezas' }),
      block('pieces', 'HabitiaPiecesBlock', { eyebrow: 'Piezas icónicas', title: 'Las que más', highlight: 'se quedan', ctaLabel: 'Consultar disponibilidad', ctaHref: '/contacto', pieces: 'Jarrón Duna | Cerámica esmaltada | $1,290 | jarron\nLámpara Brasa | Base de barro, pantalla de lino | $2,480 | lampara\nPalma de interior | Maceta de terracota | $890 | planta\nCuenco Arena | Gres hecho a mano | $540 | cuenco\nVela Ámbar | Cera de soya, 40 horas | $320 | vela\nLibros de mesa | Selección de arte y diseño | $680 | libros\nJarrón Lomo | Barro tinto, tiro largo | $1,060 | jarron\nFarol Alba | Luz cálida, base cerámica | $1,980 | lampara' }),
      materials(),
      closing({ eyebrow: '¿No lo encuentras?', title: 'Cuéntanos qué', highlight: 'necesitas', subtitle: 'Te ayudamos a encontrar la pieza perfecta para tu espacio.', ctaLabel: 'Contactarnos', ctaHref: '/contacto', note: '' }),
      FOOTER,
    ),
  },
  {
    id:          'nosotros',
    label:       'Nosotros',
    routePath:   '/nosotros',
    required:    false,
    description: 'La historia y valores detrás de Habitia.',
    build: () => page(
      NAVBAR,
      masthead({ folio: 'Nosotros · Nº 03', title: 'Nuestra', highlight: 'historia', subtitle: 'Habitia nació de la convicción de que un objeto bien hecho puede cambiar la manera en que vivimos.', scene: 'historia' }),
      block('story1', 'HabitiaStoryBlock', {}),
      block('story2', 'HabitiaStoryBlock', { eyebrow: 'Nuestra filosofía', year: '1:1', title: 'Compra menos,', highlight: 'compra mejor', body: 'Cada pieza está pensada para durar décadas, no temporadas. Trabajamos con artesanos y fabricantes que comparten esta visión y que pagan salarios justos.', signature: 'Ana y Diego', scene: 'taller', flip: 'right' }),
      block('quote', 'HabitiaQuoteBlock', { quote: 'Cada objeto que elegimos ha pasado primero por nuestras manos. Si no lo tendríamos en casa, no lo vendemos.', attribution: 'Los fundadores', folio: '12', scene: 'taller' }),
      block('figures', 'HabitiaFiguresBlock', {}),
      closing({ eyebrow: 'Conócenos', title: 'Pasa a', highlight: 'tomar un café', subtitle: 'Nuestro taller-tienda está abierto de lunes a sábado. Ven a ver y tocar las piezas.', ctaLabel: 'Escribirnos', ctaHref: '/contacto', note: '' }),
      FOOTER,
    ),
  },
  {
    id:          'cuidados',
    label:       'Cuidados',
    routePath:   '/cuidados',
    required:    false,
    description: 'Guía de cuidado y mantenimiento de los materiales.',
    build: () => page(
      NAVBAR,
      masthead({ folio: 'Cuidados · Nº 04', title: 'Guía de', highlight: 'cuidados', subtitle: 'Con el cuidado correcto, tus piezas Habitia durarán toda la vida.', scene: 'cuidados' }),
      block('leaflet', 'HabitiaLeafletBlock', {}),
      block('warranty', 'HabitiaStoryBlock', { eyebrow: 'Nuestra garantía', year: '2 años', title: 'Si algo falla,', highlight: 'lo arreglamos', body: 'Todas las piezas Habitia tienen garantía mínima de dos años. Si algo falla por un defecto de fabricación, lo reparamos o reemplazamos sin preguntas.', signature: 'El equipo Habitia', scene: 'sala', flip: 'right' }),
      closing({ eyebrow: '¿Dudas?', title: 'Pregúntanos por', highlight: 'tu pieza', subtitle: 'Escríbenos y te respondemos en menos de 24 horas.', ctaLabel: 'Escribirnos', ctaHref: '/contacto', note: '' }),
      FOOTER,
    ),
  },
  {
    id:          'contacto',
    label:       'Contacto',
    routePath:   '/contacto',
    required:    false,
    description: 'Información de contacto y atención al cliente.',
    build: () => page(
      NAVBAR,
      masthead({ folio: 'Contacto · Nº 05', title: 'Hablemos de', highlight: 'tu espacio', subtitle: 'Resolvemos dudas sobre productos, envíos y garantías.', scene: 'contacto' }),
      block('info', 'FeaturesSectionBlock', {
        eyebrow: 'Estamos aquí', title: 'Elige cómo escribirnos', subtitle: '', layout: 'grid-3', iconStyle: 'check', background: 'white',
        features: 'Correo electrónico\nhola@habitia.mx — Consultas, pedidos especiales y colaboraciones.\n---\nWhatsApp\n+52 55 0000 0000 — Lunes a sábado, 9am–7pm. Te respondemos en minutos.\n---\nEnvíos\nEntregamos en toda la República Mexicana. Envío gratis en pedidos mayores a $1,500.',
      }),
      block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
      FOOTER,
    ),
  },
]
