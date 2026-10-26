import { FILE_ID, StudioError, validateDocument } from '../../../../shared/studio/document.js'
import { STUDIO_TEMPLATES, templateDocument } from '../../../../shared/studio/templates.js'
import { createStudioAccess } from './studio-access.js'
import { studioAssetIds, studioSummary } from './studio-document-data.js'

export function createStudioTemplatesService({ prisma, filesService, designService }) {
  const access = designService?.access ?? createStudioAccess({ prisma, filesService })
  const missing = () => { throw new StudioError('Plantilla no encontrada.', 404) }
  function text(value, max, required = false) {
    if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new StudioError('Metadatos de plantilla inválidos.')
    return value.trim()
  }
  function revision(value) {
    if (!Number.isSafeInteger(value) || value < 1) throw new StudioError('Falta la revisión de la plantilla.')
    return value
  }
  function conflict() { throw new StudioError('La plantilla cambió. Revisa la versión actual.', 409, 'STUDIO_REVISION_CONFLICT') }
  async function permissions(db, companyId, actorId) {
    await access.member(companyId, actorId, 'studio.view', db)
    const [row] = await db.$queryRaw`SELECT
      runly_studio.member_active(${companyId}::uuid,${actorId}::uuid,'studio.templates.manage') AS manage,
      runly_studio.member_active(${companyId}::uuid,${actorId}::uuid,'studio.templates.publish') AS publish`
    return row
  }
  function flags(row, actorId, p) {
    const own = row.ownerId === actorId
    const canEdit = row.scope === 'company' ? p.publish : row.scope === 'personal' && own && p.manage
    return { canEdit: Boolean(canEdit), canDelete: Boolean(canEdit), canPublish: row.scope === 'personal' && own && Boolean(p.publish) }
  }
  function system(id) {
    const key = id.startsWith('runly:') ? id.slice(6) : id
    const row = STUDIO_TEMPLATES.find(row => row.key === key)
    if (!row) return null
    const document = templateDocument(key)
    return { ...row, id: `runly:${key}`, scope: 'runly', ownerId: null, ownerName: 'Runly', source: 'runly', revision: row.version,
      updatedAt: null, canEdit: false, canDelete: false, canPublish: false, document, ...studioSummary(document) }
  }
  async function row(db, companyId, actorId, id, lock = false) {
    if (!FILE_ID.test(id)) return missing()
    if (lock) await db.$queryRaw`SELECT id FROM studio_template WHERE id=${id}::uuid AND company_id=${companyId}::uuid FOR UPDATE`
    const [found] = await db.$queryRaw`SELECT t.id,t.name,t.category,t.description,t.scope,t.source,t.revision,t.document,
      t.owner_id AS "ownerId",u.display_name AS "ownerName",t.updated_at AS "updatedAt",t.source_design_id AS "sourceDesignId"
      FROM studio_template t JOIN user_profile u ON u.id=t.owner_id
      WHERE t.id=${id}::uuid AND t.company_id=${companyId}::uuid AND t.enabled
        AND (t.scope='company' OR t.owner_id=${actorId}::uuid)`
    return found ?? missing()
  }
  async function checkReferences(db, companyId, id, document) {
    for (const fileId of studioAssetIds(document)) {
      const [file] = await db.$queryRaw`SELECT f.id FROM file_asset f JOIN studio_template_asset a ON a.file_id=f.id
        WHERE a.template_id=${id}::uuid AND f.id=${fileId}::uuid AND f.entity_id=${companyId}::uuid
        AND f.enabled AND f.mime_type IN ('image/png','image/jpeg','image/webp')`
      if (!file) throw new StudioError('Una imagen de la plantilla ya no está disponible.', 403, 'STUDIO_ASSET_DENIED')
    }
  }
  async function get(companyId, actorId, id, db = prisma) {
    const p = await permissions(db, companyId, actorId), builtin = system(id)
    if (builtin) return builtin
    const found = await row(db, companyId, actorId, id)
    const document = validateDocument(found.document)
    await checkReferences(db, companyId, id, document)
    return { ...found, key:found.id, document, ...studioSummary(document), ...flags(found, actorId, p) }
  }
  async function list(companyId, actorId, query = {}) {
    const p = await permissions(prisma, companyId, actorId)
    const scope = query.scope ?? 'all', page = Math.max(1, Math.min(1000, parseInt(query.page,10) || 1)), size = 12
    if (!['all','runly','personal','company'].includes(scope)) throw new StudioError('Alcance inválido.')
    const q = String(query.q ?? '').trim().slice(0,80), category = String(query.category ?? 'all').slice(0,80)
    const fold = value => String(value).toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu,'')
    const builtins = ['all','runly'].includes(scope) ? STUDIO_TEMPLATES.filter(r => (category === 'all' || r.category === category) && fold(`${r.name} ${r.category} ${r.description}`).includes(fold(q))) : []
    // Projection happens in PostgreSQL: no full document is transferred for cards.
    const search = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`
    const whereScope = scope === 'all' ? '' : scope
    const [count] = scope === 'runly' ? [{ total: 0 }] : await prisma.$queryRaw`SELECT count(*)::int AS total FROM studio_template t
      WHERE t.company_id=${companyId}::uuid AND t.enabled AND (t.scope='company' OR t.owner_id=${actorId}::uuid)
      AND (${whereScope}='' OR t.scope=${whereScope}) AND (${category}='all' OR t.category=${category})
      AND concat_ws(' ',t.name,t.category,t.description) ILIKE ${search}`
    const offset = (page-1)*size, builtinPage = builtins.slice(offset, offset+size)
    const remaining = size-builtinPage.length, storedOffset = Math.max(0,offset-builtins.length)
    const stored = !remaining || scope === 'runly' ? [] : await prisma.$queryRaw`SELECT t.id,t.name,t.category,t.description,t.scope,t.source,t.revision,
      t.owner_id AS "ownerId",u.display_name AS "ownerName",t.updated_at AS "updatedAt",
      (t.document->'page'->>'width')::int AS width,(t.document->'page'->>'height')::int AS height,
      jsonb_array_length(t.document->'objects') AS "objectCount",
      jsonb_build_object('page',t.document->'page','objects',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',o->'id','type',CASE WHEN o->>'type' IN ('vector','line') THEN '"rectangle"'::jsonb ELSE o->'type' END,'x',o->'x','y',o->'y','width',o->'width','height',o->'height','rotation',o->'rotation',
        'fill',o->'fill','hidden',o->'hidden','opacity',o->'opacity','fontSize',o->'fontSize','fontFamily',o->'fontFamily',
        'text',left(o->>'text',120)) ORDER BY n) FROM jsonb_array_elements(t.document->'objects') WITH ORDINALITY a(o,n) WHERE n<=40),'[]'::jsonb)) AS preview
      FROM studio_template t JOIN user_profile u ON u.id=t.owner_id
      WHERE t.company_id=${companyId}::uuid AND t.enabled AND (t.scope='company' OR t.owner_id=${actorId}::uuid)
      AND (${whereScope}='' OR t.scope=${whereScope}) AND (${category}='all' OR t.category=${category})
      AND concat_ws(' ',t.name,t.category,t.description) ILIKE ${search}
      ORDER BY t.updated_at DESC,t.id LIMIT ${remaining} OFFSET ${storedOffset}`
    const categories = await prisma.$queryRaw`SELECT DISTINCT category FROM studio_template WHERE company_id=${companyId}::uuid
      AND enabled AND (scope='company' OR owner_id=${actorId}::uuid) LIMIT 100`
    const total = builtins.length+count.total
    // Old clients render document and select key. document is a preview alias.
    return { data: [...builtinPage.map(r => { const { document, ...card } = system(r.key); return {...card,document:card.preview} }),
      ...stored.map(r => ({ ...r,key:r.id,document:r.preview, ...flags(r,actorId,p) }))],
      pagination: { page, pageSize:size,total,totalPages:Math.max(1,Math.ceil(total/size)) },
      categories:[...new Set([...STUDIO_TEMPLATES.map(r=>r.category),...categories.map(r=>r.category)])].filter(Boolean) }
  }
  async function authorizeAssets(db, companyId, actorId, document, scope, existing, designId, fileContext) {
    // Existing template references are themselves a bounded delegation, only after
    // row authorization. Publishing personal assets requires their actual owner.
    for (const id of studioAssetIds(document)) {
      const [file] = await db.$queryRaw`SELECT f.id,f.uploaded_by_id AS "ownerId",
        EXISTS(SELECT 1 FROM studio_template_asset a WHERE a.template_id=${existing?.id ?? null}::uuid AND a.file_id=f.id) AS bound
        FROM file_asset f WHERE f.id=${id}::uuid AND f.entity_id=${companyId}::uuid AND f.enabled
          AND f.mime_type IN ('image/png','image/jpeg','image/webp')`
      if (!file) throw new StudioError('Imagen no autorizada.',403,'STUDIO_ASSET_DENIED')
      if (scope === 'company' && file.ownerId !== actorId && !(existing?.scope === 'company' && file.bound)) {
        throw new StudioError('Solo puedes compartir empresarialmente imágenes propias o ya concedidas a esta plantilla empresarial.',403,'STUDIO_ASSET_DENIED')
      }
      if (file.ownerId === actorId || file.bound) continue
      await access.assets(db,companyId,actorId,{ objects:[{id:'asset-reference',type:'image',fileAssetId:id}] },designId,fileContext)
    }
  }
  async function bind(db, id, actorId, document) {
    const ids = studioAssetIds(document)
    await db.$queryRaw`DELETE FROM studio_template_asset WHERE template_id=${id}::uuid AND NOT(file_id=ANY(${ids}::uuid[])) RETURNING file_id`
    for (const fileId of ids) await db.$queryRaw`INSERT INTO studio_template_asset(template_id,file_id,added_by)
      VALUES(${id}::uuid,${fileId}::uuid,${actorId}::uuid) ON CONFLICT DO NOTHING RETURNING file_id`
  }
  async function audit(db, companyId, actorId, action, result, extra = {}) {
    await db.auditLog.create({ data: { companyId,actorId,moduleKey:'runly.studio',entityType:'StudioTemplate',entityId:result.id,
      action:`studio.template.${action}`,metadata:{name:result.name,revision:result.revision,scope:result.scope,...extra} } })
  }
  // prepare is shared with MCP; it performs every check again on commit.
  async function prepare(companyId, actorId, operation, input, db = prisma, fileContext) {
    const p = await permissions(db,companyId,actorId)
    let current = null
    if (operation !== 'create') {
      current = await row(db,companyId,actorId,input.id)
      revision(input.revision)
      if (current.revision !== input.revision) conflict()
      const f = flags(current,actorId,p)
      if (!(operation === 'publish' ? f.canPublish : f.canEdit)) throw new StudioError('No tienes permiso para administrar esta plantilla.',403)
    }
    const scope = operation === 'publish' ? 'company' : current?.scope ?? input.scope ?? 'personal'
    if (!['personal','company'].includes(scope) || current && input.scope && input.scope !== current.scope) throw new StudioError('Utiliza la acción explícita de publicación.')
    if (operation === 'create' && !(scope === 'company' ? p.publish : p.manage)) throw new StudioError('No tienes permiso para crear esta plantilla.',403)
    if (input.source !== undefined || input.ownerId !== undefined || input.companyId !== undefined) throw new StudioError('Identidad u origen no editables.')
    if (operation === 'create' && Boolean(input.designId) === Boolean(input.document)) throw new StudioError('Indica designId o document, exclusivamente.')
    const source = input.designId ? await access.get(companyId,actorId,input.designId,db) : null
    const document = validateDocument(input.document ?? source?.document ?? current?.document)
    const name = text(input.name ?? current?.name,160,true), category = text(input.category ?? current?.category ?? '',80), description = text(input.description ?? current?.description ?? '',1000)
    if (operation !== 'delete') await authorizeAssets(db,companyId,actorId,document,scope,current,source?.id,fileContext)
    return { current,document,name,category,description,scope,sourceDesignId:source?.id ?? current?.sourceDesignId ?? null }
  }
  async function mutate(companyId,actorId,operation,input,fileContext,origin = 'user') {
    access.identity(companyId,actorId)
    return prisma.$transaction(async db => {
      await access.lock(db)
      if (operation !== 'create') { if (!FILE_ID.test(input.id)) missing(); await row(db,companyId,actorId,input.id,true) }
      const prepared = await prepare(companyId,actorId,operation,input,db,fileContext)
      const { name,category,description,scope,document,sourceDesignId } = prepared
      let saved
      if (operation === 'create') {
        ;[saved] = await db.$queryRaw`INSERT INTO studio_template(company_id,owner_id,scope,name,category,description,document,source,source_design_id)
          VALUES(${companyId}::uuid,${actorId}::uuid,${scope},${name},${category},${description},${JSON.stringify(document)}::jsonb,${origin === 'ai' ? 'ai' : 'user'},${sourceDesignId}::uuid)
          RETURNING id,revision,name,scope`
      } else {
        ;[saved] = await db.$queryRaw`UPDATE studio_template SET name=${name},category=${category},description=${description},scope=${scope},
          document=${JSON.stringify(document)}::jsonb,enabled=${operation !== 'delete'},revision=revision+1,updated_at=now()
          WHERE id=${input.id}::uuid AND company_id=${companyId}::uuid AND revision=${input.revision} AND enabled RETURNING id,revision,name,scope`
        if (!saved) conflict()
      }
      await bind(db,saved.id,actorId,document)
      await audit(db,companyId,actorId,operation,saved,{source:operation === 'create' ? origin : prepared.current.source})
      return operation === 'delete' ? { ...saved,enabled:false } : get(companyId,actorId,saved.id,db)
    })
  }
  async function use(companyId,actorId,id,fileContext,{name} = {}) {
    access.identity(companyId,actorId)
    return prisma.$transaction(async db => {
      await access.lock(db)
      await access.member(companyId,actorId,'studio.create',db)
      const template = await get(companyId,actorId,id,db)
      const designName=name === undefined ? template.name : text(name,160,true)
      const [saved] = await db.$queryRaw`INSERT INTO studio_design(company_id,owner_id,name,document)
        VALUES(${companyId}::uuid,${actorId}::uuid,${designName},${JSON.stringify(template.document)}::jsonb)
        RETURNING id,name,revision,document,updated_at AS "updatedAt"`
      await access.bindAssets(db,saved.id,actorId,{ids:studioAssetIds(template.document),origins:new Map()})
      await access.audit(db,companyId,actorId,'studio.design.create',saved,{templateId:template.id})
      // Builtin identifiers are not UUID AuditLog entity ids.
      await audit(db,companyId,actorId,'use',{...template,id:template.scope === 'runly' ? saved.id : template.id},{templateId:template.id,designId:saved.id})
      return {...saved,ownerId:actorId,role:'OWNER',canEdit:true}
    })
  }
  return { list,get,prepare,use,create:(c,a,i,f,origin)=>mutate(c,a,'create',i,f,origin),
    update:(c,a,id,i,f)=>mutate(c,a,'update',{...i,id},f),publish:(c,a,id,i,f)=>mutate(c,a,'publish',{...i,id},f),
    remove:(c,a,id,i,f)=>mutate(c,a,'delete',{...i,id},f) }
}
