// Ordered page collection. The first scene remains the compatible cover projection.
export const LEGACY_PAGE_ID = 'page-1'
export const pageId = scene => scene.page.id ?? LEGACY_PAGE_ID
export const documentPages = document => [{ page: document.page, objects: document.objects }, ...(document.additionalPages ?? [])]
export const findPage = (document, id) => documentPages(document).find(scene => pageId(scene) === id)
export function withPages(document, pages) {
  if (!pages.length) throw Error('El diseño debe conservar al menos una página.')
  const [first, ...additionalPages] = pages
  return { ...document, page: first.page, objects: first.objects, ...(document.schemaVersion >= 7 || additionalPages.length ? { additionalPages } : {}) }
}
export function pageDocument(document, id) {
  const scene = findPage(document, id)
  if (!scene) throw Error('La página ya no existe.')
  return { schemaVersion: document.schemaVersion, unit: document.unit, ...scene, ...(document.schemaVersion >= 7 ? { additionalPages: [] } : {}) }
}
export function replacePage(document, scene) {
  return withPages(document, documentPages(document).map(previous => pageId(previous) === pageId(scene) ? scene : previous))
}
