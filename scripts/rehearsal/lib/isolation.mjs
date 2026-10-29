// Network isolation gate for a rehearsal replica. Nothing that runs Runly application code (API, Worker, jobs) may be
// started until a probe, run from INSIDE the network those services will use, shows that Internet, DNS, a simulated
// production service on the host and a simulated production container are all unreachable. The probe is also run on a
// normal network as a positive control, so "unreachable" cannot simply mean "the probe is broken".
import { createServer } from 'node:net'
import { command } from '../../fixtures/studio/supabase-stack.mjs'

const PROBE = `
const net = require('node:net'), dns = require('node:dns').promises
const targets = JSON.parse(process.env.PROBE_TARGETS)
const tcp = (host, port) => new Promise(resolve => {
  const socket = net.connect({ host, port, timeout: 3000 })
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('timeout', () => { socket.destroy(); resolve(false) })
  socket.once('error', () => resolve(false))
})
;(async () => {
  const out = {}
  out.internet = await fetch('https://example.com', { signal: AbortSignal.timeout(4000) }).then(() => true, () => false)
  out.dns = await dns.lookup('example.com').then(() => true, () => false)
  for (const target of targets) out[target.name] = await tcp(target.host, target.port)
  console.log(JSON.stringify(out))
})()
`

// Two stand-ins for "production": a TCP service on the host (what a LAN or the host itself would offer) and a container on
// an ordinary Docker network. Neither carries data; they only accept a connection.
export async function createProductionSimulator({ image, token }) {
  const hostServer = createServer(socket => socket.end('production'))
  await new Promise(resolve => hostServer.listen(0, '0.0.0.0', resolve))
  const hostPort = hostServer.address().port
  const network = `runly-prod-sim-${token}`, container = `runly-prod-sim-${token}`
  await command('docker', ['network', 'create', network])
  await command('docker', ['run', '-d', '--name', container, '--network', network, '--entrypoint', 'node', image, '-e',
    "require('node:net').createServer(socket => socket.end('production')).listen(9100, '0.0.0.0')"])
  let address = ''
  for (let attempt = 0; attempt < 20 && !address; attempt++) {
    address = (await command('docker', ['inspect', '--format', `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`, container])).trim()
    if (!address) await new Promise(resolve => setTimeout(resolve, 250))
  }
  return {
    network, hostPort, containerAddress: address,
    targets: [{ name: 'host-service', host: 'host.docker.internal', port: hostPort }, { name: 'production-container', host: address, port: 9100 }],
    async close() {
      await new Promise(resolve => hostServer.close(resolve))
      await command('docker', ['rm', '-f', container]).catch(() => {})
      await command('docker', ['network', 'rm', network]).catch(() => {})
    },
  }
}

export async function probeEgress({ image, network, simulator }) {
  const output = await command('docker', ['run', '--rm', '--network', network, '--add-host', 'host.docker.internal:host-gateway',
    '-e', `PROBE_TARGETS=${JSON.stringify(simulator.targets)}`, '--entrypoint', 'node', image, '-e', PROBE])
  return JSON.parse(output.trim().split(/\r?\n/).at(-1))
}

export const reachable = probe => Object.entries(probe).filter(([, ok]) => ok).map(([name]) => name)

// Fails closed: the network must be an internal Docker network AND the probe must reach nothing.
export async function assertIsolated({ image, network, simulator }) {
  const [info] = JSON.parse(await command('docker', ['network', 'inspect', network]))
  if (info?.Internal !== true) throw Error('ISOLATION_NOT_VERIFIED: the network is not an internal Docker network')
  const probe = await probeEgress({ image, network, simulator })
  const leaks = reachable(probe)
  if (leaks.length) throw Error(`ISOLATION_NOT_VERIFIED: reachable from the replica network: ${leaks.join(', ')}`)
  return { network, internal: true, probe }
}

// The only way the rehearsal starts API/Worker: `start` is not called unless the isolation check passes.
export async function startIfIsolated(check, start) {
  const proof = await check()
  return start(proof)
}
