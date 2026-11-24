// Runs in the egress proxy container: the ONLY route out of the internal
// runner network. Forwards TCP from :8080 to one fixed target (the gateway);
// it accepts no target from clients, so runners cannot reach anything else.
import net from 'node:net'

const [host, port] = String(process.env.RUNLY_GATEWAY_TARGET ?? '').split(':')
if (!host || !/^\d+$/.test(port ?? '')) { console.error('RUNLY_GATEWAY_TARGET=host:port required'); process.exit(2) }
const MAX_CONNECTIONS = 256
let open = 0
net.createServer((client) => {
  if (++open > MAX_CONNECTIONS) { open--; client.destroy(); return }
  const upstream = net.connect(Number(port), host)
  const done = () => { client.destroy(); upstream.destroy() }
  client.setTimeout(15_000, done)
  client.on('close', () => { open--; upstream.destroy() })
  client.on('error', done); upstream.on('error', done)
  client.pipe(upstream).pipe(client)
}).listen(8080, '0.0.0.0', () => console.log('egress proxy ready'))
