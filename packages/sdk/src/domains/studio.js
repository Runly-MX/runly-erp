export function createStudioDomain({ request, requestBlob, withAuthHeaders, toQueryString }) {
  const path = id => `/studio/designs/${encodeURIComponent(id)}`
  const options = (token, method = 'GET', data) => ({ method, headers: withAuthHeaders(token), onlineOnly: true,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  return {
    resources: (token, query = {}, signal) => request(`/studio/resources${toQueryString(query)}`, { ...options(token), signal }),
    thumbnail: (id, token, signal) => requestBlob(`/studio/resources/${encodeURIComponent(id)}/thumbnail`, { ...options(token), signal }),
    listDesigns: (token, query = {}) => request(`/studio/designs${toQueryString(query)}`, options(token)),
    getDesign: (id, token) => request(path(id), options(token)),
    createDesign: (data, token) => request('/studio/designs', options(token, 'POST', data)),
    updateDesign: (id, data, token) => request(path(id), options(token, 'PUT', data)),
    collaborators: (id, token) => request(`${path(id)}/collaborators`, options(token)),
    candidates: (id, token, q = '') => request(`${path(id)}/candidates${toQueryString({ q })}`, options(token)),
    share: (id, data, token) => request(`${path(id)}/collaborators`, options(token, 'PUT', data)),
    assetUrl: (id, fileId, token) => request(`${path(id)}/assets/${encodeURIComponent(fileId)}/signed-url`, options(token)),
    live: (id, data, token) => request(`${path(id)}/live`, options(token, 'POST', data)),
  }
}
