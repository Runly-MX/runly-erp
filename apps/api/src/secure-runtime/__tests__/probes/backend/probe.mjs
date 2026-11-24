// Inert isolation probe: only OBSERVES what the sandbox allows and reports it.
// It writes nothing outside /tmp, sends nothing anywhere real and stops at the
// first answer of every check.
import fs from 'node:fs/promises'
import net from 'node:net'
import { execFile } from 'node:child_process'
import os from 'node:os'

const attempt = async (fn) => { try { return { ok: true, value: await fn() } } catch (error) { return { ok: false, code: error?.code ?? error?.name ?? 'ERROR' } } }
const tcp = (host, port) => new Promise((resolve, reject) => {
  const socket = net.connect({ host, port, timeout: 1500 })
  socket.on('connect', () => { socket.destroy(); resolve('connected') })
  socket.on('timeout', () => { socket.destroy(); reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })) })
  socket.on('error', reject)
})

export default async function probe({ capabilities, input }) {
  const environ = await attempt(() => fs.readFile('/proc/self/environ', 'utf8'))
  return {
    uid: process.getuid(), gid: process.getgid(),
    envKeys: Object.keys(process.env).sort(),
    environHasToken: environ.ok ? /RUNLY_CALL_TOKEN|eyJ|Module /.test(environ.value) : false,
    secretsInEnv: Object.keys(process.env).filter((k) => /DATABASE|SUPABASE|JWT|SECRET|KEY|TOKEN|PASSWORD/i.test(k)),
    writeRoot: await attempt(() => fs.writeFile('/probe.txt', 'x')),
    writeExt: await attempt(() => fs.writeFile('/ext/probe.txt', 'x')),
    writeTmp: await attempt(() => fs.writeFile('/tmp/probe.txt', 'x')),
    execFromTmp: await attempt(() => new Promise((resolve, reject) => fs.writeFile('/tmp/x.sh', '#!/bin/sh\necho hi\n', { mode: 0o755 }).then(() => execFile('/tmp/x.sh', (e, out) => (e ? reject(e) : resolve(out)))))),
    dockerSocket: await attempt(() => fs.stat('/var/run/docker.sock')),
    hostRepo: await attempt(() => fs.readdir('/app')),
    mounts: (await attempt(() => fs.readFile('/proc/self/mounts', 'utf8'))).value?.split('\n').filter((l) => / \/(ext|runner|tmp) /.test(l)).map((l) => l.split(' ').slice(1, 4).join(' ')),
    internet: await attempt(() => tcp('1.1.1.1', 443)),
    dnsInternet: await attempt(() => tcp('example.com', 80)),
    postgresByName: await attempt(() => tcp(input.dbHost ?? 'supabase-db', 5432)),
    hostGateway: await attempt(() => tcp('host.docker.internal', input.hostPort ?? 5432)),
    gatewayDirect: await attempt(() => fetch('http://gateway:8080/v1/call', { method: 'POST', body: '{}' }).then((r) => r.status)),
    crossCompany: await attempt(() => capabilities.call('records.list', { entity: 'solicitud', companyId: input.otherCompany })),
    ownCompany: await attempt(() => capabilities.call('records.list', { entity: 'solicitud' })).then((r) => (r.ok ? { ok: true, count: r.value.length } : r)),
    notGranted: await attempt(() => capabilities.call('records.create', { entity: 'solicitud', data: { titulo: 'x', solicitante: input.selfId } })),
    cpus: os.cpus().length,
  }
}
