// Per-block visual effects the builder stores as underscore props (_animation, _hover, ...). They are not catalog
// fields, so they are validated here: only known keys, enum values and bounded numbers reach a published page, because
// the public renderer turns them into inline styles and a scoped <style> tag.
const PRESETS = ['none', 'fade-in', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out']
const EASINGS = ['ease-out', 'ease', 'ease-in', 'ease-in-out', 'linear']
const num = (min, max) => (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const oneOf = (list) => (value) => list.includes(value)
const object = (shape) => (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.entries(value).every(([key, inner]) => shape[key]?.(inner))

const EFFECTS = {
  _opacity: num(0, 1),
  _animation: object({ preset: oneOf(PRESETS), duration: num(0, 5000), delay: num(0, 5000), easing: oneOf(EASINGS) }),
  _hover: object({ scale: (value) => value === '' || (typeof value === 'string' && /^(0\.\d{1,2}|1(\.\d{1,2})?)$/.test(value)), shadow: oneOf(['', 'sm', 'md', 'lg']), brightness: num(50, 150), duration: num(0, 2000), easing: oneOf(['ease', 'ease-out', 'ease-in-out']) }),
  _scrollReveal: (value) => typeof value === 'boolean',
  _transform: object({ rotate: num(-360, 360), skewX: num(-45, 45), skewY: num(-45, 45) }),
  _filter: object({ blur: num(0, 40), brightness: num(0, 200), contrast: num(0, 200), grayscale: num(0, 100), sepia: num(0, 100) }),
  _sticky: (value) => typeof value === 'boolean',
  _zIndex: (value) => value === '' || (Number.isInteger(value) && value >= -10 && value <= 100),
  _cursor: oneOf(['auto', 'default', 'pointer', 'grab', 'zoom-in', 'zoom-out', 'crosshair', 'not-allowed', 'text']),
}

export const isEffectProp = (name) => Object.hasOwn(EFFECTS, name)
export const isValidEffect = (name, value) => isEffectProp(name) && EFFECTS[name](value)
