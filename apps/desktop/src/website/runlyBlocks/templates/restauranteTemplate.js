import { defineTemplate } from '@raulbellosom/atlas-web-builder'

const MENU = 'Para empezar\nEnsalada de la casa | Mixta con aderezo balsámico y manchego | 9\nSopa de fideo seco | Receta tradicional con chipotle y crema | 7\nCeviche de camarón | Camarón fresco, limón, cilantro y chile | 13\n---\nPlatos fuertes\nFilete a las brasas | 300 g con guarnición a elegir | 32\nPollo en mole negro | Mole de treinta ingredientes con arroz | 22\nPasta al pesto | Fettuccine con pesto artesanal y parmesano | 18\nPescado a la plancha | Filete del día con verduras asadas | 26\n---\nPara cerrar\nFlan de cajeta | Receta de la abuela | 6\nPastel de tres leches | Esponjoso y húmedo | 7.5\nHelado artesanal | Tres bolas a elegir | 5'

const b = (id, type, props) => ({ id, type, props, children: {} })
const page = (blocks) => ({ rootIds: blocks.map((x) => x.id), blocks: Object.fromEntries(blocks.map((x) => [x.id, x])) })

const TESTIMONIALS = b('testimonials', 'TestimonialsBlock', {
  eyebrow: 'Nuestros comensales',
  title: 'Lo que dicen quienes nos visitan',
  columns: '3',
  background: 'dark',
  testimonials: 'Valentina Cruz|Cliente frecuente|5\nSin duda el mejor restaurante de la ciudad. La comida es exquisita y el servicio impecable. Cada vez que vengo es una experiencia distinta y siempre sorprendente.\n---\nRoberto Sánchez|Empresario|5\nLlevé a un cliente importante y quedó encantado. El ambiente es elegante sin ser pretencioso y los platillos llegaron perfectos y a tiempo.\n---\nLaura Ibáñez|Foodie y blogger|4\nUna cocina honesta y llena de sabor. El mole negro es espectacular y el servicio muy atento. Un lugar que recomendaré siempre.',
})

const QUOTE = b('quote', 'QuoteBlock', { quote: 'La buena mesa empieza con buenos ingredientes y termina con buena compañía.', attribution: '— El equipo de cocina', background: 'cream', size: 'large', ornament: 'true' })

const hours = (id, props = {}) => b(id, 'RestoHoursBlock', {
  eyebrow: 'Reservaciones', title: 'Te guardamos tu mesa',
  hours: 'Lun – Vie | 1:00 – 11:00 pm\nSábados | 12:00 – 11:30 pm\nDomingos | 12:00 – 9:00 pm',
  address: 'Calle del Mercado 24, Centro Histórico, Ciudad de México',
  phone: 'Tel. +52 55 0000 0000', note: 'Grupos de seis o más: avísanos con un día de anticipación.',
  ctaLabel: 'Reservar mesa', ctaHref: '/contacto', ctaSecondLabel: 'Llamar', ctaSecondHref: 'tel:+525500000000',
  ...props,
})

const pageHero = (eyebrow, title, accent, subtitle) => b('hero', 'RestoHeroBlock', {
  size: 'page', eyebrow, title, accent, subtitle, ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '', boardTitle: '', dishes: '', stamp: '',
})

const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'dark',
    brand: 'El Sabor',
    links: 'Inicio | /\nMenú | /menu\nGalería | /galeria\nNosotros | /nosotros\nContacto | /contacto',
    ctaLabel: 'Reservar mesa',
    ctaHref: '/contacto',
    ctaVariant: 'solid',
    sticky: true,
    height: '72',
  },
  children: {},
}

