import { defineTemplate } from '@raulbellosom/atlas-web-builder'

export const habitiaThemeTokens = {
  color: {
    primary:    '#B5603A',
    bg:         '#FAF7F2',
    foreground: '#1A1410',
    muted:      '#8C7E72',
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
  type: 'FooterBlock',
  props: {
    variant:  'dark',
    brand:    'Habitia',
    tagline:  'Objetos que dan vida al hogar.',
    columns:  'Colecciones | Colecciones\nSala | /coleccion\nComedor | /coleccion\nRecámara | /coleccion\nJardín | /coleccion\n---\nHabitia | Habitia\nNuestra historia | /nosotros\nGuía de cuidados | /cuidados\nContacto | /contacto\n---\nAyuda | Ayuda\nEnvíos y devoluciones | /\nPreguntas frecuentes | /\nPolítica de privacidad | /',
    copyright: `© ${new Date().getFullYear()} Habitia. Todos los derechos reservados.`,
    showBrand: true,
  },
  children: {},
}

export const habitiaTemplate = defineTemplate({
  id:          'atlas-habitia',
  label:       'Habitia',
  description: 'Tienda de hogar y decoración con estética warm lifestyle. Diseño editorial con bloques premium.',
  category:    'hogar',
  build() {
    return {
      rootIds: ['navbar', 'hero', 'marquee', 'split1', 'products', 'bento', 'split2', 'quote', 'gallery', 'testimonials', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: {
          id: 'hero', type: 'HeroBlock',
          props: {
            variant:         'centered',
            title:           'Objetos que dan vida al hogar',
            subtitle:        'Piezas seleccionadas por su diseño, durabilidad y el modo en que transforman los espacios.',
            eyebrow:         'Nueva colección',
            ctaLabel:        'Explorar colección',
            ctaHref:         '/coleccion',
            ctaVariant:      'solid',
            ctaSecondLabel:  'Nuestra historia',
            ctaSecondHref:   '/nosotros',
            imageSrc:        '',
            background:      { kind: 'color', token: 'muted' },
            align:           'center',
            paddingY:        '16',
            minHeight:       '90vh',
            titleSize:       '3xl',
            contentMaxWidth: '65ch',
          },
          children: {},
        },
        marquee: {
          id: 'marquee', type: 'MarqueeBlock',
          props: { items: 'Sala · Comedor · Recámara · Jardín · Baño · Estudio · Terraza', speed: 'normal', background: 'dark', size: 'md' },
          children: {},
        },
        split1: {
          id: 'split1', type: 'SplitFeatureBlock',
          props: {
            variant:     'image-right',
            eyebrow:     'Nuestra curaduría',
            title:       'Diseño con propósito',
            body:        'Cada pieza que ofrecemos pasa por un proceso de selección riguroso. Buscamos objetos que tengan historia, que estén hechos para durar y que mejoren la vida diaria de quienes los habitan.',
            ctaLabel:    'Conocer más',
            ctaHref:     '/nosotros',
            imageSrc:    '',
            imageAlt:    'Sala de estar curada por Habitia',
            background:  'white',
            imageHeight: 'full',
          },
          children: {},
        },
        products: {
          id: 'products', type: 'ProductsGridBlock',
          props: { categoryId: '', limit: 8, columns: '4', showPrice: true, showAddToCart: true },
          children: {},
        },
        bento: {
          id: 'bento', type: 'BentoGridBlock',
          props: {
            items:      'Sala de estar\nSofás, mesas y textiles que definen el corazón del hogar.\nlarge\n---\nComedor\nMesas y sillas para los momentos que importan.\nnormal\n---\nJardín\nPiezas que llevan el diseño al exterior.\ntall\n---\nRecámara\nTextiles y objetos para el descanso.\nnormal',
            background: 'cream',
          },
          children: {},
        },
        split2: {
          id: 'split2', type: 'SplitFeatureBlock',
          props: {
            variant:     'image-left',
            eyebrow:     'Calidad sin compromiso',
            title:       'Materiales que duran',
            body:        'Trabajamos directamente con artesanos y fabricantes que comparten nuestra visión: crear piezas que envejecen bien, que mejoran con el uso y que no terminan en la basura a los dos años.',
            ctaLabel:    'Guía de cuidados',
            ctaHref:     '/cuidados',
            imageSrc:    '',
            imageAlt:    'Detalle de materiales naturales',
            background:  'cream',
            imageHeight: 'full',
          },
          children: {},
        },
        quote: {
          id: 'quote', type: 'QuoteBlock',
          props: {
            quote:       'Un hogar no se construye con paredes. Se construye con los objetos que elegimos, las texturas que tocamos y la luz que dejamos entrar.',
            attribution: '— Habitia',
            background:  'cream',
            size:        'large',
            ornament:    'true',
          },
          children: {},
        },
        gallery: {
          id: 'gallery', type: 'GalleryBlock',
          props: {
            eyebrow:     'Espacios Habitia',
            title:       'Interiorismo con nuestras piezas',
            subtitle:    'Ambientes reales decorados con nuestra colección.',
            columns:     '3',
            gap:         'normal',
            aspectRatio: '4/3',
            image1: '', image2: '', image3: '',
            image4: '', image5: '', image6: '',
          },
          children: {},
        },
        testimonials: {
          id: 'testimonials', type: 'TestimonialsBlock',
          props: {
            eyebrow:      'Lo que dicen nuestros clientes',
            title:        'Hogares que confían en Habitia',
            columns:      '3',
            background:   'white',
            testimonials: 'Valentina M.|Diseñadora de interiores|5\nLlevo 3 años recomendando Habitia a mis clientes. La calidad es consistente, el servicio impecable y la curaduría está muy bien pensada. Siempre encuentro algo que encaja perfectamente.\n---\nJavier R.|Arquitecto|5\nLa mesa de comedor que compré tiene ya cuatro años y sigue igual de hermosa. Eso es lo que más valoro: objetos que envejecen bien y no te hacen sentir que compraste algo efímero.\n---\nSofía L.|Cliente frecuente|5\nEmpecé comprando un cojín y ya llevo seis piezas en casa. Lo que más me gusta es que todo combina — hay una coherencia visual en la colección que facilita mucho decorar.',
          },
          children: {},
        },
        cta: {
          id: 'cta', type: 'CtaBannerBlock',
          props: {
            eyebrow:        'Comunidad Habitia',
            title:          'Suscríbete y recibe 10% en tu primera compra',
            subtitle:       'Acceso anticipado a nuevas colecciones, guías de interiorismo y descuentos exclusivos.',
            ctaLabel:       'Suscribirme',
            ctaHref:        '#newsletter',
            ctaSecondLabel: '',
            ctaSecondHref:  '',
            variant:        'gradient-dark',
            size:           'normal',
            align:          'center',
          },
          children: {},
        },
        footer: FOOTER,
      },
    }
  },
})

export const habtiaSitePages = [
  {
    id:          'coleccion',
    label:       'Colección',
    routePath:   '/coleccion',
    required:    false,
    description: 'Catálogo completo de productos.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'categories', 'products', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: {
          id: 'hero', type: 'HeroBlock',
          props: {
            variant: 'centered', title: 'Nuestra Colección',
            subtitle: 'Piezas seleccionadas para transformar cualquier espacio.',
            eyebrow: 'Catálogo completo',
            ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '',
            imageSrc: '', background: { kind: 'color', token: 'muted' },
            align: 'center', paddingY: '12', minHeight: '40vh', titleSize: '2xl', contentMaxWidth: '55ch',
          },
          children: {},
        },
        categories: {
          id: 'categories', type: 'ServicesGridBlock',
          props: {
            eyebrow: 'Explorar por espacio', title: 'Encuentra tu estilo', subtitle: '',
            columns: '4', cardStyle: 'bordered', align: 'center',
            services: 'Sala\nSofás, mesas, textiles y accesorios para el corazón del hogar.\n---\nComedor\nMesas, sillas y complementos para los momentos que importan.\n---\nRecámara\nRopa de cama, lámparas y objetos para el descanso.\n---\nJardín & Terraza\nPiezas que llevan el diseño al exterior.',
          },
          children: {},
        },
        products: {
          id: 'products', type: 'ProductsGridBlock',
          props: { categoryId: '', limit: 12, columns: '4', showPrice: true, showAddToCart: true },
          children: {},
        },
        cta: {
          id: 'cta', type: 'CtaBannerBlock',
          props: {
            eyebrow: '', title: '¿No encuentras lo que buscas?',
            subtitle: 'Cuéntanos qué necesitas y te ayudamos a encontrar la pieza perfecta.',
            ctaLabel: 'Contactarnos', ctaHref: '/contacto',
            ctaSecondLabel: '', ctaSecondHref: '',
            variant: 'gradient-dark', size: 'compact', align: 'center',
          },
          children: {},
        },
        footer: FOOTER,
      },
    }),
  },
  {
    id:          'nosotros',
    label:       'Nosotros',
    routePath:   '/nosotros',
    required:    false,
    description: 'La historia y valores detrás de Habitia.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'split1', 'split2', 'quote', 'stats', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: {
          id: 'hero', type: 'HeroBlock',
          props: {
            variant: 'centered', title: 'Nuestra Historia',
            subtitle: 'Habitia nació de la convicción de que un objeto bien hecho puede cambiar la manera en que vivimos.',
            eyebrow: 'Sobre nosotros',
            ctaLabel: 'Ver colección', ctaHref: '/coleccion', ctaVariant: 'solid',
            ctaSecondLabel: '', ctaSecondHref: '', imageSrc: '',
            background: { kind: 'color', token: 'bg' },
            align: 'center', paddingY: '16', minHeight: '55vh', titleSize: '2xl', contentMaxWidth: '60ch',
          },
          children: {},
        },
        split1: {
          id: 'split1', type: 'SplitFeatureBlock',
          props: {
            variant: 'image-right', eyebrow: 'El origen', title: 'Cómo empezamos',
            body: 'Fundada por dos diseñadores hartos de que las tiendas de hogar vendiesen lo mismo: muebles que se ven bien en foto y mal en casa. Empezamos visitando ferias y talleres, seleccionando a mano cada pieza.',
            ctaLabel: '', ctaHref: '', imageSrc: '', imageAlt: 'Fundadores de Habitia en un taller artesanal',
            background: 'white', imageHeight: 'contained',
          },
          children: {},
        },
        split2: {
          id: 'split2', type: 'SplitFeatureBlock',
          props: {
            variant: 'image-left', eyebrow: 'Nuestra filosofía', title: 'Compra menos, compra mejor',
            body: 'Creemos en el consumo consciente. Por eso cada pieza de Habitia está diseñada para durar décadas, no temporadas. Trabajamos con artesanos y fabricantes que comparten esta visión y que pagan salarios justos.',
            ctaLabel: 'Guía de cuidados', ctaHref: '/cuidados',
            imageSrc: '', imageAlt: 'Taller de artesanos colaboradores',
            background: 'cream', imageHeight: 'contained',
          },
          children: {},
        },
        quote: {
          id: 'quote', type: 'QuoteBlock',
          props: {
            quote: 'Cada objeto que elegimos para tu hogar ha pasado por nuestras manos primero. Si no lo tendríamos en casa, no lo vendemos.',
            attribution: '— Fundadores de Habitia',
            background: 'white', size: 'large', ornament: 'true',
          },
          children: {},
        },
        stats: {
          id: 'stats', type: 'StatsBlock',
          props: {
            eyebrow: 'Habitia en números', title: 'Una trayectoria construida pieza a pieza',
            stats: '8 años\nCurando hogares\nDesde 2016\n---\n3,200+\nClientes\nEn 12 países\n---\n180+\nArtesanos\nColaboradores activos\n---\n0\nPiezas rápidas\nSolo diseño duradero',
            background: 'muted', align: 'center',
          },
          children: {},
        },
        footer: FOOTER,
      },
    }),
  },
  {
    id:          'cuidados',
    label:       'Cuidados',
    routePath:   '/cuidados',
    required:    false,
    description: 'Guía de cuidado y mantenimiento de los materiales.',
    build: () => ({
      rootIds: ['navbar', 'hero', 'bento', 'split', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        hero: {
          id: 'hero', type: 'HeroBlock',
          props: {
            variant: 'centered', title: 'Guía de Cuidados',
            subtitle: 'Con el cuidado correcto, tus piezas Habitia durarán toda la vida.',
            eyebrow: 'Materiales & cuidados',
            ctaLabel: '', ctaHref: '', ctaSecondLabel: '', ctaSecondHref: '', imageSrc: '',
            background: { kind: 'color', token: 'muted' },
            align: 'center', paddingY: '12', minHeight: '40vh', titleSize: '2xl', contentMaxWidth: '55ch',
          },
          children: {},
        },
        bento: {
          id: 'bento', type: 'BentoGridBlock',
          props: {
            items: 'Madera maciza\nLimpia con paño seco. Evita la humedad directa. Aceita cada 6 meses con aceite de teca.\nlarge\n---\nLino & algodón\nLavado a máquina en frío. Plancha en húmedo. Lava por separado las primeras veces.\nnormal\n---\nCerámica\nLavado a mano recomendado. Evita cambios bruscos de temperatura.\nnormal\n---\nCuero natural\nLimpia con paño ligeramente húmedo. Acondiciona dos veces al año con crema de cuero.\nwide',
            background: 'cream',
          },
          children: {},
        },
        split: {
          id: 'split', type: 'SplitFeatureBlock',
          props: {
            variant: 'image-right', eyebrow: 'Nuestra garantía', title: 'Si algo falla, lo arreglamos',
            body: 'Todas las piezas Habitia tienen garantía mínima de 2 años. Si algo falla por un defecto de fabricación, lo reparamos o reemplazamos sin preguntas. Creemos en los objetos que duran.',
            ctaLabel: 'Contactar soporte', ctaHref: '/contacto',
            imageSrc: '', imageAlt: '', background: 'white', imageHeight: 'contained',
          },
          children: {},
        },
        cta: {
          id: 'cta', type: 'CtaBannerBlock',
          props: {
            eyebrow: '', title: '¿Tienes alguna duda sobre el cuidado de tu pieza?',
            subtitle: 'Escríbenos y te respondemos en menos de 24 horas.',
            ctaLabel: 'Escribirnos', ctaHref: '/contacto',
            ctaSecondLabel: '', ctaSecondHref: '',
            variant: 'gradient-dark', size: 'compact', align: 'center',
          },
          children: {},
        },
        footer: FOOTER,
      },
    }),
  },
  {
    id:          'contacto',
    label:       'Contacto',
    routePath:   '/contacto',
    required:    false,
    description: 'Información de contacto y atención al cliente.',
    build: () => ({
      rootIds: ['navbar', 'info', 'cta', 'footer'],
      blocks: {
        navbar: NAVBAR,
        info: {
          id: 'info', type: 'FeaturesSectionBlock',
          props: {
            eyebrow: 'Estamos aquí', title: 'Hablemos',
            subtitle: 'Resolvemos tus dudas sobre productos, envíos, garantías y más.',
            layout: 'grid-3', iconStyle: 'check', background: 'white',
            features: 'Correo electrónico\nhola@habitia.mx — Para consultas, pedidos especiales y colaboraciones.\n---\nWhatsApp\n+52 55 0000 0000 — Lunes a sábado, 9am–7pm. Te respondemos en minutos.\n---\nEnvíos\nEntregamos en toda la República Mexicana. Envío gratis en pedidos mayores a $1,500.',
          },
          children: {},
        },
        cta: {
          id: 'cta', type: 'CtaBannerBlock',
          props: {
            eyebrow: 'Atención personalizada', title: 'Cuéntanos qué necesitas',
            subtitle: 'Nuestro equipo te ayuda a encontrar la pieza perfecta para tu espacio.',
            ctaLabel: 'WhatsApp', ctaHref: 'https://wa.me/525500000000',
            ctaSecondLabel: 'Enviar correo', ctaSecondHref: 'mailto:hola@habitia.mx',
            variant: 'gradient-dark', size: 'large', align: 'center',
          },
          children: {},
        },
        footer: FOOTER,
      },
    }),
  },
]
