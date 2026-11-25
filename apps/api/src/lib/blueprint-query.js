// Optional, additive narrowing of GET /blueprints. Without any parameter the response is unchanged.
// It runs AFTER authorization (module access, company disablement), so it can only remove rows or fields
// the caller was already allowed to see; it is a payload optimization, never an access control.
//   moduleKey=a,b   rows of those modules only
//   key=x,y         rows with those exact blueprint keys (one view on demand)
//   kind=FORM,TABLE rows of those kinds only
//   slim=1          omit module.manifest and module.lifecycleConfig (the manifest is already served by /runtime/modules)
//   schema=0        omit row.schema (bootstrap callers that only need module/bundle metadata)
const list = (value) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, 64) : [])

export function parseBlueprintQuery(query = {}) {
  return {
    moduleKeys: new Set(list(query.moduleKey)),
    keys: new Set(list(query.key)),
    kinds: new Set(list(query.kind).map((k) => k.toUpperCase())),
    slim: query.slim === '1' || query.slim === 'true',
    omitSchema: query.schema === '0' || query.schema === 'false',
  }
}

export function applyBlueprintQuery(rows, query) {
  const { moduleKeys, keys, kinds, slim, omitSchema } = parseBlueprintQuery(query)
  if (!moduleKeys.size && !keys.size && !kinds.size && !slim && !omitSchema) return rows
  const out = []
  for (const row of rows) {
    if (moduleKeys.size && !moduleKeys.has(row.moduleKey ?? row.module?.key)) continue
    if (keys.size && !keys.has(row.key)) continue
    if (kinds.size && !kinds.has(String(row.kind).toUpperCase())) continue
    let next = row
    if (slim && row.module && ('manifest' in row.module || 'lifecycleConfig' in row.module)) {
      const { manifest, lifecycleConfig, ...module } = row.module
      next = { ...next, module }
    }
    if (omitSchema && 'schema' in next) {
      const { schema, ...rest } = next
      next = rest
    }
    out.push(next)
  }
  return out
}
