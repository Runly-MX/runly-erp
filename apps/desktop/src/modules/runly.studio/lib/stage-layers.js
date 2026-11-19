// One description of a slide-change layer (transitionAt) for every surface: CSS for the
// player and the transition preview, canvas drawing for video export and recording.
export const REST_LAYER = Object.freeze({ opacity: 1, dx: 0, dy: 0, scale: 1 })

const percent = value => `${Math.round(value * 1e4) / 100}%`
// Translate by a fraction of the slide, scale around its centre, clip by fractions of its size.
export function layerStyle(layer) {
  const style = { opacity: layer.opacity, transform: `translate(${percent(layer.dx)}, ${percent(layer.dy)}) scale(${layer.scale})` }
  const c = layer.clip
  if (c) style.clipPath = `inset(${percent(c.top)} ${percent(c.right)} ${percent(c.bottom)} ${percent(c.left)})`
  return style
}

// Back-to-front order of the two layers of a transition.
export const layerOrder = front => (front === 'outgoing' ? ['incoming', 'outgoing'] : ['outgoing', 'incoming'])

// Same transform as layerStyle on a canvas; box is where the slide sits at rest.
export function drawLayer(ctx, source, box, layer) {
  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.translate(box.x + box.width / 2 + layer.dx * box.width, box.y + box.height / 2 + layer.dy * box.height)
  ctx.scale(layer.scale, layer.scale)
  const c = layer.clip
  if (c) {
    ctx.beginPath()
    ctx.rect(-box.width / 2 + c.left * box.width, -box.height / 2 + c.top * box.height, Math.max(0, box.width * (1 - c.left - c.right)), Math.max(0, box.height * (1 - c.top - c.bottom)))
    ctx.clip()
  }
  ctx.drawImage(source, -box.width / 2, -box.height / 2, box.width, box.height)
  ctx.restore()
}
