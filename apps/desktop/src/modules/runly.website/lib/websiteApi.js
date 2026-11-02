import { companyFetch } from '../../../lib/companyFetch.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'

// Normalized error for every Website call. Backend answers either
// `{ error: { code, message, fields } }` (v1 envelope) or the legacy
// `{ error: 'message', code }`; both end up here with a stable `code`.
export class WebsiteApiError extends Error {
  constructor({ status, code, message, fields, requestId, retryable }) {
    super(message || code || `HTTP ${status}`)
    this.name = 'WebsiteApiError'
    this.status = status
    this.code = code || null
    this.fields = fields || null
    this.requestId = requestId || null
    this.retryable = Boolean(retryable)
  }
}

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`
}

function parseError(status, body, headers) {
  const raw = body?.error
  const nested = raw && typeof raw === 'object' ? raw : null
  return new WebsiteApiError({
    status,
    code: nested?.code ?? body?.code ?? null,
    message: nested?.message ?? (typeof raw === 'string' ? raw : undefined),
    fields: nested?.fields ?? body?.fields ?? null,
    requestId: nested?.requestId ?? headers?.get?.('x-request-id') ?? null,
    retryable: nested?.retryable ?? status >= 500,
  })
}

export async function websiteFetch(path, token, { method = 'GET', body, idempotencyKey, signal, formData } = {}) {
  const headers = { Authorization: `Bearer ${token}` }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await companyFetch(`${getApiUrl()}${path}`, {
      method,
      headers,
      signal,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new WebsiteApiError({ status: 0, code: 'network', message: 'Sin conexion', retryable: true })
  }
  if (res.status === 204) return null
  let json = null
  try { json = await res.json() } catch { json = null }
  if (!res.ok) throw parseError(res.status, json, res.headers)
  return json
}

const s = encodeURIComponent
const site = (siteId) => `/website/sites/${s(siteId)}`

// Thin, explicit wrappers over the S1-S4 contracts. No business rule lives here.
export function createWebsiteApi(token) {
  const call = (path, options) => websiteFetch(path, token, options)
  return {
    listSites: (o) => call('/website/sites', o),
    getSite: (siteId, o) => call(site(siteId), o),
    createSite: (data, idempotencyKey) => call('/website/sites', { method: 'POST', body: data, idempotencyKey }),
    saveIdentity: (siteId, identity, expectedRevision, idempotencyKey) =>
      call(site(siteId), { method: 'PATCH', body: { identity, expectedRevision }, idempotencyKey }),
    // Legacy PATCH (site.update): used only for non-draft settings such as antispam/SMTP.
    archiveSite: (siteId) => call(`/website/site/${s(siteId)}`, { method: 'DELETE' }),
    listPages: (siteId, o) => call(`${site(siteId)}/pages`, o),
    createPage: (siteId, data, idempotencyKey) => call(`${site(siteId)}/pages`, { method: 'POST', body: data, idempotencyKey }),
    getDraft: (siteId, pageId, o) => call(`${site(siteId)}/pages/${s(pageId)}/draft`, o),
    saveDraft: (siteId, pageId, data, idempotencyKey) =>
      call(`${site(siteId)}/pages/${s(pageId)}/draft`, { method: 'PUT', body: data, idempotencyKey }),
    deletePage: (pageId) => call(`/website/pages/${s(pageId)}`, { method: 'DELETE' }),
    getTheme: (siteId, o) => call(`/website/theme?siteId=${s(siteId)}`, o),
    createTheme: (data) => call('/website/theme', { method: 'POST', body: data }),
    listReleases: (siteId, { limit = 25, cursor } = {}, o) =>
      call(`${site(siteId)}/releases?limit=${limit}${cursor ? `&cursor=${s(cursor)}` : ''}`, o),
    getRelease: (siteId, releaseId, o) => call(`${site(siteId)}/releases/${s(releaseId)}`, o),
    prepareRelease: (siteId, data, idempotencyKey) => call(`${site(siteId)}/releases`, { method: 'POST', body: data, idempotencyKey }),
    activateRelease: (siteId, data, idempotencyKey) => call(`${site(siteId)}/publication/activate`, { method: 'POST', body: data, idempotencyKey }),
    rollbackRelease: (siteId, data, idempotencyKey) => call(`${site(siteId)}/publication/rollback`, { method: 'POST', body: data, idempotencyKey }),
    unpublishSite: (siteId, data, idempotencyKey) => call(`${site(siteId)}/publication/unpublish`, { method: 'POST', body: data, idempotencyKey }),
    listDomains: (siteId, o) => call(`${site(siteId)}/domains`, o),
    reserveHostname: (siteId, slug) => call(`${site(siteId)}/domains`, { method: 'POST', body: { slug } }),
    createPreview: (siteId, data, idempotencyKey) => call(`${site(siteId)}/previews`, { method: 'POST', body: data, idempotencyKey }),
    revokePreview: (siteId, previewId) => call(`${site(siteId)}/previews/${s(previewId)}`, { method: 'DELETE' }),
    createImport: (siteId, file, { routingMode = 'mpa', rootDirectory } = {}, idempotencyKey) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('routingMode', routingMode)
      if (rootDirectory) formData.append('rootDirectory', rootDirectory)
      return call(`${site(siteId)}/imports`, { method: 'POST', formData, idempotencyKey })
    },
    getImport: (siteId, importId, o) => call(`${site(siteId)}/imports/${s(importId)}`, o),
    getLegacyPage: (pageId, o) => call(`/website/pages/${s(pageId)}`, o),
    companyBranding: (o) => call('/company/branding', o),
  }
}
