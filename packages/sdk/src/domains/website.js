export function createWebsiteDomain({ request, withAuthHeaders }) {
  return {
    listSites: token => request('/website/sites', { headers: withAuthHeaders(token) }),
    createSite: (data, idempotencyKey, token) => request('/website/sites', {
      method: 'POST', headers: { ...withAuthHeaders(token), 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(data),
    }),
    saveSiteDraft: (siteId, identity, expectedRevision, token, idempotencyKey) => request(`/website/sites/${encodeURIComponent(siteId)}`, {
      method: 'PATCH', headers: { ...withAuthHeaders(token), ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }) }, body: JSON.stringify({ identity, expectedRevision }),
    }),
    listPages: (siteId, token) => request(`/website/sites/${encodeURIComponent(siteId)}/pages`, { headers: withAuthHeaders(token) }),
    createPage: (siteId, data, idempotencyKey, token) => request(`/website/sites/${encodeURIComponent(siteId)}/pages`, {
      method: 'POST', headers: { ...withAuthHeaders(token), 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(data),
    }),
    getDraft: (siteId, pageId, token) => request(`/website/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}/draft`, { headers: withAuthHeaders(token) }),
    saveDraft: (siteId, pageId, data, token, idempotencyKey) => request(`/website/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}/draft`, {
      method: 'PUT', headers: { ...withAuthHeaders(token), ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }) }, body: JSON.stringify(data),
    }),
    getSite: (siteId, token) =>
      request(`/website/sites/${encodeURIComponent(siteId)}`, {
        headers: withAuthHeaders(token),
      }),
    updateSite: (siteId, data, token) =>
      request(`/website/sites/${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: withAuthHeaders(token),
        body: JSON.stringify(data),
      }),
    uploadDist: (siteId, file, token) => {
      const formData = new FormData();
      formData.append("file", file);
      return request(
        `/website/sites/${encodeURIComponent(siteId)}/dist/upload`,
        {
          method: "POST",
          headers: withAuthHeaders(token),
          body: formData,
        },
      );
    },
    deleteDist: (siteId, token) =>
      request(`/website/sites/${encodeURIComponent(siteId)}/dist`, {
        method: "DELETE",
        headers: withAuthHeaders(token),
      }),
  };
}
