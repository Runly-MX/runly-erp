// Turns whatever logo the person uploads into something a page can load fast and the publisher accepts.
// Releases only pin png/jpeg/webp/gif/avif (never SVG), and the biggest navbar logo is 64px tall, so a logo is
// stored at most 128px tall (2x for dense screens) and 512px wide, with empty margins trimmed.
export const LOGO_MAX_HEIGHT = 128
export const LOGO_MAX_WIDTH = 512
const ALPHA_THRESHOLD = 8

// Bounding box of the pixels that are not (nearly) transparent. `data` is RGBA. Null when nothing is visible.
export function visibleBounds(data, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// Target size: fit inside the box without ever enlarging a raster; vector sources scale up to the box height.
export function fitSize(width, height, { vector = false } = {}) {
  const scale = Math.min(LOGO_MAX_WIDTH / width, LOGO_MAX_HEIGHT / height, vector ? Infinity : 1)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')) }
    image.src = url
  })
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality))

export async function optimizeLogo(file) {
  const vector = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
  const image = await loadImage(file)
  // SVGs without intrinsic size report 0: give them a sensible box.
  const naturalW = image.naturalWidth || 512
  const naturalH = image.naturalHeight || 128
  const { width, height } = fitSize(naturalW, naturalH, { vector })

  const work = document.createElement('canvas')
  work.width = width; work.height = height
  const ctx = work.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)

  const bounds = visibleBounds(ctx.getImageData(0, 0, width, height).data, width, height) ?? { x: 0, y: 0, width, height }
  const trimmed = bounds.width !== width || bounds.height !== height
  // Trimming can leave a small crop: bring it back to the box height so it stays crisp.
  const out = fitSize(bounds.width, bounds.height, { vector: true })
  const finalSize = vector || trimmed ? out : { width: bounds.width, height: bounds.height }

  const canvas = document.createElement('canvas')
  canvas.width = finalSize.width; canvas.height = finalSize.height
  const target = canvas.getContext('2d')
  target.imageSmoothingQuality = 'high'
  // Redraw from the source so enlarging after a trim does not blur an already-reduced bitmap.
  const ratio = naturalW / width
  target.drawImage(image, bounds.x * ratio, bounds.y * ratio, bounds.width * ratio, bounds.height * ratio, 0, 0, finalSize.width, finalSize.height)

  let blob = await toBlob(canvas, 'image/webp', 0.92)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png')
  const format = blob.type === 'image/webp' ? 'webp' : 'png'
  // A raster that was already small and tight stays as it came.
  if (!vector && !trimmed && blob.size >= file.size && /^image\/(?:png|jpeg|webp)$/.test(file.type)) {
    return { file, width: naturalW, height: naturalH, before: file.size, after: file.size, format: file.type.split('/')[1], trimmed: false, vector: false }
  }
  const optimized = new File([blob], `logo.${format}`, { type: blob.type })
  return { file: optimized, width: finalSize.width, height: finalSize.height, before: file.size, after: blob.size, format, trimmed, vector }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
