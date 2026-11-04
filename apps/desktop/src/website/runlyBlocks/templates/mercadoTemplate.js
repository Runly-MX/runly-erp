import { defineTemplate } from '@raulbellosom/atlas-web-builder'

// Mercado: a multi-category department store in deep green and warm off-white. Home blocks are the Mercado set
// (mercadoBlocks*.jsx); product grid, detail, cart and checkout reuse the live store blocks over the public catalog.
const block = (id, type, props, children = {}) => ({ id, type, props, children })
// Blocks listed as another block's children stay out of rootIds.
const page = (...blocks) => {
  const nested = new Set(blocks.flatMap((b) => Object.values(b.children).flat()))
  return { rootIds: blocks.filter((b) => !nested.has(b.id)).map((b) => b.id), blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) }
}

const header = (active) => block('header', 'MercadoHeaderBlock', {
  announcements: 'Envío gratis en compras desde $999\nDevoluciones fáciles en 30 días\nPagos 100% seguros',
  brand: 'Brote', tagline: 'Vive mejor', logoSrc: '', searchPlaceholder: 'Busca productos, marcas y más...', searchHref: '/productos',
  accountLabel: 'Mi cuenta', accountHref: '/contacto', wishlistLabel: 'Favoritos', wishlistHref: '/productos', cartLabel: 'Carrito', cartHref: '/carrito',
  allLabel: 'Todas las categorías', allHref: '/productos',
  links: 'Inicio | /\nTienda | /productos\nOfertas | /productos\nNovedades | /productos\nNosotros | /nosotros\nContacto | /contacto',
  active, sticky: true,
})

const FOOTER = block('footer', 'MercadoFooterBlock', {
  brand: 'Brote', tagline: 'Tu tienda para todo lo de cada día: calidad en todas las categorías, a un clic.',
  social: 'facebook | https://facebook.com\ninstagram | https://instagram.com\nx | https://x.com\nyoutube | https://youtube.com',
  columns: 'Tienda\nTodas las categorías | /productos\nNovedades | /productos\nMás vendidos | /productos\nOfertas | /productos\n---\nAtención al cliente\nMi carrito | /carrito\nEnvíos y devoluciones | /contacto\nPreguntas frecuentes | /contacto\nContacto | /contacto\n---\nEmpresa\nNosotros | /nosotros\nTrabaja con nosotros | /contacto\nSustentabilidad | /nosotros',
  appTitle: 'Descarga nuestra app', appText: 'Compra desde donde estés con nuestra app.', appStoreHref: '#', playStoreHref: '#',
  copyright: `© ${new Date().getFullYear()} Brote. Todos los derechos reservados.`,
  legal: 'Aviso de privacidad | /\nTérminos y condiciones | /\nPolítica de cookies | /', region: 'México (MXN)',
})

const services = () => block('services', 'MercadoServicesBlock', { items: 'envio | Envío gratis | En compras desde $999\ndevolucion | Devoluciones fáciles | Tienes 30 días para cambiar\ncandado | Pago seguro | Compra 100% protegida\nsoporte | Atención 24/7 | Estamos para ayudarte' })

// '@newsletter' becomes a site form named "Newsletter" when the template is applied.
const newsletter = () => [
  block('newsletter', 'MercadoNewsletterBlock', { title: 'No te pierdas nada', text: 'Ofertas exclusivas, novedades e ideas de estilo directo en tu correo.', note: 'Respetamos tu privacidad. Cancela cuando quieras.' }, { children: ['newsletter-form'] }),
  block('newsletter-form', 'ContactFormBlock', { formId: '@newsletter', successMessage: 'Gracias por suscribirte.', buttonLabel: 'Suscribirme' }),
]

const reviews = () => block('reviews', 'MercadoReviewsBlock', {
  title: 'Nos recomiendan miles', score: '4.8', scoreLabel: 'calificación promedio',
  reviews: 'Sara J. | 5\nCalidad increíble y entrega rapidísima. Se volvió mi tienda de confianza para todo.\n---\nMiguel T. | 5\nBuenos precios, atención excelente y devoluciones muy sencillas. La recomiendo.\n---\nPriya K. | 5\nMe encanta la variedad: encuentro todo en un solo lugar. Súper práctico.\n---\nLaura M. | 5\nEl empaque llegó impecable y el producto tal cual la foto. Volveré a comprar.\n---\nDaniel R. | 4\nPedí un domingo y el martes ya lo tenía. El seguimiento del envío es muy claro.',
})

// Interior pages open with a single, still slide of the hero.
const pageHero = (title, text, cta, href) => block('hero', 'MercadoHeroBlock', {
  slides: `${title} | ${text} | ${cta} | ${href}`, image1: '', image2: '', image3: '', sealTop: '', sealValue: '', sealBottom: '',
  trust: 'escudo | Calidad garantizada\nenvio | Envío a todo el país\nsoporte | Atención humana', autoplay: false, interval: '6000',
})

