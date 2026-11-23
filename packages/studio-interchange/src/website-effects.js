// Universal `_*` block props (motion, interaction, filters) in Website templates. The contract is DATA: the Builder catalog ships a
// `universalProps` table (generated from Atlas) and this module only implements the table grammar, so readers never hard-code a
// range that could drift from the editor. Pure and safe on hostile input; mirrors `validateUniversalProp` in Atlas (a parity test
// replays the same fixtures through both).
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function check(spec, value, path, errors) {
  const bad = (message) => errors.push({ code: 'effect_invalid', path, message })
  if (!isObject(spec)) { bad('especificación desconocida'); return }
  switch (spec.type) {
    case 'boolean': if (typeof value !== 'boolean') bad('se espera true o false'); return
    case 'enum': if (!Array.isArray(spec.values) || !spec.values.includes(value)) bad(`valor no permitido (${(spec.values ?? []).join(', ')})`); return
    case 'string': {
      let pattern
      try { pattern = new RegExp(spec.pattern) } catch { bad('formato no permitido'); return }
      if (typeof value !== 'string' || value.length > 20 || !pattern.test(value)) bad('formato no permitido')
      return
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max || (spec.integer && !Number.isInteger(value))) bad(`número entre ${spec.min} y ${spec.max}`)
      return
    case 'object':
      if (!isObject(value)) { bad('se espera un objeto'); return }
      for (const [key, inner] of Object.entries(value)) {
        if (!isObject(spec.keys) || !Object.hasOwn(spec.keys, key)) { errors.push({ code: 'effect_invalid', path: `${path}.${key}`, message: 'clave no permitida' }); continue }
        check(spec.keys[key], inner, `${path}.${key}`, errors)
      }
      return
    default: bad('especificación desconocida')
  }
}

/** True for props that belong to the universal effects namespace. */
export const isEffectProp = (name) => typeof name === 'string' && name.startsWith('_')

/**
 * @param {string} name prop name, e.g. `_animation`
 * @param {unknown} value
 * @param {Record<string, object>} specs the catalog `universalProps` table
 * @param {string} [path] location reported in errors
 * @returns {{ ok: boolean, errors: Array<{ code: 'effect_invalid'|'effect_unknown', path: string, message: string }> }}
 */
export function validateEffectProp(name, value, specs, path = name) {
  if (!isObject(specs) || !Object.hasOwn(specs, name)) return { ok: false, errors: [{ code: 'effect_unknown', path, message: `La propiedad ${String(name).slice(0, 40)} no existe en el contrato de efectos` }] }
  const errors = []
  check(specs[name], value, path, errors)
  return { ok: errors.length === 0, errors }
}

/** Capabilities a catalog declares for hosts and tools (`{ motion, responsive }`), or null when it predates them. */
export const catalogCapabilities = (catalog) => (isObject(catalog?.capabilities) ? catalog.capabilities : null)
