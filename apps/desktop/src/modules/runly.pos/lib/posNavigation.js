// POS sidebar entries that only make sense when some outlet serves tables.
// Unknown modes (still loading, or the read failed) never hide them.
const RESTAURANT_PATHS = ['/pos/comandero', '/pos/cocina']
// Citas is opt-in: shown only once the company turned appointments on.
const APPOINTMENTS_PATH = '/pos/citas'

export function filterPosNavigation(module, modes, { appointments = false } = {}) {
  if (!module || module.key !== 'runly.pos') return module
  const all = module.navigation ?? []
  const restaurant = !modes?.length || modes.some((mode) => ['RESTAURANT', 'HYBRID'].includes(mode))
  const navigation = all.filter((item) => {
    if (!appointments && item.path?.endsWith(APPOINTMENTS_PATH)) return false
    return restaurant || !RESTAURANT_PATHS.some((p) => item.path?.endsWith(p))
  })
  return navigation.length === all.length ? module : { ...module, navigation }
}
