// Raw fetch helper for attendance endpoints the SDK does not cover (multipart
// upload, blob download). JSON and FormData bodies; `blob: true` returns a Blob.
export async function attendanceRequest({ apiBaseUrl, token, companyId, path, body, method, blob = false, signal }) {
  const form = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(companyId ? { 'X-Runly-Company-Id': companyId } : {}),
      ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
  })
  if (blob && response.ok) return response.blob()
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo completar la operación.')
    error.status = response.status
    throw error
  }
  return payload.data
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
