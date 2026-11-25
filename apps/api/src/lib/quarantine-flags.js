// Marks rows of /blueprints whose module code is quarantined, so the shell does not request a bundle the server
// will refuse (423 MODULE_QUARANTINED). This is a hint to avoid noise: the refusal on /modules/:key/bundle.js is
// still the only gate and nothing here can make blocked code load.
export async function flagQuarantinedModules(rows, isQuarantined) {
  const keys = new Set()
  for (const row of rows) if (row.module?.has_bundle && row.module.key) keys.add(row.module.key)
  if (!keys.size) return rows
  const blocked = new Set()
  await Promise.all([...keys].map(async (key) => { if (await isQuarantined(key).catch(() => false)) blocked.add(key) }))
  if (!blocked.size) return rows
  return rows.map((row) => (blocked.has(row.module?.key) ? { ...row, module: { ...row.module, quarantined: true } } : row))
}
