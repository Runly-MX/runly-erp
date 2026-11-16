export const STUDIO_PROTOCOL_VERSION=4
// Protocol 3 clients (v7 validator) may still write v7 documents; never v8 ones.
export const STUDIO_MIN_CLIENT_PROTOCOL=3
export const STUDIO_PROTOCOL_HEADER='X-Runly-Studio-Protocol'
export function requireStudioProtocol(value){
  if(value?.version!==STUDIO_PROTOCOL_VERSION)throw Object.assign(Error('La API y Studio no son compatibles. Conserva tu borrador y recarga cuando ambos estén actualizados.'),{status:426,code:'STUDIO_UPGRADE_REQUIRED'})
  return value
}
// Header value → accepted protocol number, or null.
export function clientProtocol(header){
  const value=Number(header)
  return Number.isInteger(value)&&value>=STUDIO_MIN_CLIENT_PROTOCOL&&value<=STUDIO_PROTOCOL_VERSION?value:null
}
// A client that cannot read v8 must not write a document that is, or becomes, v8.
export function clientCanWrite(protocol,...schemaVersions){
  return protocol>=4||schemaVersions.every(version=>(version??0)<8)
}
