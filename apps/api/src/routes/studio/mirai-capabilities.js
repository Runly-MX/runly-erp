import { z } from 'zod'
import { createStudioApplication, studioFileContext, studioEditorLink } from './studio-application.js'

export function createStudioMiraiCapabilities(dependencies) {
  const app=dependencies.application ?? createStudioApplication(dependencies)
  const paging={page:z.number().int().min(1).max(1000).default(1),q:z.string().max(80).optional()}
  function query(name,description,inputSchema,run) {
    return {name,permission:'studio.view',inputSchema,definition:{description,parameters:z.toJSONSchema(inputSchema,{io:'input'})},run:(input,a)=>run(inputSchema.parse(input),a)}
  }
  const tools=[
    query('studio_overview','Resumen autorizado de Studio, recuentos por alcance y contrato vigente.',z.strictObject({}),(_,a)=>app.overview(a)),
    query('studio_designs','Buscar diseños accesibles. Devuelve una página de metadatos y enlaces.',z.strictObject(paging),async(input,a)=>{
      const rows=await app.designs.list(a.companyId,a.actorProfileId,input)
      return {items:rows.map(({preview,...row})=>({...row,link:studioEditorLink(row.id)})),page:input.page,pageSize:24,hasMore:rows.length===24}
    }),
    query('studio_design_detail','Diseño accesible, documento completo, revisión y permisos.',z.strictObject({designId:z.uuid()}),(input,a)=>app.detail(a,input.designId)),
    query('studio_templates','Plantillas Runly, personales propias y empresariales autorizadas.',z.strictObject({...paging,scope:z.enum(['all','runly','personal','company']).default('all'),category:z.string().max(80).optional()}),(input,a)=>app.templates.list(a.companyId,a.actorProfileId,input)),
    query('studio_template_detail','Documento y permisos de una plantilla autorizada.',z.strictObject({templateId:z.string().min(1).max(100)}),(input,a)=>app.templates.get(a.companyId,a.actorProfileId,input.templateId)),
    query('studio_icon_search','Buscar iconos con licencia; iconId devuelve detalle y geometría editable del catálogo.',z.strictObject({...paging,collection:z.enum(['tabler','lucide']).default('tabler'),iconId:z.string().max(120).optional()}),(input,a)=>input.iconId?app.catalog.details(a.companyId,a.actorProfileId,'iconify',input.iconId):app.catalog.search(a.companyId,a.actorProfileId,'iconify',input)),
    query('studio_media','Imágenes autorizadas mediante Files; solo metadatos y fileAssetId, sin URLs.',z.strictObject({...paging,workspace:z.enum(['mine','company']).default('mine')}),(input,a)=>app.resources.list(a.companyId,a.actorProfileId,input,studioFileContext(a))),
    query('studio_composition_guide','Contrato, fuentes, variantes y guía de documentos editables.',z.strictObject({}),(_,a)=>app.guide(a)),
    query('studio_review_design','Revisión informativa de geometría, tipografía y contraste, sin rasterización.',z.strictObject({designId:z.uuid().optional(),templateId:z.string().min(1).max(100).optional(),document:z.json().optional()}),(input,a)=>app.review(a,input)),
  ]
  return {moduleKey:'runly.studio',label:'Studio',summary:'Diseños editables, plantillas y revisión de calidad. Escrituras mediante MCP con aprobación web.',
    tools,actions:[],publicLookup:[],async describeContext(page,a) { if(!page?.recordId)return null;const row=await app.detail(a,page.recordId);return `Diseño de Studio «${row.name}», revisión ${row.revision}.` } }
}
