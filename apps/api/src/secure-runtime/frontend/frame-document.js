// Frame document for an isolated custom component (experimental).
// Inline bootstrap + inline component source, allowed only by their SHA-256
// hashes. CSP sandbox gives the document an opaque origin even if it is opened
// outside the host iframe; connect/frame/form/navigation sinks are closed.
import { createHash } from 'node:crypto'

const BOOTSTRAP = `(() => {
  const PROTOCOL = 'runly.frame/v1'
  let port = null, seq = 0
  const pending = new Map()
  const call = (op, args = {}) => new Promise((resolve, reject) => {
    if (!port) return reject(Object.assign(new Error('not connected'), { code: 'FRAME_NOT_CONNECTED' }))
    const id = String(++seq)
    pending.set(id, { resolve, reject })
    port.postMessage({ v: PROTOCOL, id, op, args })
  })
  window.addEventListener('message', (event) => {
    if (port || event.source !== window.parent || !event.data || event.data.v !== PROTOCOL || event.data.type !== 'init' || event.ports.length !== 1) return
    port = event.ports[0]
    port.onmessage = ({ data }) => {
      const p = pending.get(data && data.id); if (!p) return
      pending.delete(data.id)
      if (data.ok) p.resolve(data.data); else p.reject(Object.assign(new Error((data.error && data.error.code) || 'error'), { code: data.error && data.error.code }))
    }
    Object.defineProperty(window, 'runly', { value: Object.freeze({ call }), configurable: false })
    window.dispatchEvent(new Event('runly:ready'))
  })
})()`

const sha = (source) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`
const escapeAttr = (value) => String(value).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c])

// componentSource: the module's frontend entry (trusted package bytes).
// frameAncestors: exact host origins allowed to embed it (app web, PWA, Tauri).
export function renderIsolatedFrame({ componentSource, title = 'Componente', frameAncestors }) {
  if (typeof componentSource !== 'string' || componentSource.length > 256 * 1024 || /<\/script/i.test(componentSource)) throw Object.assign(new Error('Componente no válido.'), { code: 'COMPONENT_INVALID' })
  if (!Array.isArray(frameAncestors) || !frameAncestors.length || frameAncestors.some((o) => !/^(https?|tauri):\/\/[a-z0-9.-]+(:\d+)?$/i.test(o))) throw Object.assign(new Error('Orígenes de host no válidos.'), { code: 'FRAME_ANCESTORS_INVALID' })
  const csp = [
    "default-src 'none'",
    `script-src ${sha(BOOTSTRAP)} ${sha(componentSource)}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "font-src 'none'", "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "object-src 'none'", "media-src 'none'",
    "form-action 'none'", "base-uri 'none'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    'sandbox allow-scripts',
  ].join('; ')
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeAttr(title)}</title></head><body><div id="root"></div><script>${BOOTSTRAP}</script><script>${componentSource}</script></body></html>`
  return {
    html,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': csp,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()',
      'cache-control': 'no-store',
    },
  }
}
