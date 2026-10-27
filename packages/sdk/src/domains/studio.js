export function createStudioDomain({ request, requestBlob, withAuthHeaders, toQueryString }) {
  const path = id => `/studio/designs/${encodeURIComponent(id)}`
  const options = (token, method = 'GET', data) => ({ method, headers: {...withAuthHeaders(token),...(method==='GET'?{}:{'X-Runly-Studio-Protocol':'3'})}, onlineOnly: true,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  const interchange = '/studio/interchange'
  const catalogRequest = async (url, config, blob = false) => {
    const requestId=`studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`
    try { return await (blob?requestBlob:request)(url,{...config,headers:{...config.headers,'X-Runly-Catalog-Request':requestId}}) }
    catch(error){error.catalogRequestId=requestId;error.code=error.code??error.details?.code;throw error}
  }
  const packageBody = (file, data) => {
    const body = new FormData(), name = file.name || 'plantilla.runlystudio'
    const type = file.type || (name.endsWith('.svg') ? 'image/svg+xml' : 'application/vnd.runly.studio+zip')
    body.set('file', new Blob([file], { type }), name)
    if (data) body.set('options', JSON.stringify(data))
    return body
  }
  return {
    packageContract: (token, signal) => request(`${interchange}/schema`, { ...options(token), signal }),
    inspectPackage: (file, token, signal) => request(`${interchange}/inspect`, { ...options(token, 'POST'), body: packageBody(file), signal }),
    preparePackageImport: (file, data, token, signal) => request(`${interchange}/imports`, { ...options(token, 'POST'), body: packageBody(file, data), signal }),
    packageImportStatus: (id, token, signal) => request(`${interchange}/imports/${encodeURIComponent(id)}`, { ...options(token), signal }),
    packageImportAsset: (id, resourceId, token, signal) => requestBlob(`${interchange}/imports/${encodeURIComponent(id)}/assets/${encodeURIComponent(resourceId)}`, { ...options(token), signal }),
    confirmPackageImport: (id, data, token, signal) => request(`${interchange}/imports/${encodeURIComponent(id)}/confirm`, { ...options(token, 'POST', data), signal }),
    cancelPackageImport: (id, token, signal) => request(`${interchange}/imports/${encodeURIComponent(id)}`, { ...options(token, 'DELETE'), signal }),
    recoverPackageImports: (token, signal) => request(`${interchange}/recover`, { ...options(token, 'POST'), signal }),
    exportPackage: (kind, id, data, token, signal) => requestBlob(`${interchange}/${kind === 'template' ? 'templates' : 'designs'}/${encodeURIComponent(id)}/export`, { ...options(token, 'POST', data), signal }),
    listPages: (id,token,signal) => request(`${path(id)}/pages`,{...options(token),signal}),
    getPage: (id,pageId,token,signal) => request(`${path(id)}/pages/${encodeURIComponent(pageId)}`,{...options(token),signal}),
    createPrintJob: (id,data,token,signal) => request(`${path(id)}/export/jobs`,{...options(token,'POST',data),signal}),
    appendPrintPage: (id,jobId,pageId,file,token,signal) => {
      const body=new FormData();body.set('file',file,'render.png')
      return request(`${path(id)}/export/jobs/${encodeURIComponent(jobId)}/pages/${encodeURIComponent(pageId)}`,{...options(token,'POST'),body,signal})
    },
    finishPrintJob: (id,jobId,token,signal) => requestBlob(`${path(id)}/export/jobs/${encodeURIComponent(jobId)}/finish`,{...options(token,'POST'),signal}),
    cancelPrintJob: (id,jobId,token) => request(`${path(id)}/export/jobs/${encodeURIComponent(jobId)}`,options(token,'DELETE')),
    saveImageCopy: (id,fileId,file,token,signal) => {
      const body = new FormData(); body.set('file',file)
      return request(`${path(id)}/assets/${encodeURIComponent(fileId)}/edited-copy`,{method:'POST',headers:withAuthHeaders(token),body,signal,onlineOnly:true})
    },
    // Print PDF (RGB/CMYK, bleed, crop marks) from a high-resolution PNG render of the design.
    exportPrintPdf: (id, file, params, token, signal) => {
      const body = new FormData(); body.set('file', file, 'render.png')
      for (const [key, value] of Object.entries(params)) body.set(key, String(value))
      return requestBlob(`${path(id)}/export/print-pdf`, { method: 'POST', headers: withAuthHeaders(token), body, signal, onlineOnly: true })
    },
    catalogSearch: (provider, token, query = {}, signal) => catalogRequest(`/studio/catalog/${encodeURIComponent(provider)}/search${toQueryString(query)}`, { ...options(token), signal }),
    catalogDetails: (provider, id, token, signal) => catalogRequest(`/studio/catalog/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`, { ...options(token), signal }),
    catalogThumbnail: (provider, id, token, signal) => catalogRequest(`/studio/catalog/${encodeURIComponent(provider)}/${encodeURIComponent(id)}/thumbnail`, { ...options(token), signal },true),
    catalogImport: (provider, id, designId, token, signal) => catalogRequest(`/studio/catalog/${encodeURIComponent(provider)}/${encodeURIComponent(id)}/import`, {...options(token, 'POST', { designId }),signal}),
    credits: (id, document, token) => request(`${path(id)}/credits`, options(token, 'POST', { document })),
    templates: (token, query = {}, signal) => request(`/studio/templates${toQueryString(query)}`, { ...options(token), signal }),
    createFromTemplate: (key, token) => request(`/studio/templates/${encodeURIComponent(key)}/designs`, options(token, 'POST', {})),
    // Templates (personal/company): metadata changes and retirement carry the expected revision (409 on conflict).
    templateAssetUrl: (id,fileId,token,signal) => request(`/studio/templates/${encodeURIComponent(id)}/assets/${encodeURIComponent(fileId)}/signed-url`,{...options(token),signal}),
    templateDetail: (id, token, signal) => request(`/studio/templates/${encodeURIComponent(id)}`, { ...options(token), signal }),
    saveTemplate: (data, token) => request('/studio/templates', options(token, 'POST', data)),
    updateTemplate: (id, data, token) => request(`/studio/templates/${encodeURIComponent(id)}`, options(token, 'PUT', data)),
    publishTemplate: (id, revision, token) => request(`/studio/templates/${encodeURIComponent(id)}/publish`, options(token, 'POST', { revision })),
    retireTemplate: (id, revision, token) => request(`/studio/templates/${encodeURIComponent(id)}`, options(token, 'DELETE', { revision })),
    resources: (token, query = {}, signal) => request(`/studio/resources${toQueryString(query)}`, { ...options(token), signal }),
    thumbnail: (id, token, signal) => requestBlob(`/studio/resources/${encodeURIComponent(id)}/thumbnail`, { ...options(token), signal }),
    listDesigns: (token, query = {}) => request(`/studio/designs${toQueryString(query)}`, options(token)),
    getDesign: (id, token, signal) => request(path(id), {...options(token),signal}),
    protocol: token=>request('/studio/protocol',options(token)),
    createDesign: (data, token) => request('/studio/designs', options(token, 'POST', data)),
    updateDesign: (id, data, token) => request(path(id), options(token, 'PUT', data)),
    deleteDesign: (id, revision, token) => request(path(id), options(token, 'DELETE', { revision })),
    applyChanges: (id, data, token) => request(`${path(id)}/changes`, options(token, 'POST', data)),
    changeReceipt: (id, batch, token) => request(`${path(id)}/changes?${new URLSearchParams({clientId:batch.clientId,batchId:String(batch.batchId)})}`, options(token)),
    collaborators: (id, token) => request(`${path(id)}/collaborators`, options(token)),
    candidates: (id, token, q = '') => request(`${path(id)}/candidates${toQueryString({ q })}`, options(token)),
    share: (id, data, token) => request(`${path(id)}/collaborators`, options(token, 'PUT', data)),
    assetUrl: (id, fileId, token, signal) => request(`${path(id)}/assets/${encodeURIComponent(fileId)}/signed-url`, {...options(token),signal}),
    collaborationContext: (id, data, token, signal) => request(`${path(id)}/collaboration`, {...options(token, 'POST', data),signal}),
    live: (id, data, token, signal) => request(`${path(id)}/live`, {...options(token, 'POST', data),signal}),
  }
}
