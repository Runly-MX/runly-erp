// Image layers ("Imagen" tool): pictures placed on top of the edited image.
// Coordinates are in the pixel space of the picture being edited.
//
//   { id, img, src, x, y, w, h, rot, flipX, opacity }   (x, y = center; rot in degrees)

let counter = 0;

// Places `img` at the center, covering at most `fraction` of the picture's width/height.
export function newLayer(img, src, picture, fraction = 0.4) {
  const k = Math.min((picture.w * fraction) / img.naturalWidth, (picture.h * fraction) / img.naturalHeight);
  return {
    id: `layer-${Date.now()}-${counter++}`,
    img,
    src,
    x: picture.w / 2,
    y: picture.h / 2,
    w: img.naturalWidth * k,
    h: img.naturalHeight * k,
    rot: 0,
    flipX: false,
    opacity: 1,
  };
}

export function drawLayers(ctx, layers) {
  for (const l of layers) {
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.translate(l.x, l.y);
    ctx.rotate((l.rot * Math.PI) / 180);
    ctx.scale(l.flipX ? -1 : 1, 1);
    ctx.drawImage(l.img, -l.w / 2, -l.h / 2, l.w, l.h);
    ctx.restore();
  }
}

export function scaleLayer(layer, factor, min = 24) {
  const k = Math.max(min / Math.min(layer.w, layer.h), factor);
  return { ...layer, w: layer.w * k, h: layer.h * k };
}

// Resize by dragging the corner handle: the half-diagonal follows the pointer,
// keeping the aspect ratio.
export function resizeLayerToPoint(layer, point) {
  const dist = Math.hypot(point[0] - layer.x, point[1] - layer.y);
  const half = Math.hypot(layer.w, layer.h) / 2;
  return half > 0 ? scaleLayer(layer, dist / half) : layer;
}

export function rotateLayerToPoint(layer, point) {
  const angle = (Math.atan2(point[1] - layer.y, point[0] - layer.x) * 180) / Math.PI + 90;
  return { ...layer, rot: Math.round(angle) };
}

export function moveLayer(layer, dx, dy, bounds) {
  return {
    ...layer,
    x: Math.min(bounds.w, Math.max(0, layer.x + dx)),
    y: Math.min(bounds.h, Math.max(0, layer.y + dy)),
  };
}
