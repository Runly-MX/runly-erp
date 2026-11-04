import { EFFECT_PRESETS, EFFECT_SHAPES } from '@raulbellosom/atlas-web-builder'

// Per-block visual effects the builder stores as underscore props (_animation, _hover, ...). They are not catalog
// fields, so they are validated here against the package's own whitelist: only known keys, enum values and bounded
// numbers reach a published page, because the public renderer turns them into inline styles and a scoped <style> tag.
const num = ([min, max]) => (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const oneOf = (list) => (value) => list.includes(value)
const object = (shape) => (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.entries(value).every(([key, inner]) => shape[key]?.(inner))

const { animation, hover } = EFFECT_SHAPES

const EFFECTS = {
  _opacity: num(EFFECT_SHAPES.opacity),
  _animation: object({ preset: oneOf(EFFECT_PRESETS), duration: num(animation.duration), delay: num(animation.delay), easing: oneOf(animation.easing) }),
  _hover: object({ scale: (value) => value === '' || (typeof value === 'string' && /^(0\.\d{1,2}|1(\.\d{1,2})?)$/.test(value)), shadow: oneOf(hover.shadow), brightness: num(hover.brightness), duration: num(hover.duration), easing: oneOf(hover.easing) }),
  _scrollReveal: (value) => typeof value === 'boolean',
  _stagger: num(EFFECT_SHAPES.stagger),
  _parallax: object({ speed: num(EFFECT_SHAPES.parallax.speed) }),
  _transform: object({ rotate: num([-360, 360]), skewX: num([-45, 45]), skewY: num([-45, 45]) }),
  _filter: object({ blur: num([0, 40]), brightness: num([0, 200]), contrast: num([0, 200]), grayscale: num([0, 100]), sepia: num([0, 100]) }),
  _sticky: (value) => typeof value === 'boolean',
  _lazy: (value) => typeof value === 'boolean',
  _lazyMinHeight: num([0, 2000]),
  _zIndex: (value) => value === '' || (Number.isInteger(value) && value >= -1000 && value <= 1000),
  _cursor: oneOf(EFFECT_SHAPES.cursor),
  // Image metadata the asset picker stores next to src (layout-shift prevention); responsive variants stay unsupported until uploads pin them.
  dominantColor: (value) => value === '' || (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)),
  naturalWidth: (value) => Number.isInteger(value) && value >= 1 && value <= 20000,
  naturalHeight: (value) => Number.isInteger(value) && value >= 1 && value <= 20000,
}

export const isEffectProp = (name) => Object.hasOwn(EFFECTS, name)
export const isValidEffect = (name, value) => isEffectProp(name) && EFFECTS[name](value)
