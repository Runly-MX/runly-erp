import { FILE_ID, StudioError } from '../../../../shared/studio/document.js'
import { STUDIO_TEMPLATES } from '../../../../shared/studio/templates.js'

const MAX_COLLECTIONS = 30, MAX_ITEMS = 500
const KINDS = ['design', 'template', 'builtin']

// Personal collections and favorites. Everything is scoped to (company, owner): a collection is never
// visible to anyone else, and an item can only be added while the actor can currently see it.
export function createStudioCollectionsService({ prisma, access }) {
  const notFound = () => { throw new StudioError('Colección no encontrada.', 404) }
  const name = value => {
    const text = String(value ?? '').trim()
    if (!text || text.length > 60) throw new StudioError('El nombre de la colección debe tener entre 1 y 60 caracteres.')
    return text
  }
  function ref(input) {
    const kind = input?.kind, id = String(input?.itemId ?? '')
    if (!KINDS.includes(kind)) throw new StudioError('Tipo de elemento inválido.')
    if (kind === 'builtin' ? !STUDIO_TEMPLATES.some(template => template.key === id) : !FILE_ID.test(id)) throw new StudioError('Elemento no encontrado.', 404)
    return { kind, id }
  }
  async function ownCollection(db, companyId, actorId, id) {
    if (!FILE_ID.test(String(id))) notFound()
    const [row] = await db.$queryRaw`SELECT id,name,is_favorites AS "isFavorites" FROM studio_collection WHERE id=${id}::uuid AND company_id=${companyId}::uuid AND owner_id=${actorId}::uuid`
    return row ?? notFound()
  }
  async function visible(db, companyId, actorId, { kind, id }) {
    if (kind === 'builtin') return
    const [row] = kind === 'design'
      ? await db.$queryRaw`SELECT d.id FROM studio_design d WHERE d.id=${id}::uuid AND d.company_id=${companyId}::uuid AND d.enabled AND runly_studio.can_access(d.id,${actorId}::uuid,false)`
      : await db.$queryRaw`SELECT t.id FROM studio_template t WHERE t.id=${id}::uuid AND t.company_id=${companyId}::uuid AND t.enabled AND (t.scope='company' OR t.owner_id=${actorId}::uuid)`
    if (!row) throw new StudioError('Elemento no encontrado.', 404)
  }
  async function favoritesCollection(db, companyId, actorId) {
    await db.$queryRaw`INSERT INTO studio_collection(company_id,owner_id,name,is_favorites) VALUES(${companyId}::uuid,${actorId}::uuid,'Favoritos',true) ON CONFLICT (company_id,owner_id) WHERE is_favorites DO NOTHING`
    const [row] = await db.$queryRaw`SELECT id,name,is_favorites AS "isFavorites" FROM studio_collection WHERE company_id=${companyId}::uuid AND owner_id=${actorId}::uuid AND is_favorites`
    return row
  }

  async function list(companyId, actorId) {
    await access.member(companyId, actorId)
    const rows = await prisma.$queryRaw`SELECT c.id,c.name,c.is_favorites AS "isFavorites",count(i.id)::int AS "itemCount"
      FROM studio_collection c LEFT JOIN studio_collection_item i ON i.collection_id=c.id
      WHERE c.company_id=${companyId}::uuid AND c.owner_id=${actorId}::uuid GROUP BY c.id ORDER BY c.is_favorites DESC,c.created_at DESC,c.id DESC`
    return rows[0]?.isFavorites ? rows : [{ id: null, name: 'Favoritos', isFavorites: true, itemCount: 0 }, ...rows]
  }
  async function create(companyId, actorId, input) {
    await access.member(companyId, actorId)
    const title = name(input?.name)
    return prisma.$transaction(async db => {
      const [{ total }] = await db.$queryRaw`SELECT count(*)::int AS total FROM studio_collection WHERE company_id=${companyId}::uuid AND owner_id=${actorId}::uuid AND NOT is_favorites`
      if (total >= MAX_COLLECTIONS) throw new StudioError(`Puedes crear hasta ${MAX_COLLECTIONS} colecciones.`, 409)
      const [row] = await db.$queryRaw`INSERT INTO studio_collection(company_id,owner_id,name) VALUES(${companyId}::uuid,${actorId}::uuid,${title}) RETURNING id,name,is_favorites AS "isFavorites",0 AS "itemCount"`
      return row
    })
  }
  async function rename(companyId, actorId, id, input) {
    await access.member(companyId, actorId)
    const title = name(input?.name), current = await ownCollection(prisma, companyId, actorId, id)
    if (current.isFavorites) throw new StudioError('Favoritos no se puede renombrar.', 409)
    const [row] = await prisma.$queryRaw`UPDATE studio_collection SET name=${title},updated_at=now() WHERE id=${id}::uuid RETURNING id,name,is_favorites AS "isFavorites"`
    return row
  }
  async function remove(companyId, actorId, id) {
    await access.member(companyId, actorId)
    const current = await ownCollection(prisma, companyId, actorId, id)
    if (current.isFavorites) throw new StudioError('Favoritos no se puede eliminar.', 409)
    await prisma.$queryRaw`DELETE FROM studio_collection WHERE id=${id}::uuid`
    return { id }
  }
  async function addTo(db, collection, item) {
    const [{ total }] = await db.$queryRaw`SELECT count(*)::int AS total FROM studio_collection_item WHERE collection_id=${collection.id}::uuid`
    if (total >= MAX_ITEMS) throw new StudioError(`Una colección admite hasta ${MAX_ITEMS} elementos.`, 409)
    const design = item.kind === 'design' ? item.id : null, template = item.kind === 'template' ? item.id : null, builtin = item.kind === 'builtin' ? item.id : null
    await db.$queryRaw`INSERT INTO studio_collection_item(collection_id,design_id,template_id,builtin_key) VALUES(${collection.id}::uuid,${design}::uuid,${template}::uuid,${builtin}) ON CONFLICT DO NOTHING`
  }
  async function removeFrom(db, collectionId, { kind, id }) {
    if (kind === 'design') await db.$queryRaw`DELETE FROM studio_collection_item WHERE collection_id=${collectionId}::uuid AND design_id=${id}::uuid`
    else if (kind === 'template') await db.$queryRaw`DELETE FROM studio_collection_item WHERE collection_id=${collectionId}::uuid AND template_id=${id}::uuid`
    else await db.$queryRaw`DELETE FROM studio_collection_item WHERE collection_id=${collectionId}::uuid AND builtin_key=${id}`
  }
  async function addItem(companyId, actorId, id, input) {
    await access.member(companyId, actorId)
    const item = ref(input)
    return prisma.$transaction(async db => {
      const collection = await ownCollection(db, companyId, actorId, id)
      await visible(db, companyId, actorId, item)
      await addTo(db, collection, item)
      return { collectionId: collection.id }
    })
  }
  async function removeItem(companyId, actorId, id, input) {
    await access.member(companyId, actorId)
    const item = ref(input), collection = await ownCollection(prisma, companyId, actorId, id)
    await removeFrom(prisma, collection.id, item)
    return { collectionId: collection.id }
  }
  async function favorites(companyId, actorId) {
    await access.member(companyId, actorId)
    const rows = await prisma.$queryRaw`SELECT i.design_id AS "designId",i.template_id AS "templateId",i.builtin_key AS "builtinKey"
      FROM studio_collection_item i JOIN studio_collection c ON c.id=i.collection_id
      WHERE c.company_id=${companyId}::uuid AND c.owner_id=${actorId}::uuid AND c.is_favorites`
    return { designs: rows.map(r => r.designId).filter(Boolean), templates: rows.map(r => r.templateId).filter(Boolean), builtins: rows.map(r => r.builtinKey).filter(Boolean) }
  }
  async function favorite(companyId, actorId, input) {
    await access.member(companyId, actorId)
    const item = ref(input)
    return prisma.$transaction(async db => {
      await visible(db, companyId, actorId, item)
      await addTo(db, await favoritesCollection(db, companyId, actorId), item)
      return { favorite: true }
    })
  }
  async function unfavorite(companyId, actorId, input) {
    await access.member(companyId, actorId)
    const item = ref(input), collection = await favoritesCollection(prisma, companyId, actorId)
    await removeFrom(prisma, collection.id, item)
    return { favorite: false }
  }
  // Collection filter for the design and template lists: validated ownership, null when not filtering.
  async function filterId(companyId, actorId, value) {
    if (!value) return null
    if (value === 'favorites') return (await favoritesCollection(prisma, companyId, actorId)).id
    return (await ownCollection(prisma, companyId, actorId, value)).id
  }
  async function builtinKeys(collectionId) {
    const rows = await prisma.$queryRaw`SELECT builtin_key AS key FROM studio_collection_item WHERE collection_id=${collectionId}::uuid AND builtin_key IS NOT NULL`
    return rows.map(row => row.key)
  }
  return { list, create, rename, remove, addItem, removeItem, favorites, favorite, unfavorite, filterId, builtinKeys }
}