export const mercadoTemplate = defineTemplate({
  id: 'atlas-mercado',
  label: 'Mercado',
  description: 'Tienda departamental multicategoría: buscador, portada en carrusel, categorías con íconos, carrusel de productos en vivo, reseñas, newsletter y carrito con pago.',
  category: 'ecommerce',
  build() {
    return page(
      header('/'),
      block('hero', 'MercadoHeroBlock', {
        slides: 'Eleva tu día a día | Productos de calidad en todas las categorías, pensados para tu forma de vivir. | Comprar ahora | /productos\nTu casa, renovada | Textiles, iluminación y piezas que hacen hogar. | Ver hogar | /productos?c=hogar\nTecnología que acompaña | Audio, relojes y accesorios para todos los días. | Ver tecnología | /productos?c=electronica',
        image1: '', image2: '', image3: '', sealTop: 'Rebajas de verano', sealValue: '40%', sealBottom: 'de descuento',
        trust: 'escudo | Calidad garantizada\netiqueta | Precios justos\nclientes | Más de 10 mil clientes', autoplay: true, interval: '6000',
      }),
      block('categories', 'MercadoCategoriesBlock', {
        title: '',
        items: 'Electrónica | tv | /productos?c=electronica\nModa | moda | /productos?c=moda\nHogar | hogar | /productos?c=hogar\nBelleza | belleza | /productos?c=belleza\nDeportes | deporte | /productos?c=deportes\nJuguetes | juguetes | /productos?c=juguetes\nLibros | libros | /productos?c=libros\nMascotas | mascotas | /productos?c=mascotas\nVer todo | todo | /productos',
      }),
      block('picks', 'MercadoPicksBlock', { title: 'Elegidos para ti', linkLabel: 'Ver todas las ofertas', linkHref: '/productos', categorySlug: '', limit: '10', detailHref: '/producto' }),
      block('promos', 'MercadoPromoTilesBlock', {
        tiles: 'Novedades | Estilos frescos recién llegados | Comprar | /productos\nRenueva tu hogar | Haz de tu espacio algo mejor | Comprar | /productos?c=hogar\nTecnología esencial | Mejora tu estilo de vida | Comprar | /productos?c=electronica',
        image1: '', image2: '', image3: '',
      }),
      reviews(),
      ...newsletter(),
      services(),
      FOOTER,
    )
  },
})

export const mercadoSitePages = [
  {
    id: 'productos', label: 'Productos', routePath: '/productos', required: false, description: 'Catálogo con buscador y filtro por categoría.',
    build: () => page(
      header('/productos'),
      block('products', 'ProductsGridBlock', { categorySlug: '', limit: 24, columns: '4', showPrice: true, showSearch: true, showCategories: true, showAddToCart: true, detailHref: '/producto' }),
      services(),
      FOOTER,
    ),
  },
  {
    id: 'producto', label: 'Producto', routePath: '/producto', required: false, description: 'Detalle de producto (se abre desde la tienda con ?p=).',
    build: () => page(
      header('/productos'),
      block('detail', 'ProductDetailBlock', { addLabel: 'Agregar al carrito', backHref: '/productos', cartHref: '/carrito' }),
      block('picks', 'MercadoPicksBlock', { title: 'También te puede gustar', linkLabel: 'Ver todo', linkHref: '/productos', categorySlug: '', limit: '10', detailHref: '/producto' }),
      services(),
      FOOTER,
    ),
  },
  {
    id: 'carrito', label: 'Carrito', routePath: '/carrito', required: false, description: 'Carrito de compras y pago.',
    build: () => page(
      header('/carrito'),
      block('cart', 'CartPageBlock', { mode: 'cart', checkoutLabel: 'Pagar', shopHref: '/productos', promoNote: '¿Tienes un código? Lo ingresas al pagar.' }),
      services(),
      FOOTER,
    ),
  },
  {
    id: 'gracias', label: 'Gracias', routePath: '/gracias', required: false, description: 'Confirmación después del pago.',
    build: () => page(
      header('/carrito'),
      block('thanks', 'CartPageBlock', { mode: 'thanks', checkoutLabel: 'Pagar', shopHref: '/productos', promoNote: '¿Tienes un código? Lo ingresas al pagar.' }),
      block('picks', 'MercadoPicksBlock', { title: 'Sigue explorando', linkLabel: 'Ver todo', linkHref: '/productos', categorySlug: '', limit: '10', detailHref: '/producto' }),
      FOOTER,
    ),
  },
  {
    id: 'nosotros', label: 'Nosotros', routePath: '/nosotros', required: false, description: 'Quiénes somos y cómo elegimos lo que vendemos.',
    build: () => page(
      header('/nosotros'),
      pageHero('Todo lo bueno, en un solo lugar', 'Elegimos cada producto pensando en tu día a día: calidad comprobada, precio justo y un trato cercano.', 'Ver la tienda', '/productos'),
      block('story', 'FeaturesSectionBlock', {
        eyebrow: 'Quiénes somos', title: 'Una tienda que se gana tu confianza', subtitle: 'Así trabajamos desde el primer pedido.', layout: 'grid-2', iconStyle: 'check', background: 'white',
        features: 'Selección cuidadosa\nProbamos y comparamos antes de sumar algo al catálogo.\n---\nEnvíos confiables\nOperadores de paquetería con seguimiento en todo momento.\n---\nPrecios justos\nCompramos directo para que pagues por lo que importa.\n---\nAtención humana\nUna persona real te responde antes, durante y después de tu compra.',
      }),
      reviews(),
      ...newsletter(),
      FOOTER,
    ),
  },
  {
    id: 'contacto', label: 'Contacto', routePath: '/contacto', required: false, description: 'Atención al cliente e información de contacto.',
    build: () => page(
      header('/contacto'),
      pageHero('Estamos para ayudarte', 'Dudas sobre pedidos, envíos o devoluciones: escríbenos y respondemos en menos de 24 horas hábiles.', 'Ver la tienda', '/productos'),
      services(),
      block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
      FOOTER,
    ),
  },
]
