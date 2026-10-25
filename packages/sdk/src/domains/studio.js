export function createStudioDomain({ request, withAuthHeaders, toQueryString }) {
  const path = id => `/studio/designs/${encodeURIComponent(id)}`
  const options = (token, method = 'GET', data) => ({ method, headers: withAuthHeaders(token), onlineOnly: true,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
  return {
    listDesigns: (token, query = {}) => request(`/studio/designs${toQueryString(query)}`, options(token)),
    getDesign: (id, token) => request(path(id), options(token)),
    createDesign: (data, token) => request('/studio/designs', options(token, 'POST', data)),
    updateDesign: (id, data, token) => request(path(id), options(token, 'PUT', data)),
  }
}
