// runly.inventory labels: templates, printers, render and print log
// (spec 2026-10-15-inventory-labels-qr-design, Phase 2). Raw responses are
// returned ({ data }); render returns the generated file as a Blob.
const id = (value) => encodeURIComponent(value)

export function createInventoryLabelsDomain({ request, requestBlob, withAuthHeaders }) {
  const send = (method, path, data, token) => request(path, {
    method,
    headers: withAuthHeaders(token),
    onlineOnly: method !== 'GET',
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  return {
    labels: {
      listTemplates: (token) => send('GET', '/inventory/label-templates', undefined, token),
      createTemplate: (data, token) => send('POST', '/inventory/label-templates', data, token),
      updateTemplate: (templateId, data, token) => send('PUT', `/inventory/label-templates/${id(templateId)}`, data, token),
      deleteTemplate: (templateId, token) => send('DELETE', `/inventory/label-templates/${id(templateId)}`, undefined, token),
      listPrinters: (token) => send('GET', '/inventory/label-printers', undefined, token),
      createPrinter: (data, token) => send('POST', '/inventory/label-printers', data, token),
      updatePrinter: (printerId, data, token) => send('PUT', `/inventory/label-printers/${id(printerId)}`, data, token),
      deletePrinter: (printerId, token) => send('DELETE', `/inventory/label-printers/${id(printerId)}`, undefined, token),
      // body: { items: [{ itemId, quantity }], templateId?, layout?, printerId?, format: 'zpl'|'pdf'|'png' } -> Blob
      render: (body, token) => requestBlob('/inventory/labels/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withAuthHeaders(token) },
        body: JSON.stringify(body),
      }),
      // body: { items: [{ itemId, quantity }], templateId?, printerId? } -> { data: { count, labels } }
      registerPrints: (body, token) => send('POST', '/inventory/labels/prints', body, token),
      itemHistory: (itemId, token) => send('GET', `/inventory/items/${id(itemId)}/labels`, undefined, token),
      // Public item link (QR target). Ensure creates the token lazily -> { data: { url } }.
      publicLink: (itemId, token) => send('GET', `/inventory/items/${id(itemId)}/public-link`, undefined, token),
      revokePublicLink: (itemId, token) => send('DELETE', `/inventory/items/${id(itemId)}/public-link`, undefined, token),
      revokeAllPublicLinks: (token) => send('POST', '/inventory/public-links/revoke-all', {}, token),
      getPublicSettings: (token) => send('GET', '/inventory/public-page-settings', undefined, token),
      updatePublicSettings: (data, token) => send('PUT', '/inventory/public-page-settings', data, token),
      // No auth: the opaque token in the QR link is the credential -> { item }.
      publicItem: (publicToken) => request(`/public/inventory/items/${id(publicToken)}`),
    },
  }
}
