import { z } from 'zod'
import { StudioError, validateDocument, blankDocument } from '../../../../shared/studio/document.js'
import { createStudioApplication,studioFileContext,studioEditorLink } from '../../routes/studio/studio-application.js'
import { createStudioMiraiCapabilities } from '../../routes/studio/mirai-capabilities.js'
import { studioSummary } from '../../routes/studio/studio-document-data.js'

export function createStudioAdapter(dependencies) {
  const app=dependencies.application ?? createStudioApplication(dependencies)
  const capability=createStudioMiraiCapabilities({...dependencies,application:app})
  const metadata={name:z.string().trim().min(1).max(160),category:z.string().max(80).optional(),description:z.string().max(1000).optional()}
  const document=z.json(), revision=z.number().int().positive(), templateId=z.uuid()
  const summary=(title,scene,extra=[])=>({title,fields:[{label:'Nombre',value:title},...extra,
    {label:'Documento editable',value:`${scene.page.width} × ${scene.page.height} px; ${studioSummary(scene).objectCount} objetos; fondo ${scene.page.background}`},
    ...scene.objects.filter(o=>o.type==='text').slice(0,8).map(o=>({label:`Texto ${o.id}`,value:`${o.text.slice(0,200)} (${o.fontFamily}, ${o.fontSize}px, ${o.fill})`}))]})
  const actions=[
    // New design from a full document, a template, or a blank page (size and background).
    {key:'studio_create_design',permission:'studio.create',operation:'create',label:'Crear diseño',inputSchema:z.strictObject({name:metadata.name,document:document.optional(),templateId:z.string().min(1).max(100).optional(),
      page:z.strictObject({width:z.number().int().min(32).max(4096),height:z.number().int().min(32).max(4096),background:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff')}).optional()}),
      async prepare(input,a) {
        await app.designs.access.member(a.companyId,a.actorProfileId,'studio.create')
        if([input.document,input.templateId,input.page].filter(Boolean).length!==1)throw new StudioError('Indica document, templateId o page (lienzo en blanco), exclusivamente.')
        if(input.page){const blank=blankDocument(input.page.width,input.page.height);input={...input,document:{...blank,page:{...blank.page,background:input.page.background.toLowerCase()}}};delete input.page}
        const template=input.templateId?await app.templates.get(a.companyId,a.actorProfileId,input.templateId):null
        const scene=validateDocument(template?.document??input.document)
        if(!template)await app.designs.access.assets(dependencies.prisma,a.companyId,a.actorProfileId,scene,null,studioFileContext(a))
        return {input,targetId:null,preview:summary(input.name,scene),templateRevision:template?.revision??null}
      },
      async execute(input,a) { const row=input.templateId?await app.templates.use(a.companyId,a.actorProfileId,input.templateId,studioFileContext(a),{name:input.name}):await app.designs.create(a.companyId,a.actorProfileId,input,studioFileContext(a));return {id:row.id,name:row.name,revision:row.revision,link:studioEditorLink(row.id)} } },
    {key:'studio_update_design',permission:'studio.edit',operation:'update',label:'Actualizar diseño',inputSchema:z.strictObject({designId:z.uuid(),name:metadata.name,document,revision}),
      async prepare(input,a) {
        const row=await app.designs.access.get(a.companyId,a.actorProfileId,input.designId,dependencies.prisma,true)
        if(row.revision!==input.revision)throw new StudioError('El diseño cambió.',409,'STUDIO_REVISION_CONFLICT')
        const scene=validateDocument(input.document)
        await app.designs.access.assets(dependencies.prisma,a.companyId,a.actorProfileId,scene,input.designId,studioFileContext(a))
        return {input,targetId:row.id,preview:summary(input.name,scene,[{label:'Nombre anterior',value:row.name}])}
      },
      async execute(input,a) { const row=await app.designs.update(a.companyId,a.actorProfileId,input.designId,input,studioFileContext(a));return {id:row.id,name:row.name,revision:row.revision,link:studioEditorLink(row.id)} } },
    ...[
      ['studio_template_save','studio.view','create',z.strictObject({...metadata,scope:z.enum(['personal','company']).default('personal'),designId:z.uuid().optional(),document:document.optional()})],
      ['studio_template_update','studio.view','update',z.strictObject({templateId,revision,...Object.fromEntries(Object.entries(metadata).map(([k,v])=>[k,v.optional()])),document:document.optional()})],
      ['studio_template_publish','studio.templates.publish','publish',z.strictObject({templateId,revision})],
    ].map(([key,permission,operation,inputSchema])=>({key,permission,operation:operation==='create'?'create':'update',label:key,inputSchema,
      async prepare(input,a) {
        const prepared=await app.templates.prepare(a.companyId,a.actorProfileId,operation,{...input,id:input.templateId},dependencies.prisma,studioFileContext(a))
        return {input,targetId:prepared.current?.id??null,scope:prepared.scope,preview:summary(prepared.name,prepared.document,[
          {label:'Alcance',value:prepared.scope==='company'?'Empresa: accesible para miembros autorizados':'Personal: solo tú'},
          {label:'Imágenes',value:'Solo recursos autorizados; compartir empresarialmente concede su uso en nuevos diseños.'}])}
      },
      async execute(input,a) {
        const row=operation==='create'?await app.templates.create(a.companyId,a.actorProfileId,input,studioFileContext(a),'ai'):
          await app.templates[operation==='publish'?'publish':'update'](a.companyId,a.actorProfileId,input.templateId,input,studioFileContext(a))
        return {id:row.id,name:row.name,scope:row.scope,source:row.source,revision:row.revision}
      } })),
  ].map(action=>({...action,readPermission:'studio.view'}))
  return {moduleKey:'runly.studio',label:'Studio',queries:capability.tools,actions,
    async revision(definition,prepared,a) {
      if(definition.key==='studio_update_design')return app.detail(a,prepared.targetId)
      if(prepared.targetId)return app.templates.get(a.companyId,a.actorProfileId,prepared.targetId)
      if(prepared.input.templateId)return app.templates.get(a.companyId,a.actorProfileId,prepared.input.templateId)
      if(prepared.input.designId)return app.detail(a,prepared.input.designId)
      return null
    },
    sensitive:(definition,input)=>definition.key==='studio_template_publish'||definition.key==='studio_template_update'||input?.scope==='company',
    effects:['Crear/editar documentos de Studio o plantillas. Compartir una plantilla empresarial concede uso de sus imágenes en diseños independientes; no hace públicos los archivos.']}
}
