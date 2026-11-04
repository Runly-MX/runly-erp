import { createRequire } from 'node:module'
import { isEffectProp } from './website-block-effects.js'

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

// Legacy templates described several plans in one PricingBlock ("name, description, price, features..." per plan, plans
// split by a --- line). The publishable PricingBlock is a single plan, so that block becomes a Section with a heading
// and one PricingBlock per plan.
function expandPricingPlans(document, block) {
  const plans = String(block.props.plans).split('\n---\n').map((plan) => plan.split('\n')).filter((lines) => lines.length >= 3)
  const { title, subtitle, currency = '$', period } = block.props
  if (!plans.length) { delete block.props.plans; return }
  let count = 0
  const add = (type, props, children = {}) => {
    const id = `${block.id}-${++count}`
    document.blocks[id] = { id, type, props, children }
    return id
  }
  const cards = plans.map(([plan, description, price, ...features], index) => {
    const numeric = /^\d/.test(price)
    return add('PricingBlock', {
      plan, description, price, currency: numeric ? currency : '', period: numeric && period ? `/ ${period}` : '',
      features: features.join('\n'), ctaLabel: 'Comenzar', ctaHref: '/contacto', highlighted: plans.length > 2 && index === 1,
    })
  })
  const head = [title && add('HeadingBlock', { text: title, level: 'h2', align: 'center' }), subtitle && add('TextBlock', { text: subtitle, align: 'center' })].filter(Boolean)
  block.type = 'SectionBlock'
  block.props = {}
  block.children = { children: [...head, add('GridBlock', { minItemWidth: 260, gap: '4' }, { children: cards })] }
}

export function conformTemplateDocument(document) {
  for (const block of Object.values(document?.blocks ?? {})) {
    if (block.type === 'PricingBlock' && typeof block.props?.plans === 'string') expandPricingPlans(document, block)
  }
  for (const block of Object.values(document?.blocks ?? {})) {
    const definition = definitions.get(block.type)
    if (!definition || !block.props) continue
    for (const [name, value] of Object.entries(block.props)) {
      if (isEffectProp(name)) continue
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
