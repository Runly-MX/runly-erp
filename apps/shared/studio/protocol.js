export const STUDIO_PROTOCOL_VERSION=3
export const STUDIO_PROTOCOL_HEADER='X-Runly-Studio-Protocol'
export function requireStudioProtocol(value){
  if(value?.version!==STUDIO_PROTOCOL_VERSION)throw Object.assign(Error('La API y Studio no son compatibles. Conserva tu borrador y recarga cuando ambos estén actualizados.'),{status:426,code:'STUDIO_UPGRADE_REQUIRED'})
  return value
}
