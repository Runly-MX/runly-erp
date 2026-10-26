import { LINE_CAPS } from '../../../../shared/studio/shape-properties.js'
import { blankDocument, appendObject, STUDIO_LIMITS, STUDIO_SCHEMA_VERSION, validateDocument, StudioError } from '../../../../shared/studio/document.js'
import { STUDIO_FONTS, STUDIO_FONT_VARIANTS, studioFontStyle } from '../../../../shared/studio/fonts.js'
import { createStudioService } from './studio-service.js'
import { createStudioTemplatesService } from './studio-templates-service.js'
import { createStudioCatalog } from './catalog/service.js'
import { createStudioResources } from './studio-resources.js'
import { createFilesService } from '../../services/files-service.js'
import { studioSummary } from './studio-document-data.js'
import { reviewStudioDocument } from './studio-review.js'

export const studioFileContext = a => ({authUserId:a.actorAuthUserId,activeContext:{companyId:a.companyId,profileId:a.actorProfileId,isAdmin:a.isAdmin,permissionSet:a.permissionSet}})
export const studioEditorLink = id => `/app/m/runly.studio?design=${encodeURIComponent(id)}`

// One application boundary for HTTP-compatible services and both agent surfaces.
export function createStudioApplication({ prisma, supabaseAdmin, filesService = createFilesService({prisma,supabaseAdmin}), broadcaster }) {
  const designs=createStudioService({prisma,filesService,broadcaster})
  const templates=createStudioTemplatesService({prisma,filesService,designService:designs})
  const catalog=createStudioCatalog({prisma,access:designs.access,filesService,supabaseAdmin})
  const resources=createStudioResources({access:designs.access,filesService,supabaseAdmin})
  async function guide(a) {
    await designs.access.member(a.companyId,a.actorProfileId)
    return {schemaVersion:STUDIO_SCHEMA_VERSION,limits:STUDIO_LIMITS,unit:'px',
      shapeContract:{fill:'six-digit hex fallback',fillPaint:{solid:{type:'solid',color:'#2563eb'},image:{type:'image',fileAssetId:'UUID autorizado de Files',image:{fit:'cover',zoom:1,offsetX:0,offsetY:0,rotation:0,flipX:false,flipY:false}}},shape:{fillEnabled:true,strokeWidth:0,strokeColor:'#000000',dash:'solid',strokeAlign:'center',radius:0},photoGeometry:'rectangle, ellipse or filled monochrome vector paths only'},
      lineCaps:LINE_CAPS,
      objectTypes:['text','rectangle','ellipse','image','vector','line'],
      fonts:STUDIO_FONTS.map(font=>({family:font.family,name:font.name,variants:Object.keys(STUDIO_FONT_VARIANTS).filter(v=>studioFontStyle(font.family,v))})),
      example:appendObject(blankDocument(),'text',{text:'Tu mensaje',fontSize:64,fill:'#111827'}),
      guide:['Usa objetos editables; consulta un diseño o plantilla para obtener un documento completo válido.',
        'Conserva schemaVersion vigente, unit px, página y objetos con id único, x/y, width/height, rotation y fill.',
        'Imágenes: fileAssetId autorizado de studio_media; nunca URLs, firmas ni base64. Iconos: studio_icon_search conserva licencia; consulta catálogo para geometría.',
        'Grupos actuales: groupId compartido entre objetos planos. No inventes árboles Fabric ni campos del renderer.',
        'Consulta studio_review_design antes de proponer; es informativo y no sustituye la inspección visual.',
        'Toda escritura requiere prepare → aprobación web → commit MCP. La publicación empresarial pide confirmación sensible adicional.'],
      link:'/app/m/runly.studio',capabilities:{templates:true,review:true,renderPreview:false,mutations:'MCP aprobado'} }
  }
  async function overview(a) {
    const contract=await guide(a)
    const [rows,counts,runly,personal,company]=await Promise.all([
      designs.list(a.companyId,a.actorProfileId),
      prisma.$queryRaw`SELECT count(*)::int AS total FROM studio_design d WHERE d.company_id=${a.companyId}::uuid AND runly_studio.can_access(d.id,${a.actorProfileId}::uuid,false)`,
      templates.list(a.companyId,a.actorProfileId,{scope:'runly'}),templates.list(a.companyId,a.actorProfileId,{scope:'personal'}),templates.list(a.companyId,a.actorProfileId,{scope:'company'})])
    return {...contract,designs:{items:rows.map(({preview,...row})=>({...row,link:studioEditorLink(row.id)})),total:counts[0].total,page:1,pageSize:24},
      templates:{runly:runly.pagination.total,personal:personal.pagination.total,company:company.pagination.total},categories:personal.categories}
  }
  async function detail(a,id) {
    const result=await designs.get(a.companyId,a.actorProfileId,id)
    return {...result,...studioSummary(result.document),link:studioEditorLink(id)}
  }
  async function review(a,input) {
    if ([input.designId,input.templateId,input.document].filter(Boolean).length!==1) throw new StudioError('Indica un diseño, una plantilla o un documento, exclusivamente.')
    await designs.access.member(a.companyId,a.actorProfileId)
    const document=input.designId?(await detail(a,input.designId)).document:input.templateId?(await templates.get(a.companyId,a.actorProfileId,input.templateId)).document:validateDocument(input.document)
    if(input.document) await designs.access.assets(prisma,a.companyId,a.actorProfileId,document,null,studioFileContext(a))
    return reviewStudioDocument(document)
  }
  return {designs,templates,guide,overview,detail,review,catalog,resources}
}
