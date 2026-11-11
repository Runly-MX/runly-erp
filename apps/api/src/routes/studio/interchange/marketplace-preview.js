import { inspectNativePackage } from './package.js'

const IMAGE_MAX = 600_000, TOTAL_MAX = 1_500_000
const dataUri = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`

// Card thumbnail of a verified package: its own PNG when it ships one, otherwise the declarative first page
// plus the few images that page uses, all as data: URIs (the desktop CSP allows nothing else). Never throws:
// a package that cannot be read simply has no preview.
export async function buildPreview(bytes) {
  try {
    const { manifest, files, report } = await inspectNativePackage(bytes)
    let budget = TOTAL_MAX
    const fit = buffer => (buffer && buffer.length <= IMAGE_MAX && buffer.length <= budget ? (budget -= buffer.length, buffer) : null)
    const shipped = manifest.previews[0] ? fit(files.get(manifest.previews[0].path)) : null
    if (shipped) return { png: dataUri('image/png', shipped), document: null, images: {} }
    const images = {}
    const ids = new Set((report.preview?.objects ?? []).map(o => o.fileAssetId ?? o.fillPaint?.fileAssetId).filter(Boolean))
    for (const id of [...ids].slice(0, 8)) {
      const resource = manifest.resources.find(r => r.id === id), buffer = resource ? fit(files.get(resource.path)) : null
      if (buffer) images[id] = dataUri(resource.mime, buffer)
    }
    return { png: null, document: report.preview ?? null, images }
  } catch { return { png: null, document: null, images: {} } }
}
