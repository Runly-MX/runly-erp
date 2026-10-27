export function catalogError(error, offline = globalThis.navigator?.onLine === false) {
  const code=error?.code??error?.details?.code
  if (offline) return { title:'Sin conexión',description:'Puedes seguir editando y usar archivos guardados. Comprueba tu conexión para consultar el catálogo.' }
  if (error?.status===429) return { title:'Límite de solicitudes',description:'Espera un momento y reintenta. Tus archivos guardados siguen disponibles.' }
  if (/^CATALOG_(DNS|CONNECT|TLS|HEADERS|DOWNLOAD|TOTAL)_TIMEOUT$/.test(code??'')) return { title:'Tiempo de espera agotado',description:'El proveedor no respondió a tiempo. Reintenta, cambia la búsqueda o elige una imagen de Archivos.' }
  if (/TIMEOUT/.test(code??'')||error?.status===504) return { title:'Tiempo de espera agotado',description:'No se pudo completar la consulta al servidor. Reintenta o elige una imagen de Archivos.' }
  if (code==='CATALOG_LICENSE_DENIED') return { title:'Licencia no compatible',description:'No se puede usar este recurso con las condiciones actuales. Elige otro recurso.' }
  if ([502,503].includes(error?.status)) return { title:'Proveedor no disponible',description:'El catálogo externo no está disponible. Puedes reintentar o seguir usando Archivos y tus propios recursos.' }
  if ([400,413].includes(error?.status)) return { title:'Recurso no compatible',description:'El archivo no tiene un formato o tamaño compatible. Elige otro recurso.' }
  return { title:'No se pudo cargar el recurso',description:'Reintenta o elige un archivo propio.' }
}
