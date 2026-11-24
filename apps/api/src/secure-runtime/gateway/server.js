// Internal HTTP listener for the Capability Gateway. Bind it to an address
// reachable only from the runner network (never the public port).
//   POST /v1/call  Authorization: Module <call token>
//                  X-Runly-Call-Nonce: <single use>
//                  Idempotency-Key: <writes>
//                  { "operation": "records.list", "args": { ... } }
import http from 'node:http'
import { GatewayError, PROTOCOL_VERSION } from '../protocol.js'

const MAX_BODY = 32 * 1024

export function startGatewayServer({ gateway, host = '127.0.0.1', port = 0 }) {
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'x-runly-protocol': PROTOCOL_VERSION, 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    try {
      if (req.method !== 'POST' || req.url !== '/v1/call') return reply(404, { error: 'NOT_FOUND' })
      const auth = String(req.headers.authorization ?? '')
      if (!auth.startsWith('Module ')) throw new GatewayError('CONTEXT_INVALID', 'Falta el token del módulo.', 401)
      let size = 0
      const chunks = []
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new GatewayError('PAYLOAD_TOO_LARGE', 'Solicitud demasiado grande.', 413); chunks.push(chunk) }
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new GatewayError('INVALID_ARGS', 'JSON inválido.', 400) }
      if (!body || typeof body.operation !== 'string') throw new GatewayError('INVALID_ARGS', 'Falta la operación.', 400)
      const result = await gateway.call({ operation: body.operation, token: auth.slice(7), nonce: req.headers['x-runly-call-nonce'], idempotencyKey: req.headers['idempotency-key'] ?? null, args: body.args })
      reply(200, result)
    } catch (error) {
      const e = error instanceof GatewayError ? error : new GatewayError('CAPABILITY_FAILED', 'La operación falló.', 500)
      reply(e.status, { error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) })
    }
  })
  server.headersTimeout = 5000
  server.requestTimeout = 10_000
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) })))
}
