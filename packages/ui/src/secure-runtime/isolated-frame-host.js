// Host side of an isolated custom component (experimental, F1B Stage 2).
//
// The component runs in an iframe with sandbox="allow-scripts" only, so it has
// an opaque origin: no access to Runly's DOM, cookies, localStorage,
// IndexedDB or session, and the frame document's CSP blocks network,
// navigation and forms. The only channel is a private MessageChannel port
// handed to that iframe's window after it loads; window-level postMessage is
// never trusted. Every request is checked against a strict schema, a size
// limit and the operations this component was granted; the host performs it
// with the user's own session (capabilities.call) and returns the result.
// revoke() closes the port, rejects pending calls and removes the iframe.
export const FRAME_PROTOCOL = 'runly.frame/v1'
const MAX_MESSAGE = 16 * 1024

export function mountIsolatedComponent({ container, src, title, capabilities, allowedOperations, maxCallsPerMinute = 60, onError = () => {} }) {
  const allowed = new Set(allowedOperations)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('referrerpolicy', 'no-referrer')
  iframe.setAttribute('allow', '')
  iframe.setAttribute('loading', 'lazy')
  iframe.title = title
  iframe.src = src
  iframe.style.cssText = 'border:0;width:100%;height:100%;display:block'
  let port = null
  let revoked = false
  let windowStart = 0, calls = 0
  const nonce = crypto.randomUUID()

  const reply = (id, ok, payload) => { if (!revoked) port?.postMessage({ v: FRAME_PROTOCOL, id, ok, ...(ok ? { data: payload } : { error: payload }) }) }

  async function onPortMessage(event) {
    const msg = event.data
    let size = 0
    try { size = JSON.stringify(msg).length } catch { size = Infinity }
    if (size > MAX_MESSAGE || !msg || msg.v !== FRAME_PROTOCOL || typeof msg.id !== 'string' || msg.id.length > 64 || typeof msg.op !== 'string' || (msg.args !== undefined && (typeof msg.args !== 'object' || Array.isArray(msg.args)))) {
      onError({ code: 'FRAME_MESSAGE_INVALID' })
      return
    }
    if (!allowed.has(msg.op)) return reply(msg.id, false, { code: 'CAPABILITY_DENIED' })
    const now = Date.now()
    if (now - windowStart >= 60_000) { windowStart = now; calls = 0 }
    if (++calls > maxCallsPerMinute) return reply(msg.id, false, { code: 'QUOTA_EXCEEDED' })
    try { reply(msg.id, true, await capabilities.call(msg.op, msg.args ?? {})) } catch (error) { reply(msg.id, false, { code: error?.code ?? 'CAPABILITY_FAILED' }) }
  }

  function onLoad() {
    if (revoked || port) return
    const channel = new MessageChannel()
    port = channel.port1
    port.onmessage = onPortMessage
    // Opaque-origin frame: target "*" is unavoidable, but the message goes only
    // to this iframe's window and carries nothing secret except the port.
    iframe.contentWindow.postMessage({ v: FRAME_PROTOCOL, type: 'init', nonce }, '*', [channel.port2])
  }
  iframe.addEventListener('load', onLoad, { once: true })
  container.appendChild(iframe)

  return {
    iframe,
    revoke() {
      if (revoked) return
      revoked = true
      port?.close()
      port = null
      iframe.removeEventListener('load', onLoad)
      iframe.src = 'about:blank'
      iframe.remove()
    },
    get revoked() { return revoked },
  }
}
