export function createStudioDomain({ request, requestBlob, withAuthHeaders, toQueryString }) {
  const path = id => `/studio/designs/${encodeURIComponent(id)}`
  const options = (token, method = 'GET', data) => ({ method, headers: withAuthHeaders(token), onlineOnly: true,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  return {
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
    catalogSearch: (provider, token, query = {}, signal) => request(`/studio/catalog/${encodeURIComponent(provider)}/search${toQueryString(query)}`, { ...options(token), signal }),
    catalogDetails: (provider, id, token, signal) => request(`/studio/catalog/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`, { ...options(token), signal }),
    catalogThumbnail: (provider, id, token, signal) => requestBlob(`/studio/catalog/${encodeURIComponent(provider)}/${encodeURIComponent(id)}/thumbnail`, { ...options(token), signal }),
    catalogImport: (provider, id, designId, token) => request(`/studio/catalog/${encodeURIComponent(provider)}/${encodeURIComponent(id)}/import`, options(token, 'POST', { designId })),
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
    getDesign: (id, token) => request(path(id), options(token)),
    createDesign: (data, token) => request('/studio/designs', options(token, 'POST', data)),
    updateDesign: (id, data, token) => request(path(id), options(token, 'PUT', data)),
    applyChanges: (id, data, token) => request(`${path(id)}/changes`, options(token, 'POST', data)),
    changeReceipt: (id, batch, token) => request(`${path(id)}/changes?${new URLSearchParams({clientId:batch.clientId,batchId:String(batch.batchId)})}`, options(token)),
    collaborators: (id, token) => request(`${path(id)}/collaborators`, options(token)),
    candidates: (id, token, q = '') => request(`${path(id)}/candidates${toQueryString({ q })}`, options(token)),
    share: (id, data, token) => request(`${path(id)}/collaborators`, options(token, 'PUT', data)),
    assetUrl: (id, fileId, token) => request(`${path(id)}/assets/${encodeURIComponent(fileId)}/signed-url`, options(token)),
    live: (id, data, token) => request(`${path(id)}/live`, options(token, 'POST', data)),
  }
}
