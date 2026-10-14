// runly.inventory custody records (resguardos) and document templates
// (spec 2026-10-13-inventory-custody-design §5). Raw responses are returned;
// the desktop normalizes them in modules/runly.inventory/lib/custody-api.js.
const id = (value) => encodeURIComponent(value)

export function createInventoryCustodyDomain({ request, requestBlob, withAuthHeaders, toQueryString }) {
  const send = (method, path, data, token) => request(path, {
    method,
    headers: withAuthHeaders(token),
    onlineOnly: method !== 'GET',
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  return {
    custodies: {
      list: (params, token) => send('GET', `/inventory/custodies${toQueryString(params)}`, undefined, token),
      get: (custodyId, token) => send('GET', `/inventory/custodies/${id(custodyId)}`, undefined, token),
      // Users who can appear as deliverer ({ users }); only the caller without deliver_on_behalf.
      deliverers: (token) => send('GET', '/inventory/custodies/deliverers', undefined, token),
      create: (data, token) => send('POST', '/inventory/custodies', data, token),
      update: (custodyId, data, token) => send('PATCH', `/inventory/custodies/${id(custodyId)}`, data, token),
      // { role, pngBase64 } draws a signature; { role: 'deliverer', useSaved: true } applies the saved one.
      sign: (custodyId, { role, pngBase64, useSaved }, token) => send('POST', `/inventory/custodies/${id(custodyId)}/signatures`,
        useSaved ? { role, useSaved: true } : { role, pngBase64 }, token),
      publicLink: (custodyId, options, token) => send('POST', `/inventory/custodies/${id(custodyId)}/public-link`,
        options?.sendEmail ? { sendEmail: true } : {}, token),
      complete: (custodyId, data, token) => send('POST', `/inventory/custodies/${id(custodyId)}/complete`, data ?? {}, token),
      cancel: (custodyId, reason, token) => send('POST', `/inventory/custodies/${id(custodyId)}/cancel`, { reason }, token),
      document: (custodyId, token) => send('GET', `/inventory/custodies/${id(custodyId)}/document`, undefined, token),
      // Returns the rendered file itself (PDF, or DOCX/XLSX when Office is off).
      preview: (custodyId, token) => requestBlob(`/inventory/custodies/${id(custodyId)}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuthHeaders(token) },
        body: '{}',
      }),
    },
    documentTemplates: {
      list: (params, token) => send('GET', `/inventory/document-templates${toQueryString(params)}`, undefined, token),
      // formData: file, name, format (docx|xlsx), isDefault.
      upload: (formData, token) => request('/inventory/document-templates', {
        method: 'POST',
        headers: withAuthHeaders(token),
        body: formData,
        onlineOnly: true,
      }),
      // formData: file. Keeps the template id, name and default flag.
      replaceFile: (templateId, formData, token) => request(`/inventory/document-templates/${id(templateId)}/file`, {
        method: 'PUT',
        headers: withAuthHeaders(token),
        body: formData,
        onlineOnly: true,
      }),
      // Signed URL of the current .docx/.xlsx ({ url, expiresIn, fileName }).
      fileUrl: (templateId, token) => send('GET', `/inventory/document-templates/${id(templateId)}/file`, undefined, token),
      // Built-in example .docx with every tag (blob).
      sample: (token) => requestBlob('/inventory/document-templates/sample', { headers: withAuthHeaders(token) }),
      update: (templateId, data, token) => send('PATCH', `/inventory/document-templates/${id(templateId)}`, data, token),
      remove: (templateId, token) => send('DELETE', `/inventory/document-templates/${id(templateId)}`, undefined, token),
    },
    // No auth: the token in the link is the credential.
    publicCustody: {
      get: (token) => request(`/public/inventory/custody/${id(token)}`),
      sign: (token, pngBase64) => request(`/public/inventory/custody/${id(token)}/sign`, {
        method: 'POST',
        body: JSON.stringify({ pngBase64 }),
        onlineOnly: true,
      }),
    },
  }
}
