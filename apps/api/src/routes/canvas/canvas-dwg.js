// DWG -> DXF conversion proxy for Canvas plans (view only). The binary DWG is
// forwarded to the internal `runly-dwg` container (apps/dwg/main.py, LibreDWG);
// the DXF text goes back to the browser, which rasterizes it with the same
// pipeline as a hand-uploaded DXF. Nothing is persisted here.
//
// Optional infra, same shape as MIRAI_TTS_URL: DWG_CONVERTER_URL unset => 503
// and the UI explains it. Any service honoring `POST /convert` (DWG bytes in,
// DXF text out) can be pointed at.
export const DWG_MAX_BYTES = 50 * 1024 * 1024
const TIMEOUT_MS = 90_000
const fail = (message, status) => Object.assign(new Error(message), { status })

// Every DWG begins with its version tag: AC1015, AC1018, AC1032...
export const isDwgBuffer = (buffer) => buffer.length > 6 && /^AC10\d\d/.test(buffer.subarray(0, 6).toString('latin1'))

export function createDwgConverter({ env = process.env, fetchImpl = fetch } = {}) {
  const baseUrl = (env.DWG_CONVERTER_URL || '').replace(/\/+$/, '')

  const isConfigured = () => Boolean(baseUrl)

  async function convert(buffer) {
    if (!isConfigured()) throw fail('La conversión de DWG no está habilitada en esta instancia. Exporta el plano a DXF.', 503)
    if (buffer.length > DWG_MAX_BYTES) throw fail('El DWG supera el límite de 50 MB.', 413)
    if (!isDwgBuffer(buffer)) throw fail('El archivo no es un DWG compatible. Exporta el plano a DXF.', 422)
    let response
    try {
      response = await fetchImpl(`${baseUrl}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: buffer,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw fail('No se pudo convertir el DWG, intenta de nuevo.', 502)
    }
    if (response.status === 400 || response.status === 422) throw fail('El archivo no es un DWG compatible. Exporta el plano a DXF.', 422)
    if (response.status === 413) throw fail('El DWG supera el límite de 50 MB.', 413)
    if (!response.ok) throw fail('No se pudo convertir el DWG, intenta de nuevo.', 502)
    return response.text()
  }

  return { isConfigured, convert }
}
