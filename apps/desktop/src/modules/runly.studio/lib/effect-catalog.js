// Names and groups of the animation presets as the gallery shows them (pure data). Every
// value is a preset of the shared motion engine; "appear" is a fade without duration.
const DIRS = [['up', 'hacia arriba'], ['down', 'hacia abajo'], ['left', 'a la izquierda'], ['right', 'a la derecha']]
const directional = (prefix, verb, group) => DIRS.map(([dir, words]) => ({ value: `${prefix}-${dir}`, label: `${verb} ${words}`, group }))

export const EFFECT_GROUPS = Object.freeze(['Básicos', 'Deslizar', 'Barrido', 'Escala', 'Giro', 'Dinámicos'])
export const ENTER_EFFECTS = Object.freeze([
  { value: 'appear', label: 'Aparecer', group: 'Básicos' }, { value: 'fade', label: 'Desvanecer', group: 'Básicos' },
  ...directional('slide', 'Deslizar', 'Deslizar'), ...directional('slide-fade', 'Deslizar y desvanecer', 'Deslizar'),
  ...directional('float', 'Flotar', 'Deslizar'), ...directional('fly', 'Volar', 'Deslizar'),
  ...directional('wipe', 'Barrido', 'Barrido'), { value: 'reveal', label: 'Revelar desde el centro', group: 'Barrido' },
  { value: 'zoom-in', label: 'Escalar desde pequeño', group: 'Escala' }, { value: 'zoom-out', label: 'Escalar desde grande', group: 'Escala' },
  { value: 'grow', label: 'Expandir', group: 'Escala' },
  { value: 'rotate', label: 'Girar', group: 'Giro' }, { value: 'spiral', label: 'Girar y desplazar', group: 'Giro' },
  { value: 'pop', label: 'Rebotar', group: 'Dinámicos' }, { value: 'elastic', label: 'Elástica', group: 'Dinámicos' },
])
const EXIT_NAMES = { appear: 'Desaparecer', grow: 'Contraer', 'zoom-in': 'Escalar hacia pequeño', 'zoom-out': 'Escalar hacia grande' }
export const EXIT_EFFECTS = Object.freeze(ENTER_EFFECTS.map(effect => (EXIT_NAMES[effect.value] ? { ...effect, label: EXIT_NAMES[effect.value] } : effect)))
export const EMPHASIS_EFFECTS = Object.freeze([
  { value: 'pulse', label: 'Pulso', group: 'Escala' }, { value: 'soft-pulse', label: 'Pulso suave', group: 'Escala' },
  { value: 'enlarge', label: 'Aumentar', group: 'Escala' }, { value: 'jelly', label: 'Rebote elástico', group: 'Escala' },
  { value: 'bounce', label: 'Saltar', group: 'Dinámicos' }, { value: 'shake', label: 'Sacudir', group: 'Dinámicos' },
  { value: 'tremble', label: 'Temblor', group: 'Dinámicos' }, { value: 'wobble', label: 'Oscilación', group: 'Dinámicos' },
  { value: 'spin', label: 'Girar', group: 'Giro' }, { value: 'tilt', label: 'Rotación parcial', group: 'Giro' }, { value: 'swing', label: 'Balanceo', group: 'Giro' },
])
export const EFFECTS_BY_KIND = Object.freeze({ enter: ENTER_EFFECTS, emphasis: EMPHASIS_EFFECTS, exit: EXIT_EFFECTS })

export const EFFECT_DEFAULTS = Object.freeze({
  enter: { delay: 0, duration: 600, easing: 'ease-out' },
  emphasis: { delay: 1000, duration: 800, easing: 'ease-in-out', repeat: 1 },
  exit: { duration: 600, easing: 'ease-in' },
})

// Gallery value of a stored effect ("appear" is a fade of 0 ms).
export const choiceOf = effect => (!effect ? 'none' : effect.preset === 'fade' && effect.duration === 0 ? 'appear' : effect.preset)
// The effect stored for a gallery choice, keeping the timing already set on the element.
export function effectFor(choice, previous, defaults) {
  if (choice === 'none') return undefined
  if (choice === 'appear') return { ...defaults, ...previous, preset: 'fade', duration: 0 }
  return { ...defaults, ...previous, preset: choice, duration: previous?.duration || defaults.duration }
}
