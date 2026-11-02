// POS sidebar entries that only make sense when some outlet serves tables.
// Unknown modes (still loading, or the read failed) never hide anything.
const RESTAURANT_PATHS = ['/pos/comandero', '/pos/cocina']

export function filterPosNavigation(module, modes) {
  if (!module || module.key !== 'runly.pos' || !modes?.length) return module
  if (modes.some((mode) => ['RESTAURANT', 'HYBRID'].includes(mode))) return module
  const navigation = (module.navigation ?? []).filter((item) => !RESTAURANT_PATHS.some((p) => item.path?.endsWith(p)))
  return { ...module, navigation }
}