const FOOTER = {
  id: 'footer',
  type: 'FooterBlock',
  props: {
    variant: 'dark',
    brand: 'El Sabor',
    tagline: 'Cocina de autor con alma y tradición.',
    columns: 'Navegar | Navegar\nInicio | /\nMenú | /menu\nGalería | /galeria\nNosotros | /nosotros\n---\nContacto | Contacto\nReservaciones | /contacto\nWhatsApp | /\nInstagram | /\n---\nHorario | Horario\nLunes a Viernes | /\n1:00pm – 11:00pm | /\nSábados y Domingos | /\n12:00pm – 11:30pm | /',
    copyright: `© ${new Date().getFullYear()} El Sabor. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

export const restauranteTemplate = defineTemplate({
  id: 'atlas-restaurante',
  label: 'Restaurante',
  description: 'Sitio editorial para restaurantes y cafeterías: pizarra de portada, carta numerada y reservaciones.',
  category: 'restaurante',
  build() {
    return page([
      NAVBAR,
      b('hero', 'RestoHeroBlock', {
        size: 'full', eyebrow: 'Cocina de mercado desde 2012', title: 'Una mesa para', accent: 'quedarse',
        subtitle: 'Producto de temporada, fuego lento y recetas de casa. Cenas sin prisa en el corazón de la ciudad.',
        ctaLabel: 'Reservar mesa', ctaHref: '/contacto', ctaSecondLabel: 'Ver la carta', ctaSecondHref: '/menu',
        boardTitle: 'Hoy en la mesa',
        dishes: 'Ceviche de camarón | 13 | Limón, cilantro y chile serrano\nPollo en mole negro | 22 | Treinta ingredientes, arroz y frijoles\nFilete a las brasas | 32 | 300 g con guarnición a elegir\nFlan de cajeta | 6 | Receta de la abuela',
        stamp: 'Hecho a mano',
      }),
      b('menu', 'RestoMenuBlock', { eyebrow: 'La carta', title: 'Lo que servimos', subtitle: 'Platillos de temporada, hechos al momento.', currency: '$', tone: 'paper', menu: MENU }),
      TESTIMONIALS,
      QUOTE,
      hours('booking'),
      FOOTER,
    ])
  },
})

export const restauranteSitePages = [
  {
    id: 'menu', label: 'Menú', routePath: '/menu', required: false, description: 'Nuestro menú completo con precios.',
    build: () => page([
      NAVBAR,
      pageHero('Lo que servimos', 'La carta de', 'temporada', 'Platillos elaborados con ingredientes frescos y pasión por la cocina de autor.'),
      b('menu', 'RestoMenuBlock', { eyebrow: 'Carta completa', title: 'Todo lo que servimos', subtitle: 'Cada platillo, con los mejores ingredientes de temporada.', currency: '$', tone: 'paper', menu: `${MENU}\n---\nPara beber\nAgua de fruta | Del día, 500 ml | 4\nVino de la casa | Copa, blanco o tinto | 8\nCerveza artesanal | Botella de 355 ml | 7\nCafé de olla | Con piloncillo y canela | 3.5` }),
      hours('booking'),
      FOOTER,
    ]),
  },
  {
    id: 'galeria', label: 'Galería', routePath: '/galeria', required: false, description: 'El ambiente de nuestro espacio y nuestros platillos.',
    build: () => page([
      NAVBAR,
      pageHero('Nuestro espacio', 'El ambiente que', 'te espera', 'Rincones pensados para cenas largas, brindis y sobremesas.'),
      b('tiles', 'ServicesGridBlock', {
        eyebrow: 'Rincones', title: 'Cuatro lugares para quedarte', subtitle: '', columns: '2', cardStyle: 'bordered', align: 'left',
        services: 'Salón principal\nMesas amplias, luz cálida y música suave para cenas sin prisa.\n---\nTerraza\nAire libre y vista al atardecer.\n---\nBarra\nCoctelería de autor y vinos por copa.\n---\nCocina abierta\nMira cómo preparamos cada platillo.',
      }),
      hours('booking', { title: 'Ven a conocerlo' }),
      FOOTER,
    ]),
  },
  {
    id: 'nosotros', label: 'Nosotros', routePath: '/nosotros', required: false, description: 'Nuestra historia y los valores del restaurante.',
    build: () => page([
      NAVBAR,
      pageHero('Sobre nosotros', 'Una cocina con', 'memoria', 'Conoce la pasión, los valores y las personas que hacen de El Sabor un lugar especial.'),
      b('story', 'FeaturesSectionBlock', {
        eyebrow: 'Nuestra historia', title: 'Más de una década compartiendo sabores',
        subtitle: 'Nacimos de la pasión por la cocina y el deseo de crear un lugar donde cada visita sea memorable.',
        layout: 'grid-2', iconStyle: 'check', background: 'white',
        features: 'Fundados en 2012\nComenzamos como un pequeño bistró familiar con una misión: cocina de autor accesible para nuestra comunidad.\n---\nIngredientes locales\nDesde el primer día trabajamos con proveedores locales y producto de temporada.\n---\nChef reconocido\nNuestro chef ejecutivo suma más de 15 años en cocinas de México, España e Italia.\n---\nPremio a la calidad\nReconocidos como uno de los mejores restaurantes de la región en 2022 y 2024.',
      }),
      QUOTE,
      TESTIMONIALS,
      hours('booking', { title: 'Ven a sentarte con nosotros' }),
      FOOTER,
    ]),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', required: false, description: 'Información de contacto y reservaciones.',
    build: () => page([
      NAVBAR,
      pageHero('Reservaciones', 'Reserva tu', 'mesa', 'Cuéntanos cuándo vienes y cuántos son. Te confirmamos en minutos.'),
      b('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, recibimos tu solicitud y te confirmaremos muy pronto.', buttonLabel: 'Solicitar reservación' }),
      hours('info', { eyebrow: 'Cómo encontrarnos', title: 'Horario y ubicación', ctaLabel: 'WhatsApp', ctaHref: 'https://wa.me/525500000000' }),
      FOOTER,
    ]),
  },
]
