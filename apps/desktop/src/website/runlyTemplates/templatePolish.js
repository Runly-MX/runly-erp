// Visual pass applied to every built-in template page after it is built. It only uses block props and options of the
// publishable catalog, and never external images (publishing rejects them): the look comes from a tinted hero, a
// background rhythm between sections, a keyword strip, a pull quote and a prominent closing call to action.
const POLISH = {
  'atlas-restaurante': {
    tint: ['#FBE3C8', '#FFFBF5'],
    strip: { items: 'Cocina de mercado · Producto local · Horno de leña · Postres de la casa · Carta de vinos', background: 'dark' },
    quote: { quote: 'La buena mesa empieza con buenos ingredientes y termina con buena compañía.', attribution: '— El equipo de cocina', background: 'cream', after: 'gallery' },
  },
  'atlas-spa': {
    tint: ['#CFEAE3', '#F7FAF8'],
    strip: { items: 'Masajes · Faciales · Aromaterapia · Yoga · Hidroterapia · Nutrición', background: 'cream' },
    quote: { quote: 'El bienestar no es un destino: es un ritual que eliges cada día.', attribution: '— El equipo Serenity', background: 'cream', after: 'stats' },
  },
  'atlas-tienda': {
    tint: ['#FFE4E6', '#FFFFFF'],
    strip: { items: 'Envío gratis desde $999 · Devoluciones en 30 días · Pago seguro · Atención por WhatsApp', background: 'dark' },
    quote: null,
    closing: 'gradient-dark',
  },
  'atlas-agencia': {
    tint: ['#E9E3FF', '#FAFAFB'],
    strip: { items: 'Estrategia · Branding · Sitios web · Producto digital · Contenido · Performance', background: 'dark' },
    quote: { quote: 'Diseñamos para que tu marca se note y tu negocio crezca.', attribution: '— Dirección creativa', background: 'dark', after: 'features' },
    closing: 'gradient-dark',
  },
  'atlas-negocio': {
    tint: ['#DBE7FF', '#FFFFFF'],
    strip: { items: 'Consultoría · Finanzas · Operaciones · Capacitación · Tecnología', background: 'dark' },
    quote: { quote: 'Las decisiones claras nacen de números claros y de un plan que se puede ejecutar.', attribution: '— Nuestro equipo', background: 'cream', after: 'stats' },
  },
  'atlas-habitia': {
    tint: ['#F1DFD0', '#FAF7F2'],
    strip: null,
    quote: null,
  },
}

// The built-in galleries ship without photos and would render as grey boxes; they become text tiles until the
// person adds real images (the Gallery block stays available in the editor).
const NEWLINE = String.fromCharCode(10)
const TILES = Object.fromEntries(Object.entries({
  restaurante: [["Salón principal","Mesas amplias, luz cálida y música suave para cenas sin prisa."],["Terraza","Aire libre y vista al atardecer."],["Barra","Coctelería de autor y vinos por copa."],["Cocina abierta","Mira cómo preparamos cada platillo."]],
  agencia: [["Rebranding Aurora","Identidad visual y sitio web para una marca de bienestar."],["App Ruta","Producto digital para logística urbana."],["Campaña Origen","Contenido y performance con +120% en prospectos."],["Tienda Nómada","Comercio electrónico con pago en un paso."]],
  habitia: [["Sala luminosa","Sofás y textiles en tonos tierra."],["Comedor","Mesa de madera y sillas tejidas."],["Recámara","Lino, algodón y luz suave."],["Terraza","Piezas que también viven afuera."]],
}).map(([name, rows]) => [name, rows.map((row) => row.join(NEWLINE)).join(NEWLINE + '---' + NEWLINE)]))

const ROLE = { navbar: 'NavbarBlock', footer: 'FooterBlock' }

export function polishPage(templateId, pageId, data) {
  const config = POLISH[templateId]
  if (!config) return data
  const home = pageId === 'home'
  const blocks = { ...data.blocks }
  const rootIds = [...data.rootIds]
  const body = rootIds.filter((id) => ![ROLE.navbar, ROLE.footer].includes(blocks[id]?.type))
  const copy = (id) => { blocks[id] = { ...blocks[id], props: { ...blocks[id].props } }; return blocks[id].props }

  for (const id of body) {
    const type = blocks[id].type
    const props = copy(id)
    if (type === 'HeroBlock') {
      // The tinted gradient keeps the default dark text readable; an empty image slot would render as a grey box.
      if (!props.imageSrc) props.variant = 'centered'
      props.align = 'center'
      props.background = { kind: 'gradient', angle: 180, from: config.tint[0], to: config.tint[1] }
      props.minHeight = home ? '360px' : '200px'
      props.paddingY = home ? '16' : '12'
      props.titleSize = home ? '3xl' : '2xl'
      props.contentMaxWidth = '768px'
      props.shadow = 'none'
    }
    if (type === 'GalleryBlock' && !Object.keys(props).some((key) => key.startsWith('image') && props[key])) {
      const tiles = TILES[templateId.replace('atlas-', '')]
      if (tiles) {
        blocks[id] = { ...blocks[id], type: 'ServicesGridBlock', props: { eyebrow: props.eyebrow, title: props.title, subtitle: props.subtitle, columns: '2', services: tiles, cardStyle: 'bordered', align: 'center' } }
        continue
      }
    }
    if (type === 'FeaturesSectionBlock') props.background = 'muted'
    if (type === 'TestimonialsBlock') props.background = home ? 'dark' : 'muted'
  }

  // Closing call to action: the last one before the footer is the large, saturated one; the others stay quiet.
  const ctas = body.filter((id) => blocks[id].type === 'CtaBannerBlock')
  ctas.forEach((id, index) => {
    const props = copy(id)
    const last = index === ctas.length - 1
    props.size = last ? 'large' : 'compact'
    props.variant = last ? config.closing ?? 'gradient-primary' : 'muted'
  })

  // Blocks that need photos or leave large empty areas without them become text blocks of the same content.
  const NL = String.fromCharCode(10)
  let split = 0
  for (const id of body) {
    const { type, props } = blocks[id]
    if (type === 'BentoGridBlock') {
      const rows = String(props.items).split(NL + '---' + NL).map((row) => row.split(NL).slice(0, 2).join(NL))
      blocks[id] = { ...blocks[id], type: 'ServicesGridBlock', props: { title: '', subtitle: '', columns: '2', services: rows.join(NL + '---' + NL), cardStyle: 'bordered', align: 'left' } }
    }
    if (type === 'SplitFeatureBlock' && !props.imageSrc) {
      blocks[id] = { ...blocks[id], type: 'CtaBannerBlock', props: { eyebrow: props.eyebrow, title: props.title, subtitle: props.body, ctaLabel: props.ctaLabel, ctaHref: props.ctaHref, variant: split++ % 2 ? 'muted' : 'solid-primary', size: 'normal', align: 'left' } }
    }
  }

  if (home) {
    const insert = (anchor, id, type, props) => {
      blocks[id] = { id, type, props, children: {} }
      const at = rootIds.indexOf(anchor)
      rootIds.splice(at < 0 ? rootIds.length - 1 : at + 1, 0, id)
    }
    if (config.strip) insert('hero', 'polish-strip', 'MarqueeBlock', { ...config.strip, speed: 'slow', size: 'md' })
    if (config.quote) { const { after, ...props } = config.quote; insert(rootIds.includes(after) ? after : 'hero', 'polish-quote', 'QuoteBlock', { ...props, size: 'large', ornament: 'true' }) }
  }
  return { ...data, rootIds, blocks }
}
