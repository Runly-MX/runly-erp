import { defineTemplate } from '@raulbellosom/atlas-web-builder'

// Aurora Viajes: a travel journal. Every destination is a chapter with its own illustrated landscape; the layered
// landscapes drift at different speeds while scrolling. No photos needed: the art is generated markup.
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

const hero = (props, id = 'hero') => block(id, 'LandscapeHeroBlock', { ctaSecondLabel: '', ctaSecondHref: '', cue: 'Desplázate', ...props })

const chapter = (id, props) => block(id, 'ChapterBlock', { ctaLabel: 'Ver itinerario', ctaHref: '/contacto', flip: 'left', tone: 'light', ...props })

const CHAPTERS = {
  costa: { scene: 'ocean', kicker: 'Capítulo uno', title: 'Costa del Pacífico', body: 'Atardeceres largos, surf suave y cocina de mar a pie de playa. Un viaje para bajar el ritmo y mirar el horizonte.', details: 'Mejor época | Nov – Abr\nDuración | 5 a 9 días\nDesde | $18,900', place: 'Pacífico · 19.4° N' },
  sierra: { scene: 'forest', kicker: 'Capítulo dos', title: 'Sierra y bosque', body: 'Cabañas de madera, rutas guiadas al amanecer y noches de estrellas lejos del ruido.', details: 'Mejor época | Oct – Mar\nDuración | 3 a 6 días\nDesde | $9,400', place: 'Sierra Madre · 25.6° N' },
  desierto: { scene: 'desert', kicker: 'Capítulo tres', title: 'Desierto y cielo', body: 'Campamentos de lujo, astronomía y caminatas entre dunas cuando la luz es más suave.', details: 'Mejor época | Sep – Feb\nDuración | 4 a 7 días\nDesde | $14,200', place: 'Desierto · 31.2° N' },
  cumbres: { scene: 'mountains', kicker: 'Capítulo cuatro', title: 'Cumbres y volcanes', body: 'Ascensos acompañados, refugios con chimenea y un amanecer sobre las nubes que no se olvida.', details: 'Mejor época | Nov – May\nDuración | 4 a 6 días\nDesde | $12,800', place: 'Altiplano · 19.0° N' },
}

const TESTIMONIALS = 'Valeria Núñez|Costa del Pacífico|5\nNos armaron un itinerario perfecto. No tuvimos que preocuparnos por nada y cada día tuvo una sorpresa.\n---\nAndrés Pizarro|Sierra y bosque|5\nLas cabañas, las rutas y hasta los horarios estaban pensados al detalle. Volveremos sin duda.\n---\nMarina Solís|Viaje en grupo|5\nOrganizar a doce personas parecía imposible. Con Aurora fue sencillo y todos quedaron felices.'

const testimonials = (title) => block('testimonials', 'TestimonialsBlock', { eyebrow: 'Viajeros felices', title, columns: '3', background: 'dark', testimonials: TESTIMONIALS })

const closing = (scene) => hero({
  scene, eyebrow: 'Tu próximo capítulo', title: 'Cuéntanos a dónde', highlight: 'quieres ir', subtitle: 'Te respondemos con una propuesta en menos de 24 horas.',
  ctaLabel: 'Planear mi viaje', ctaHref: '/contacto', ctaSecondLabel: 'Ver destinos', ctaSecondHref: '/destinos', height: '680px', cue: '',
}, 'closing')

const page = (...blocks) => ({ rootIds: blocks.map((b) => b.id), blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) })

export const auroraTemplate = defineTemplate({
  id: 'atlas-aurora',
  label: 'Aurora Viajes',
  description: 'Cuaderno de viajes: paisajes ilustrados en capas que se mueven a distinta velocidad, capítulos editoriales por destino y tipografía serif.',
  category: 'viajes',
  build() {
    return page(
      NAVBAR,
      hero({ scene: 'mountains', eyebrow: 'Cuaderno de viajes', coordinates: '19.43° N · 99.13° O', title: 'Viaja a donde', highlight: 'cambia el cielo', subtitle: 'Itinerarios a la medida, guías locales y hoteles con encanto. Tú eliges el destino; nosotros cuidamos cada detalle.', ctaLabel: 'Ver destinos', ctaHref: '/destinos', ctaSecondLabel: 'Planear mi viaje', ctaSecondHref: '/contacto', height: '820px' }),
      block('marquee', 'MarqueeBlock', { items: 'Costa del Pacífico · Sierra y bosque · Desierto y cielo · Cumbres y volcanes · Islas del Caribe · Ruta del vino', speed: 'slow', background: 'dark', size: 'lg' }),
      block('manifesto', 'QuoteBlock', { quote: 'No vendemos paquetes. Diseñamos capítulos de los que querrás volver a hablar.', attribution: 'El equipo de Aurora', background: 'cream', size: 'large', ornament: 'false' }),
      chapter('costa', { ...CHAPTERS.costa, index: '01' }),
      chapter('sierra', { ...CHAPTERS.sierra, index: '02', flip: 'right', tone: 'dark' }),
      chapter('desierto', { ...CHAPTERS.desierto, index: '03' }),
      block('numbers', 'StatsBlock', { eyebrow: '', title: '', stats: '12+\nAños organizando viajes\nCon la misma pasión\n---\n4,800+\nViajeros felices\nQue ya volvieron\n---\n60+\nDestinos\nEn tres continentes\n---\n4.9/5\nCalificación promedio\nEn reseñas verificadas', background: 'dark', align: 'center' }),
      testimonials('Lo que cuentan de su viaje'),
      closing('desert'),
      FOOTER,
    )
  },
})

