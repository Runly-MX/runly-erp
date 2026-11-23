// What a Website template NEEDS from the Runly installation that opens it. Derived from the package itself (never declared by the author, so
// it cannot lie): the reader reports it on success and attaches it to compatibility errors, so a host can say "this template uses SVG and
// motion, update Runly" BEFORE installing instead of showing incomplete content. Pure and safe on hostile input.
const MOTION = new Set(['_animation', '_scrollReveal', '_kenburns', '_pressed', '_stagger', '_parallax', '_hover', '_transform', '_filter'])
const FOCAL = /^(?:tablet|mobile)?[Ff]ocal[XY]$/

export const REQUIREMENT_LABELS = Object.freeze({
  svg: 'imágenes SVG',
  audiovisual: 'audio y video',
  components: 'componentes sincronizados',
  motion: 'animaciones y efectos de movimiento',
  'fluid-type': 'tipografía fluida',
  'focal-point': 'punto focal de imágenes',
  commerce: 'carrito y pagos',
  accounts: 'cuentas de clientes',
})


const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function scan(node, found, depth = 0) {
  if (!isObject(node) || depth > 12 || found.size === Object.keys(REQUIREMENT_LABELS).length) return
  if (node.type === 'ComponentRefBlock') found.add('components')
  if (node.type === 'CartBlock' || node.type === 'CartPageBlock') found.add('commerce')
  if (node.type === 'AccountPortalBlock') found.add('accounts')
  for (const [key, value] of Object.entries(isObject(node.props) ? node.props : {})) {
    if (MOTION.has(key)) found.add('motion')
    else if (key === 'fluidType' && value === true) found.add('fluid-type')
    else if (FOCAL.test(key)) found.add('focal-point')
  }
  for (const list of Object.values(isObject(node.children) ? node.children : {})) if (Array.isArray(list)) for (const child of list) scan(child, found, depth + 1)
}

/**
 * @param {{ manifest: object, pages?: unknown[][], theme?: object|null, components?: object|null }} input `pages` are the raw section lists
 * @returns {{ builder: string, assetPolicy: string|null, features: Array<{ id: string, label: string }> }}
 */
export function describeRequirements({ manifest, pages = [], theme = null, components = null }) {
  const found = new Set()
  if ((manifest?.assets ?? []).some((asset) => asset?.mime === 'image/svg+xml')) found.add('svg')
  if ((manifest?.assets ?? []).some((asset) => asset?.kind === 'video' || asset?.kind === 'audio')) found.add('audiovisual')
  if (components && Object.keys(components).length) found.add('components')
  if (isObject(theme?.fluid) && theme.fluid.enabled === true) found.add('fluid-type')
  for (const list of pages) for (const section of Array.isArray(list) ? list : []) scan(section, found)
  for (const definition of Object.values(isObject(components) ? components : {})) scan(definition?.section, found)
  return {
    builder: manifest?.builder?.min ?? null,
    assetPolicy: manifest?.assetPolicy ?? null,
    features: Object.keys(REQUIREMENT_LABELS).filter((id) => found.has(id)).map((id) => ({ id, label: REQUIREMENT_LABELS[id] })),
  }
}

/** Sentence appended to compatibility errors, or '' when the template needs nothing special. */
export const requirementsSentence = (requirements) => (requirements?.features?.length ? ` Usa ${requirements.features.map((f) => f.label).join(', ')}.` : '')
