import sharp from 'sharp'
import { FILE_ID, StudioError } from '../../../../shared/studio/document.js'
import { isStudioRaster } from './image-format.js'

const MAX_BYTES = 10 * 1024 * 1024
const MIME = new Set(['image/png','image/jpeg','image/webp'])

// Creates a private derivative. No method here replaces or deletes a source asset.
export function createStudioImageCopies({ prisma, access, filesService }) {
  let running = 0
  async function authorize(companyId, actorId, designId, fileId) {
    if (!FILE_ID.test(fileId)) throw new StudioError('Imagen no encontrada.',404)
    await access.member(companyId,actorId,'studio.edit')
    await access.member(companyId,actorId,'files.assets.read')
    await access.member(companyId,actorId,'files.assets.create')
    const design = await access.get(companyId,actorId,designId,prisma,true)
    if (!design.document.objects.some(object => object.type === 'image' && object.fileAssetId === fileId) && !await access.imageAllowed(companyId,designId,fileId)) throw new StudioError('La imagen ya no pertenece al diseño.',409)
    const file = await prisma.fileAsset.findFirst({where:{id:fileId,entityId:companyId,enabled:true}})
    if (!file || !MIME.has(file.mimeType)) throw new StudioError('Imagen no disponible.',404)
    // Access to a bound design image is delegated by the current design ACL.
    return file
  }
  async function create(companyId,actorId,designId,fileId,file,context) {
    const original = await authorize(companyId,actorId,designId,fileId)
    if (!file || typeof file.arrayBuffer !== 'function' || !MIME.has(file.type) || file.size < 1 || file.size > MAX_BYTES) throw new StudioError('La copia debe ser PNG, JPG o WebP de hasta 10 MB.',413)
    if (running >= 2) throw new StudioError('Hay imágenes procesándose. Reintenta en un momento.',429)
    running++
    try {
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.length !== file.size || bytes.length > MAX_BYTES || !isStudioRaster(bytes,file.type)) throw new StudioError('El contenido no coincide con el formato de imagen.',400)
      let metadata
      try {
        const image = sharp(bytes,{limitInputPixels:25_000_000,animated:false})
        metadata = await image.metadata()
        if (!metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) throw Error('invalid')
        await image.clone().resize(1,1).raw().toBuffer()
      } catch { throw new StudioError('Imagen inválida o superior a 25 megapíxeles y 8192 px por lado.',400) }
      await authorize(companyId,actorId,designId,fileId)
      const result = await filesService.upload({...context,file:new File([bytes],`studio-copia.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`,{type:file.type}),
        fields:{moduleKey:'runly.files',entityType:'AtlasFile',visibility:'PRIVATE',sensitivity:'RESTRICTED',metadata:{
          studioEditedFrom:fileId,...(original.metadata?.studioSource ? {studioSource:original.metadata.studioSource} : {})}}})
      // An upload cannot grant Studio access after a revocation. The private copy
      // stays owned by its uploader if access changes during Storage I/O.
      await authorize(companyId,actorId,designId,fileId)
      await prisma.auditLog.create({data:{companyId,actorId,moduleKey:'runly.studio',entityType:'StudioDesign',entityId:designId,
        action:'studio.image.copy',metadata:{sourceFileId:fileId,copyFileId:result.id}}})
      await authorize(companyId,actorId,designId,fileId)
      return {id:result.id,name:result.originalName,width:metadata.width,height:metadata.height,mimeType:file.type}
    } finally { running-- }
  }
  return {create}
}
