import { createRequire } from 'node:module'

// Built-in templates were authored against looser block props than the publishable catalog enforces
// (select values outside the options, props the block does not have). They are conformed when applied so a template
// never produces a draft that publishing rejects: selects snap to the nearest option, unknown props are dropped.
const catalog = createRequire(import.meta.url)('../routes/website/block-catalog.json')
const definitions = new Map(catalog.blocks.map((block) => [block.type, block]))
// Rough conversion to pixels (900px viewport, 8px per ch) only to pick the closest option across units.
const px = (value) => {
  const match = /^(\d+(?:\.\d+)?)(px|vh|ch)?$/.exec(String(value))
  return match ? Number(match[1]) * ({ vh: 9, ch: 8 }[match[2]] ?? 1) : null
}
export function nearestOption(value, options) {
  const target = px(value)
  const numeric = options.map((option) => [option, px(option)]).filter(([, size]) => size !== null)
  if (target === null || !numeric.length) return null
  return numeric.reduce((best, current) => (Math.abs(current[1] - target) < Math.abs(best[1] - target) ? current : best))[0]
}

export function conformTemplateDocument(document) {
  for (const block of Object.values(document?.blocks ?? {})) {
    const definition = definitions.get(block.type)
    if (!definition || !block.props) continue
    for (const [name, value] of Object.entries(block.props)) {
      const field = definition.fields[name]
      if (!field) { delete block.props[name]; continue }
      if (field.type === 'select' && !field.options?.includes(value)) {
        const option = nearestOption(value, field.options ?? [])
        if (option !== null) block.props[name] = option
        else if (definition.defaultProps && name in definition.defaultProps) block.props[name] = definition.defaultProps[name]
        else delete block.props[name]
      }
    }
  }
  return document
}
