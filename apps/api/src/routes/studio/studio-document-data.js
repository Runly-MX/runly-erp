import { documentAssetIds } from '../../../../shared/studio/shape-properties.js'
// Backend projections/reference traversal; the shared validator remains canonical.
export function studioObjects(document) {
  const result = []
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (typeof value.id === 'string' && typeof value.type === 'string') result.push(value)
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(document)
  return result
}

export const studioAssetIds = document => documentAssetIds({objects:studioObjects(document)})

export function studioSummary(document) {
  // Explicit scalar projection bounds vector geometry, nested images and long text.
  const objects = studioObjects(document)
  return { width: document.page.width, height: document.page.height, objectCount: objects.length,
    preview: { page: { ...document.page }, objects: objects.slice(0, 40).map(o => Object.fromEntries(
      ['id','type','x','y','width','height','rotation','fill','opacity','hidden','fontSize','fontFamily','fontVariant','scaleX','scaleY','groupId','text','fillPaint','shape','image','geometry','points','strokeWidth','dash','startCap','endCap','startArrow','endArrow']
        .filter(key => o[key] !== undefined).map(key => [key, key === 'text' ? o.text.slice(0,120) : o[key]]))) } }
}
