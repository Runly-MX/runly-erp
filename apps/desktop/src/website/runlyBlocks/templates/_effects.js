// Effect helpers shared by the built-in templates. Every value stays inside the shapes the publisher validates
// (apps/api/src/services/website-block-effects.js), so templates never produce pages that publishing rejects.
export const HOVER_LIFT = { _hover: { scale: '1.03', shadow: 'lg', brightness: 100, duration: 200, easing: 'ease' } }
export const STAGGER = { _stagger: 140 }

const node = (id, type, props, children = {}) => ({ id, type, props, children })

// A band of animated counters: [value, suffix, label, decimals?]. Returns the section block followed by its children
// so callers can spread it into their block list; `id` is the section id to list in rootIds.
export function counterBand(id, items, { background = 'white', color = 'primary', prefix = '' } = {}) {
  const ids = items.map((_, index) => `${id}-counter-${index + 1}`)
  return [
    node(id, 'SectionBlock', { paddingY: '12', background }, { children: [`${id}-grid`] }),
    node(`${id}-grid`, 'GridBlock', { minItemWidth: 200, gap: '8', ...STAGGER }, { children: ids }),
    ...items.map(([value, suffix, label, decimals = 0], index) => node(ids[index], 'CounterBlock', { value, from: 0, prefix, suffix, label, duration: 1600, decimals, grouping: true, color, size: '3xl', align: 'center' })),
  ]
}

const STATIC_TYPES = new Set(['NavbarBlock', 'FooterBlock', 'TopBarBlock', 'HeroBlock', 'ShowcaseHeroBlock', 'ParallaxSectionBlock', 'LandscapeHeroBlock', 'MayaPortraitBlock', 'MayaPageHeroBlock', 'MayaTickerBlock', 'FinHeroBlock', 'StoreNavbarBlock'])
const REVEAL = { _animation: { preset: 'slide-fade-up', duration: 700, delay: 0, easing: 'ease-out' }, _scrollReveal: true }

// Every top-level body section fades up as it scrolls into view; the bars and the hero stay put so the first paint
// is never hidden. Sections that already set their own animation are left alone.
export function revealSections(data) {
  const blocks = { ...data.blocks }
  for (const id of data.rootIds) {
    const block = blocks[id]
    if (!block || STATIC_TYPES.has(block.type) || block.props?._animation) continue
    blocks[id] = { ...block, props: { ...block.props, ...REVEAL } }
  }
  return { ...data, blocks }
}
