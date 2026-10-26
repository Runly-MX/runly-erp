// Remembers, per company and user, the working design opened with "Editar
// contenido" for each template, so a second edit offers to continue it instead
// of silently creating another design. Browser-only convenience: losing it only
// means a new working copy is offered; nothing is deleted.
const key = scopeKey => `runly.studio.template-work:${scopeKey.join(':')}`

function read(scopeKey) {
  try { return JSON.parse(window.localStorage.getItem(key(scopeKey)) ?? '{}') ?? {} } catch { return {} }
}
function write(scopeKey, map) {
  try { window.localStorage.setItem(key(scopeKey), JSON.stringify(map)) } catch { /* storage unavailable */ }
}

export const workingDesignFor = (scopeKey, templateId) => read(scopeKey)[templateId] ?? null
export function rememberWorkingDesign(scopeKey, templateId, designId) {
  write(scopeKey, { ...read(scopeKey), [templateId]: designId })
}
export function forgetWorkingDesign(scopeKey, templateId) {
  const map = read(scopeKey)
  delete map[templateId]
  write(scopeKey, map)
}
