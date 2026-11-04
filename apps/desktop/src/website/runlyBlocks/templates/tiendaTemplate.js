import { defineTemplate } from '@raulbellosom/atlas-web-builder'

// Tienda: an editorial online store. Product grid, detail, cart and checkout are live blocks over the public catalog
// (/producto reads ?p=<slug>, /carrito checks out through the site's Stripe); everything decorative is CSS / inline SVG.
const NAVBAR = {
  id: 'navbar',
  type: 'NavbarBlock',
  props: {
    variant: 'light',
    brand: 'Mi Tienda',
    links: 'Inicio | /\nTienda | /productos\nNosotros | /nosotros\nContacto | /contacto',
    ctaLabel: 'Carrito',
    ctaHref: '/carrito',
    ctaVariant: 'outline',
    sticky: true,
    height: '64',
  },
  children: {},
}

const FOOTER = {
  id: 'footer',
  type: 'FooterBlock',
  props: {
    variant: 'primary',
    brand: 'Mi Tienda',
    tagline: 'Objetos hechos con calma, enviados con cuidado.',
    columns: 'Comprar | Comprar\nTodos los productos | /productos\nMi carrito | /carrito\n---\nAyuda | Ayuda\nContacto | /contacto\nNosotros | /nosotros\n---\nLegal | Legal\nTérminos y condiciones | /\nPolítica de privacidad | /',
    copyright: `© ${new Date().getFullYear()} Mi Tienda. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

const block = (id, type, props, children = {}) => ({ id, type, props, children })
const page = (...blocks) => ({ rootIds: blocks.map((b) => b.id), blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) })

const storeHero = (props) => block('hero', 'StoreHeroBlock', { eyebrow: '', highlight: '', subtitle: '', ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '', badge: '', size: 'compact', ...props })

const grid = (props = {}) => block('products', 'ProductsGridBlock', { categorySlug: '', limit: 8, columns: '4', showPrice: true, showSearch: false, showCategories: false, showAddToCart: true, detailHref: '/producto', ...props })

const trust = (tone = 'light') => block('trust', 'TrustStripBlock', { items: 'Envío a todo el país|Gratis desde $999\nDevolución en 30 días|Sin preguntas\nPago seguro|Tarjeta con cifrado\nAtención humana|Respondemos en el día', tone })

const closing = block('cta', 'CtaBannerBlock', {
  eyebrow: 'Hablemos',
  title: '¿Buscas algo que no ves aquí?',
  subtitle: 'Escríbenos y te ayudamos a encontrarlo o a pedirlo a tu medida.',
  ctaLabel: 'Escribirnos',
  ctaHref: '/contacto',
  ctaSecondLabel: 'Ver la tienda',
  ctaSecondHref: '/productos',
  variant: 'solid-primary',
  size: 'compact',
  align: 'center',
})

const testimonials = block('testimonials', 'TestimonialsBlock', {
  eyebrow: 'Reseñas verificadas',
  title: 'Lo que dicen quienes ya compraron',
  columns: '3',
  background: 'muted',
  testimonials: 'Diana Flores|Cliente verificada|5\nLa calidad superó mis expectativas. El empaque es hermoso y llegó en perfectas condiciones.\n---\nMiguel Herrera|Comprador frecuente|5\nTuve un problema con mi pedido y lo resolvieron en menos de 24 horas. Trato impecable.\n---\nIsabel Navarro|Primera compra|5\nEl proceso fue sencillo y seguro, y el producto llegó antes de lo esperado.',
})

export const tiendaTemplate = defineTemplate({
  id: 'atlas-tienda',
  label: 'Tienda en línea',
  description: 'Tienda editorial con catálogo en vivo, buscador, detalle de producto, carrito y pago; portada y colecciones ilustradas sin fotos.',
  category: 'ecommerce',
  build() {
    return page(
      NAVBAR,
      storeHero({ eyebrow: 'Colección de temporada', title: 'Objetos para vivir', highlight: 'con calma', subtitle: 'Piezas hechas con cuidado, materiales honestos y envío a todo el país. Elige lo que te acompañará años.', ctaLabel: 'Comprar ahora', ctaHref: '/productos', ctaSecondLabel: 'Nuestra historia', ctaSecondHref: '/nosotros', badge: 'Envío gratis desde $999', size: 'full' }),
      block('marquee', 'MarqueeBlock', { items: 'Hecho a mano · Envío a todo el país · Materiales honestos · Devolución en 30 días · Pago seguro', speed: 'slow', background: 'dark', size: 'md' }),
      block('collections', 'CollectionTilesBlock', {
        eyebrow: 'Colecciones',
        title: 'Encuentra tu próxima pieza favorita',
        tiles: 'Hogar|Texturas suaves y objetos que se quedan.|/productos\nModa|Cortes simples, telas nobles.|/productos\nPapelería|Para escribir despacio.|/productos\nRegalos|Detalles que sí se notan.|/productos',
        linkLabel: 'Explorar',
      }),
      block('featured-title', 'QuoteBlock', { quote: 'Lo esencial, bien hecho. Esto es lo que más se lleva esta temporada.', attribution: 'Selección del equipo', background: 'cream', size: 'normal', ornament: 'false' }),
      grid({ limit: 8 }),
      trust(),
      testimonials,
      closing,
      FOOTER,
    )
  },
})

export const tiendaSitePages = [
  {
    id: 'productos',
    label: 'Productos',
    routePath: '/productos',
    required: false,
    description: 'Catálogo con buscador y filtro por categoría.',
    build: () => page(
      NAVBAR,
      storeHero({ eyebrow: 'Tienda', title: 'Todo el', highlight: 'catálogo', subtitle: 'Busca por nombre o filtra por categoría. Cada pieza se envía con cuidado.' }),
      grid({ limit: 24, showSearch: true, showCategories: true }),
      trust('dark'),
      FOOTER,
    ),
  },
  {
    id: 'producto',
    label: 'Producto',
    routePath: '/producto',
    required: false,
    description: 'Detalle de producto (se abre desde la tienda con ?p=).',
    build: () => page(
      NAVBAR,
      block('detail', 'ProductDetailBlock', { addLabel: 'Agregar al carrito', backHref: '/productos', cartHref: '/carrito' }),
      trust(),
      FOOTER,
    ),
  },
  {
    id: 'carrito',
    label: 'Carrito',
    routePath: '/carrito',
    required: false,
    description: 'Carrito de compras y pago.',
    build: () => page(
      NAVBAR,
      block('cart', 'CartPageBlock', { mode: 'cart', checkoutLabel: 'Pagar', shopHref: '/productos' }),
      trust(),
      FOOTER,
    ),
  },
  {
    id: 'gracias',
    label: 'Gracias',
    routePath: '/gracias',
    required: false,
    description: 'Confirmación después del pago.',
    build: () => page(
      NAVBAR,
      block('thanks', 'CartPageBlock', { mode: 'thanks', checkoutLabel: 'Pagar', shopHref: '/productos' }),
      FOOTER,
    ),
  },
  {
    id: 'nosotros',
    label: 'Nosotros',
    routePath: '/nosotros',
    required: false,
    description: 'Nuestra historia y compromiso con la calidad.',
    build: () => page(
      NAVBAR,
      storeHero({ eyebrow: 'Sobre Mi Tienda', title: 'Hacemos pocas cosas,', highlight: 'bien hechas', subtitle: 'Una tienda pequeña con una idea clara: menos cosas, mejores cosas, y un trato humano de principio a fin.', ctaLabel: 'Ver la tienda', ctaHref: '/productos' }),
      block('story', 'FeaturesSectionBlock', {
        eyebrow: 'Quiénes somos',
        title: 'Calidad y confianza en cada compra',
        subtitle: 'Seleccionamos cada pieza como si fuera para nosotros.',
        layout: 'grid-2',
        iconStyle: 'check',
        background: 'white',
        features: 'Selección rigurosa\nCada producto pasa por un proceso de selección y control antes de llegar a ti.\n---\nEnvíos cuidados\nTrabajamos con operadores confiables y empacamos con materiales reciclables.\n---\nPrecios justos\nSin intermediarios innecesarios, para que pagues por lo que importa.\n---\nAtención personal\nUna persona real te responde antes, durante y después de tu compra.',
      }),
      testimonials,
      closing,
      FOOTER,
    ),
  },
  {
    id: 'contacto',
    label: 'Contacto',
    routePath: '/contacto',
    required: false,
    description: 'Atención al cliente e información de contacto.',
    build: () => page(
      NAVBAR,
      storeHero({ eyebrow: 'Atención al cliente', title: 'Estamos para', highlight: 'ayudarte', subtitle: 'Dudas sobre pedidos, envíos o devoluciones: escríbenos y respondemos en menos de 24 horas hábiles.' }),
      block('info', 'FeaturesSectionBlock', {
        eyebrow: 'Canales',
        title: 'Elige cómo prefieres escribirnos',
        subtitle: '',
        layout: 'grid-3',
        iconStyle: 'arrow',
        background: 'white',
        features: 'Correo electrónico\nEscríbenos a hola@mitienda.com. Respondemos en menos de 24 horas hábiles.\n---\nWhatsApp\nChatea con nosotros al +52 55 0000 0000, de lunes a sábado de 9 a 19 h.\n---\nDevoluciones\nSi tu compra no cumple tus expectativas, la devuelves en 30 días sin costo.',
      }),
      block('form', 'ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te responderemos muy pronto.', buttonLabel: 'Enviar mensaje' }),
      FOOTER,
    )
  },
]
