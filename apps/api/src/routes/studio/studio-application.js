import { DEFAULT_GRADIENT } from '../../../../shared/studio/gradient.js'
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
  const templates=createStudioTemplatesService({prisma,filesService,supabaseAdmin,designService:designs})
  const catalog=createStudioCatalog({prisma,access:designs.access,filesService,supabaseAdmin})
  const resources=createStudioResources({access:designs.access,filesService,supabaseAdmin})
  async function guide(a) {
    await designs.access.member(a.companyId,a.actorProfileId)
    return {schemaVersion:STUDIO_SCHEMA_VERSION,limits:STUDIO_LIMITS,unit:'px',
      shapeContract:{fill:'six-digit hex fallback',fillPaint:{gradient:DEFAULT_GRADIENT,solid:{type:'solid',color:'#2563eb'},image:{type:'image',fileAssetId:'UUID autorizado de Files',image:{fit:'cover',zoom:1,offsetX:0,offsetY:0,rotation:0,flipX:false,flipY:false}}},shape:{fillEnabled:true,strokeWidth:0,strokeColor:'#000000',dash:'solid',strokeAlign:'center',radius:0},photoGeometry:'rectangle, ellipse or a single closed filled monochrome vector path without stroke'},
      lineCaps:LINE_CAPS,
      objectTypes:['text','rectangle','ellipse','image','vector','line'],
      gradientContract:{surfaces:['rectangle','ellipse','single closed filled monochrome vector','page.backgroundPaint'],stops:'2-12 strictly increasing unique offsets 0-1; hex color and opacity 0-1',linear:'angle -360..360 clockwise; 0 left to right',radial:'centerX/centerY 0-1, radius 0.01-2 times min(width,height)',text:false,stroke:false,conic:false},
      textContract:{text:'string, \n para saltos',fontSize:'8–500',fontFamily:'familia de fonts',fontVariant:'solo las variantes listadas en fonts',textAlign:['left','center','right','justify'],lineHeight:'0.5–4 (por defecto 1.16)',charSpacing:'-200–1000, milésimas de em',underline:false,linethrough:false,width:'ancho de caja; el texto se ajusta a ese ancho'},
      lineContract:{points:'2–256 pares [x,y] normalizados 0–1 dentro de width/height (polilínea)',strokeWidth:'0.5–128',dash:['solid','dashed','dotted'],startCap:LINE_CAPS,endCap:LINE_CAPS,fill:'color del trazo',note:'El tamaño de cada extremo crece con el grosor y se limita al segmento contiguo: deja el primer y último segmento largos si usas extremos.'},
      imageContract:{fileAssetId:'UUID de Files autorizado',image:{fit:['cover','contain'],zoom:'0.1–8',offsetX:'-4–4 fracción del marco',offsetY:'-4–4',mask:['rectangle','rounded','circle','ellipse','arch','star','triangle'],radius:'para rounded',border:{width:0,color:'#000000'},shadow:{blur:0,offsetX:0,offsetY:0,color:'#000000'}}},
      illustration:['Dibuja ilustraciones con primitivas editables; cada pieza debe poder recolorearse o moverse. No uses SVG propio: los vectores vienen de studio_icon_search (licencia conservada).',
        'rotation gira alrededor de la esquina superior izquierda (x, y). Un cuadrado girado 45° tiene su pico en (x, y): sirve para montañas, rombos y techos; tapa la base con otra forma.',
        'Casquetes de nieve o brillos: rombos más pequeños (cuadrado a 45°) con el vértice superior sobre el borde del pico.',
        'Rectángulo con shape.radius = alto/2 da píldoras (botones, nubes apiladas); radius = ancho/2 en un rectángulo alto da arcos de ventana.',
        'Anillos y asas: elipse con shape.fillEnabled=false y strokeWidth grueso. Insignias: círculo + anillo interior con dash dashed.',
        'Vapor, olas, ramas, rutas y aves: polilíneas (points) con dash y extremos; hojas y nubes: elipses giradas.',
        'Ordena por capas: fondo → planos lejanos → planos cercanos → texto. Deja márgenes de 60–80 px y alinea textos en una retícula.',
        'Ejemplos completos para estudiar: studio_template_detail con templateId runly:slow-mornings (menú ilustrado) o runly:sunrise-trail (cartel con paisaje y mapa de ruta).'],
      fonts:STUDIO_FONTS.map(font=>({family:font.family,name:font.name,variants:Object.keys(STUDIO_FONT_VARIANTS).filter(v=>studioFontStyle(font.family,v))})),
      example:appendObject(blankDocument(),'text',{text:'Tu mensaje',fontSize:64,fill:'#111827'}),
      guide:['Usa objetos editables; consulta un diseño o plantilla para obtener un documento completo válido.',
        'Conserva schemaVersion vigente, unit px, página y objetos con id único, x/y, width/height, rotation y fill.',
        'Imágenes: fileAssetId autorizado de studio_media; nunca URLs, firmas ni base64. Iconos: studio_icon_search conserva licencia; consulta catálogo para geometría.',
        'Imagen nueva (generada o adjunta en el chat): runly_files_import_prepare/commit sin destino la guarda en Mis archivos (PNG, JPG o WebP); luego studio_media (workspace mine) devuelve su fileAssetId para usarla como objeto image o como fillPaint de una forma.',
        'Foto dentro de una forma: rectangle/ellipse (o vector de un único trazo cerrado relleno) con fillPaint {type:"image",fileAssetId,image:{fit:"cover"}}; fill queda como color de respaldo. La máscara, borde y radio son los de la forma (shape).',
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
