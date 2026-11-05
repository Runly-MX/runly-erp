export function createWebsiteDomain({ request, withAuthHeaders }) {
  return {
    listSiteCatalogProducts:(siteId,options,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/catalog/products?${new URLSearchParams(options??{})}`,{headers:withAuthHeaders(token)}),
    setSiteCatalogProduct:(siteId,productId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/catalog/products/${encodeURIComponent(productId)}`,{method:'PUT',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    setSiteCatalogSelection:(siteId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/catalog/selection`,{method:'PUT',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    getCatalogProductUsage:(siteId,productId,options,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/catalog/products/${encodeURIComponent(productId)}/used-by?${new URLSearchParams(options??{})}`,{headers:withAuthHeaders(token)}),
    applySiteTemplate:(siteId,templateId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/templates/${encodeURIComponent(templateId)}/apply`,{method:'POST',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    getSiteState:(siteId,token)=>request('/website/sites/'+encodeURIComponent(siteId)+'/state',{headers:withAuthHeaders(token)}),
    getPublicationIntegrity:(siteId,token)=>request('/website/sites/'+encodeURIComponent(siteId)+'/publication/integrity',{headers:withAuthHeaders(token)}),
    preflightRelease:(siteId,data,token)=>request('/website/sites/'+encodeURIComponent(siteId)+'/releases/preflight',{method:'POST',headers:withAuthHeaders(token),body:JSON.stringify(data)}),
    getAccountSettings:(siteId,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/account-settings`,{headers:withAuthHeaders(token)}),
    updateAccountSettings:(siteId,data,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/account-settings`,{method:'PUT',headers:withAuthHeaders(token),body:JSON.stringify(data)}),
    listAccounts:(siteId,options,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/accounts?${new URLSearchParams(options??{})}`,{headers:withAuthHeaders(token)}),
    setAccountStatus:(siteId,accountId,status,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/accounts/${encodeURIComponent(accountId)}`,{method:'PATCH',headers:withAuthHeaders(token),body:JSON.stringify({status})}),
    revokeAccountSessions:(siteId,accountId,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/accounts/${encodeURIComponent(accountId)}/revoke-sessions`,{method:'POST',headers:withAuthHeaders(token)}),
    listSiteForms:(siteId,token)=>request('/website/sites/'+encodeURIComponent(siteId)+'/forms',{headers:withAuthHeaders(token)}),
    resolveFormScope:(siteId,formId,data,token)=>request('/website/sites/'+encodeURIComponent(siteId)+'/forms/'+encodeURIComponent(formId)+'/scope',{method:'POST',headers:withAuthHeaders(token),body:JSON.stringify(data)}),
    createImport:(siteId,file,options,key,token)=>{const body=new FormData();body.append('file',file);body.append('routingMode',options?.routingMode??'mpa');if(options?.rootDirectory)body.append('rootDirectory',options.rootDirectory);return request(`/website/sites/${encodeURIComponent(siteId)}/imports`,{method:'POST',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body})},
    getImport:(siteId,importId,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/imports/${encodeURIComponent(importId)}`,{headers:withAuthHeaders(token)}),
    createPreview:(siteId,data,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/previews`,{method:'POST',headers:withAuthHeaders(token),body:JSON.stringify(data)}),
    revokePreview:(siteId,previewId,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/previews/${encodeURIComponent(previewId)}`,{method:'DELETE',headers:withAuthHeaders(token)}),
    listReleases: (siteId,token,options={})=>request(`/website/sites/${encodeURIComponent(siteId)}/releases?${new URLSearchParams(Object.entries(options).filter(([key,value])=>['cursor','limit'].includes(key)&&value!==undefined))}`,{headers:withAuthHeaders(token)}),
    getRelease: (siteId,releaseId,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/releases/${encodeURIComponent(releaseId)}`,{headers:withAuthHeaders(token)}),
    listDomains: (siteId,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/domains`,{headers:withAuthHeaders(token)}),
    prepareRelease: (siteId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/releases`,{method:'POST',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    activateRelease: (siteId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/publication/activate`,{method:'POST',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    rollbackRelease: (siteId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/publication/rollback`,{method:'POST',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    unpublishSite: (siteId,data,key,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/publication/unpublish`,{method:'POST',headers:{...withAuthHeaders(token),'Idempotency-Key':key},body:JSON.stringify(data)}),
    reserveHostname: (siteId,slug,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/domains`,{method:'POST',headers:withAuthHeaders(token),body:JSON.stringify({slug})}),
    hostnameAvailability: (siteId,slug,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/domains/availability?slug=${encodeURIComponent(slug)}`,{headers:withAuthHeaders(token)}),
    hostnameStatus: (siteId,hostname,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/domains/${encodeURIComponent(hostname)}`,{headers:withAuthHeaders(token)}),
    activateHostname: (siteId,hostname,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/domains/${encodeURIComponent(hostname)}/activate`,{method:'POST',headers:withAuthHeaders(token)}),
    releaseHostname: (siteId,hostname,token)=>request(`/website/sites/${encodeURIComponent(siteId)}/domains/${encodeURIComponent(hostname)}/release`,{method:'POST',headers:withAuthHeaders(token)}),
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
