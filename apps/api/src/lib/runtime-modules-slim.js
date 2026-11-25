// Optional, additive narrowing of GET /runtime/modules (?slim=1). Without it the response is unchanged.
// It runs on the already authorized, already navigation-filtered rows and only removes manifest keys the
// shell never reads (they are served by /blueprints, /modules/:key or the Builder). It is a payload
// optimization, never an access control.
export const SLIM_MANIFEST_OMIT = ['blueprints', 'permissions', 'acl', 'views', 'models', 'connections']

export const isSlimRuntimeQuery = (query = {}) => query.slim === '1' || query.slim === 'true'

export function slimRuntimeModules(modules) {
  return modules.map((mod) => {
    if (!mod.manifest || typeof mod.manifest !== 'object') return mod
    const manifest = { ...mod.manifest }
    for (const key of SLIM_MANIFEST_OMIT) delete manifest[key]
    return { ...mod, manifest }
  })
}
