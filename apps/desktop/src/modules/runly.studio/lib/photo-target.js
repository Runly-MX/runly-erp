import { photoFileId, supportsPhotoFill, SHAPE_TYPES } from '../../../../../shared/studio/shape-properties.js'

// A selection that shows a photo: a photo frame (type image) or a shape with a
// photo fill (v5 fillPaint). `shape` tells the UI which controls apply: masks,
// frame borders and frame radius belong to images; shapes use their own style.
export function photoOf(item) {
  const fileId = item ? photoFileId(item) : null
  if (!fileId) return null
  return { fileId, image: item.type === 'image' ? item.image ?? {} : item.fillPaint.image, shape: item.type !== 'image' }
}

export const isShape = item => Boolean(item && SHAPE_TYPES.includes(item.type))

// Shapes whose geometry can clip a photo (rectangles, ellipses, single closed vector paths).
export const canHoldPhoto = item => Boolean(item && isShape(item) && supportsPhotoFill(item))
