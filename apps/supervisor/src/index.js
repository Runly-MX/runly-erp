// Entry point of the execution supervisor (experimental). Configuration comes
// only from its own environment; it never receives Runly's database URL or
// service keys. Bind it to the internal network shared with the API only.
import { createSupervisor } from './supervisor.js'

const required = (name) => { const v = process.env[name]; if (!v) { console.error(`${name} is required`); process.exit(2) } return v }
const supervisor = await createSupervisor({
  secret: required('RUNLY_SUPERVISOR_SECRET'),
  modulesDir: required('RUNLY_SECURE_RUNTIME_MODULES_DIR'),
  stateDir: process.env.RUNLY_SUPERVISOR_STATE_DIR ?? '/var/lib/runly-supervisor',
  gatewayPort: Number(required('RUNLY_GATEWAY_PORT')),
  gatewayHost: process.env.RUNLY_GATEWAY_HOST ?? 'runly-api',
  maxConcurrent: Number(process.env.RUNLY_SUPERVISOR_MAX_CONCURRENT ?? 4),
  maxQueue: Number(process.env.RUNLY_SUPERVISOR_MAX_QUEUE ?? 8),
})
const port = await supervisor.listen(Number(process.env.RUNLY_SUPERVISOR_PORT ?? 4020), process.env.RUNLY_SUPERVISOR_BIND ?? '127.0.0.1')
console.log(`[supervisor] listening on ${port}`)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => supervisor.close().finally(() => process.exit(0)))