export const auroraSitePages = [
  {
    id: 'destinos', label: 'Destinos', routePath: '/destinos', description: 'Destinos disponibles.',
    build: () => page(
      NAVBAR,
      hero({ scene: 'desert', eyebrow: 'Destinos', title: 'Elige tu próximo', highlight: 'destino', subtitle: 'Mar, sierra, desierto o cumbres: todo con itinerario y reservas incluidos.', ctaLabel: 'Pedir propuesta', ctaHref: '/contacto', height: '680px' }),
      chapter('costa', { ...CHAPTERS.costa, index: '01' }),
      chapter('sierra', { ...CHAPTERS.sierra, index: '02', flip: 'right', tone: 'dark' }),
      chapter('desierto', { ...CHAPTERS.desierto, index: '03' }),
      chapter('cumbres', { ...CHAPTERS.cumbres, index: '04', flip: 'right', tone: 'dark' }),
      closing('mountains'),
      FOOTER,
    ),
  },
  {
    id: 'experiencias', label: 'Experiencias', routePath: '/experiencias', description: 'Formas de viajar y lo que incluyen.',
    build: () => page(
      NAVBAR,
      hero({ scene: 'forest', eyebrow: 'Experiencias', title: 'Viajes pensados', highlight: 'para ti', subtitle: 'Desde una escapada de fin de semana hasta una ruta de dos semanas.', ctaLabel: 'Planear mi viaje', ctaHref: '/contacto', height: '680px' }),
      chapter('medida', { scene: 'mountains', index: '01', kicker: 'A tu medida', title: 'Viaje a tu medida', body: 'Cuéntanos qué buscas y diseñamos el itinerario completo, con vuelos, hospedaje y actividades.', details: 'Planeación | 1 semana\nIncluye | Todo\nAsesor | Personal', place: 'Diseño propio' }),
      chapter('escapadas', { scene: 'ocean', index: '02', kicker: 'Cerca de casa', title: 'Escapadas de fin de semana', body: 'Planes cortos y cercanos, listos para reservar, para desconectar sin complicaciones.', details: 'Duración | 2 a 3 días\nSalidas | Cada viernes\nDesde | $4,900', place: 'Fin de semana', flip: 'right', tone: 'dark' }),
      chapter('grupos', { scene: 'forest', index: '03', kicker: 'Juntos', title: 'Viajes en grupo', body: 'Familias, equipos y amigos: coordinamos todo, desde el transporte hasta las comidas.', details: 'Grupos | 6 a 40\nCoordinador | Incluido\nPagos | En parcialidades', place: 'En grupo' }),
      block('included', 'FeaturesSectionBlock', { eyebrow: 'Incluido', title: 'En todos nuestros viajes', subtitle: '', layout: 'grid-2', iconStyle: 'check', background: 'muted', features: 'Asesor personal\nUna persona te acompaña antes, durante y después del viaje.\n---\nHoteles seleccionados\nVisitamos y elegimos cada hospedaje.\n---\nGuías locales\nConocedores que cuentan la historia del lugar.\n---\nAsistencia 24 horas\nSoporte por teléfono y mensaje durante todo el viaje.' }),
      testimonials('Opiniones'),
      closing('ocean'),
      FOOTER,
    ),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', description: 'Canales de contacto.',
    build: () => page(
      NAVBAR,
      hero({ scene: 'ocean', eyebrow: 'Contacto', title: 'Cuéntanos a dónde', highlight: 'quieres ir', subtitle: 'Respondemos con una propuesta en menos de 24 horas.', ctaLabel: '', height: '560px', cue: '' }),
      block('channels', 'FeaturesSectionBlock', { eyebrow: 'Hablemos', title: 'Elige cómo prefieres escribirnos', subtitle: '', layout: 'grid-3', iconStyle: 'arrow', background: 'white', features: 'Correo electrónico\nhola@auroraviajes.com — cuéntanos fechas, destino y presupuesto.\n---\nWhatsApp\n+52 55 0000 0000 — de lunes a sábado de 9:00 a 20:00.\n---\nOficina\nAv. del Mar 200, Ciudad de México — con cita previa.' }),
      FOOTER,
    ),
  },
]
