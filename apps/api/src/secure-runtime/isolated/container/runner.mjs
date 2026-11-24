// Runs INSIDE the isolated container (trusted Runly code, mounted read-only).
// Loads one module handler from /ext and gives it only a capability client:
// no Prisma, no database URL, no host secrets, no filesystem beyond /ext (ro)
// and /tmp (tmpfs). The call token, gateway address and input arrive on
// stdin (not in the environment, which stays readable in /proc/self/environ).
// The handler's result goes to stdout as one tagged line.
//   handler: export default async ({ input, capabilities }) => result
import { randomUUID } from 'node:crypto'

const emit = (tag, value) => process.stdout.write(`\n${tag}${JSON.stringify(value)}\n`)

async function readJob() {
  const chunks = []
  let size = 0
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 64 * 1024) throw Object.assign(new Error('job too large'), { code: 'JOB_INVALID' }); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

try {
  const handlerPath = process.argv[2]
  if (!/^\/ext\/backend\/[a-z0-9_-]+\.mjs$/.test(handlerPath ?? '')) throw Object.assign(new Error('handler path rejected'), { code: 'HANDLER_INVALID' })
  const { gatewayUrl, token, input } = await readJob()
  const capabilities = Object.freeze({
    async call(operation, args) {
      const res = await fetch(`${gatewayUrl}/v1/call`, {
        method: 'POST',
        headers: { authorization: `Module ${token}`, 'content-type': 'application/json', 'x-runly-call-nonce': randomUUID().replaceAll('-', ''), 'idempotency-key': randomUUID().replaceAll('-', '') },
        body: JSON.stringify({ operation, args }),
        signal: AbortSignal.timeout(5000),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw Object.assign(new Error(body.message ?? 'capability error'), { code: body.error ?? 'CAPABILITY_FAILED' })
      return body.data
    },
  })
  const mod = await import(handlerPath)
  const result = await mod.default({ input: input ?? {}, capabilities })
  emit('RUNLY_RESULT:', result ?? null)
  process.exit(0)
} catch (error) {
  emit('RUNLY_ERROR:', { code: error?.code ?? 'HANDLER_FAILED', message: String(error?.message ?? error).slice(0, 300) })
  process.exit(1)
}
