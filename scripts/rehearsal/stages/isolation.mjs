import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { command } from '../../fixtures/studio/supabase-stack.mjs'
import { attachStack } from '../lib/stack-attach.mjs'
import { assertIsolated, createProductionSimulator, probeEgress, reachable, startIfIsolated } from '../lib/isolation.mjs'
import { checkReplicaEnv, parseEnv, NEUTRALIZING_OVERRIDES } from '../lib/replica-guard.mjs'
import { expect, note, rand, save } from './common.mjs'

const containerNames = token => ({ internal: `runly-rehearsal-internal-${token}`, api: `runly-rehearsal-api-${token}`, worker: `runly-rehearsal-worker-${token}` })
const exists = async name => (await command('docker', ['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'])).trim() === name

async function probeApi(ctx, network, body) {
  return ctx.log.attempt('probe the replica API from inside the internal network', 'docker', ['run', '--rm', '--network', network, '--entrypoint', 'node', ctx.images.api, '-e', body])
}

// Nothing that runs Runly application code starts until the network it will live on is proven to reach nothing outside.
export async function isolationStage(ctx) {
  const replica = await attachStack(ctx.state.replica)
  const token = ctx.runId.slice(-8), names = containerNames(token)
  const simulator = await createProductionSimulator({ image: ctx.images.api, token })
  try {
    await expect(ctx, 'isolation-positive-control', 'Control: the same probe on an ordinary Docker network DOES reach the simulated production service on the host and in a container, so a failed probe cannot mean a broken probe', async () => {
      const result = await probeEgress({ image: ctx.images.api, network: simulator.network, simulator })
      const missing = ['host-service', 'production-container'].filter(name => !result[name])
      if (missing.length) throw Error(`control probe could not reach: ${missing.join(', ')} (${JSON.stringify(result)})`)
      return `reachable on a normal network: ${reachable(result).join(', ')}`
    })

    await expect(ctx, 'isolation-gate-blocks-normal-network', 'Negative test: on a NORMAL network the gate refuses, and the API is never created', async () => {
      let started = 0
      await startIfIsolated(() => assertIsolated({ image: ctx.images.api, network: simulator.network, simulator }), async () => { started += 1 }).then(
        () => { throw Error('the gate accepted a network with outbound access') },
        error => { if (!/ISOLATION_NOT_VERIFIED/.test(error.message)) throw error })
      if (started !== 0 || await exists(names.api) || await exists(names.worker)) throw Error('a service was started behind a failed gate')
      return 'refused (ISOLATION_NOT_VERIFIED); no API or Worker container exists'
    })

    await command('docker', ['network', 'create', '--internal', names.internal])
    let proof
    await expect(ctx, 'isolation-gate-passes-internal', 'On an INTERNAL network the probe reaches NOTHING: no Internet, no DNS, no production service on the host, no production container', async () => {
      proof = await assertIsolated({ image: ctx.images.api, network: names.internal, simulator })
      return JSON.stringify(proof.probe)
    })
    if (!proof) throw Error('the isolation gate did not open; API and Worker are not started')

    // Only now do the services that run application code start, and only on that network.
    for (const service of ['supabase-db', 'supabase-kong', 'supabase-storage', 'supabase-auth', 'supabase-rest']) {
      const container = await replica.container(service)
      await command('docker', ['network', 'connect', '--alias', service, names.internal, container])
    }
    const composeEnv = JSON.parse(await readFile(replica.composeFile, 'utf8')).services['runly-api'].environment
    const env = { ...composeEnv, ...NEUTRALIZING_OVERRIDES, JWT_SECRET: rand(32), RUNLY_SKIP_DB_INIT: '1', RUNLY_INSTANCE_ID: 'rehearsal-replica', CORS_ORIGIN: 'http://localhost' }
    const envFile = join(ctx.work, 'replica-api.env')
    await writeFile(envFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
    await expect(ctx, 'isolation-env-guard', 'The replica environment passes the guard: no outbound mode on, no credential of the source, no host outside the replica', async () => {
      const findings = checkReplicaEnv(parseEnv(await readFile(envFile, 'utf8')))
      const real = findings.filter(finding => !['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'RUNLY_INTERNAL_SECRET'].includes(finding.name))
      if (real.length) throw Error(real.map(f => `${f.name}: ${f.reason}`).join('; '))
      return `${findings.length} replica-own key(s) noted, 0 outbound settings`
    })

    const startApi = () => startIfIsolated(async () => proof, () => command('docker', ['run', '-d', '--name', names.api, '--network', names.internal, '--network-alias', 'runly-api', '--env-file', envFile, '--entrypoint', 'node', ctx.images.api, 'apps/api/src/index.js']))

    // The certified API fails closed on a restored Storage that has not been through the hardening (no policy, no guard).
    await expect(ctx, 'api-refuses-unprepared-storage', 'The certified API REFUSES to start on the restored, un-hardened Storage (fail closed), and says why', async () => {
      await startApi()
      let status = ''
      for (let attempt = 0; attempt < 40 && !status.startsWith('exited'); attempt++) { status = (await command('docker', ['inspect', '--format', '{{.State.Status}}|{{.State.ExitCode}}', names.api])).trim(); if (!status.startsWith('exited')) await new Promise(resolve => setTimeout(resolve, 1500)) }
      const logs = await command('docker', ['logs', '--tail', '30', names.api]).catch(() => '')
      if (!status.startsWith('exited|') || status === 'exited|0') throw Error(`the API did not stop: ${status}`)
      if (!/NOTES_STORAGE_OWNER_PREPARATION_REQUIRED/.test(logs)) throw Error(`stopped for another reason: ${logs.slice(-300)}`)
      return `${status}; NOTES_STORAGE_OWNER_PREPARATION_REQUIRED`
    })

    // First step of the real update, with the replica's own storage-owner credential and only against the replica's database port.
    await expect(ctx, 'storage-owner-preparation', 'Update step on the replica: prisma/prepare-notes-storage-owner.sql is applied with the replica storage owner (idempotent, nothing is made public)', async () => {
      await command('docker', ['rm', '-f', names.api])
      const connection = new URL(JSON.parse(await readFile(replica.composeFile, 'utf8')).services['supabase-storage'].environment.DATABASE_URL)
      if (!new Set(['supabase-db', '127.0.0.1']).has(connection.hostname)) throw Error('unexpected storage owner host')
      connection.hostname = '127.0.0.1'; connection.port = String(ctx.state.replica.ports.db)
      const { default: pg } = await import('pg')
      const owner = new pg.Pool({ connectionString: connection.href, max: 1 })
      try {
        const sql = await readFile('prisma/prepare-notes-storage-owner.sql', 'utf8')
        await owner.query(sql); await owner.query(sql)
        const counts = (await owner.query("SELECT (SELECT count(*) FROM pg_policy WHERE polname = 'runly_notes_private_images_v1')::int AS policy, (SELECT count(*) FROM pg_trigger WHERE tgname = 'runly_notes_bucket_private_v1' AND NOT tgisinternal)::int AS guard")).rows[0]
        if (counts.policy !== 1 || counts.guard !== 1) throw Error(`policy/guard: ${JSON.stringify(counts)}`)
        return 'policy and guard present after applying twice'
      } finally { await owner.end() }
    })

    await startApi()
    // The Worker image starts through `pnpm`, which asks corepack to download pnpm from the Internet; with no route out that cannot work.
    // The rehearsal starts the same entry file directly.
    await startIfIsolated(async () => proof, () => command('docker', ['run', '-d', '--name', names.worker, '--network', names.internal, '--env-file', envFile, '-w', '/app/apps/worker', '--entrypoint', 'node', ctx.images.worker, 'src/index.js']))

    await expect(ctx, 'api-healthy-isolated', 'The recovered API answers /health from inside the isolated network, and its only network is the internal one', async () => {
      let ok = false, last = ''
      for (let attempt = 0; attempt < 40 && !ok; attempt++) {
        const result = await probeApi(ctx, names.internal, "fetch('http://runly-api:4010/health').then(r => process.exit(r.ok ? 0 : 2), () => process.exit(3))")
        ok = result.code === 0; last = result.output
        if (!ok) await new Promise(resolve => setTimeout(resolve, 1500))
      }
      if (!ok) throw Error(`the API never became healthy: ${(await command('docker', ['logs', '--tail', '15', names.api]).catch(() => last)).slice(-500)}`)
      const networks = Object.keys(JSON.parse(await command('docker', ['inspect', '--format', '{{json .NetworkSettings.Networks}}', names.api])))
      if (networks.length !== 1 || networks[0] !== names.internal) throw Error(`the API is attached to: ${networks.join(', ')}`)
      return 'healthy; attached only to the internal network'
    })

    await expect(ctx, 'api-egress-blocked', 'From inside the running API container every outbound attempt fails: Internet, DNS, host service and production container', async () => {
      const body = `const net = require('node:net'); const dns = require('node:dns').promises; const t = ${JSON.stringify(simulator.targets)};
        const tcp = (h, p) => new Promise(r => { const s = net.connect({ host: h, port: p, timeout: 2500 }); s.once('connect', () => { s.destroy(); r(true) }); s.once('timeout', () => { s.destroy(); r(false) }); s.once('error', () => r(false)) });
        (async () => { const o = { internet: await fetch('https://example.com', { signal: AbortSignal.timeout(3000) }).then(() => true, () => false), dns: await dns.lookup('example.com').then(() => true, () => false) };
        for (const x of t) o[x.name] = await tcp(x.host, x.port); console.log(JSON.stringify(o)) })()`
      const result = await ctx.log.attempt('probe from inside the running API container', 'docker', ['exec', names.api, 'node', '-e', body])
      if (result.code !== 0) throw Error(`probe failed to run: ${result.output.slice(0, 200)}`)
      const out = JSON.parse(result.output.trim().split(/\r?\n/).at(-1))
      if (reachable(out).length) throw Error(`reachable from the API container: ${reachable(out).join(', ')}`)
      return JSON.stringify(out)
    })

    await expect(ctx, 'worker-isolated', 'The Worker runs on the internal network only, stays up, and its logs show no delivery to an external system', async () => {
      await new Promise(resolve => setTimeout(resolve, 8000))
      const state = (await command('docker', ['inspect', '--format', '{{.State.Status}}|{{.State.ExitCode}}', names.worker])).trim()
      const networks = Object.keys(JSON.parse(await command('docker', ['inspect', '--format', '{{json .NetworkSettings.Networks}}', names.worker])))
      const logs = await command('docker', ['logs', '--tail', '80', names.worker]).catch(() => '')
      await writeFile(join(ctx.runDir, 'worker.log'), ctx.log.clean(logs))
      if (networks.length !== 1 || networks[0] !== names.internal) throw Error(`worker networks: ${networks.join(', ')}`)
      if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|smtp|sendMail|fcm|push/i.test(logs.split('\n').filter(line => /error|fail|warn/i.test(line)).join('\n'))) note(ctx, 'Worker logged connection errors; see worker.log in the run folder')
      if (!state.startsWith('running')) throw Error(`worker state ${state}: ${logs.slice(-400)}`)
      return `state ${state}; networks ${networks.join(',')}`
    })

    await expect(ctx, 'recovered-app-works', 'The recovered application works end to end: a restored user signs in and the API returns the restored notes (company-scoped)', async () => {
      const user = ctx.state.source.users[0], company = ctx.state.source.companies[0]
      const script = `const kong = 'http://supabase-kong:8000'; (async () => {
        const login = await fetch(kong + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: process.env.ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }) });
        if (login.status !== 200) { console.log(JSON.stringify({ step: 'login', status: login.status })); return }
        const { access_token } = await login.json();
        const notes = await fetch('http://runly-api:4010/notes', { headers: { Authorization: 'Bearer ' + access_token, 'X-Runly-Company-Id': process.env.COMPANY } });
        const body = await notes.json().catch(() => ({}));
        console.log(JSON.stringify({ step: 'notes', status: notes.status, titles: (body.notes ?? body.data?.notes ?? []).map(n => n.title) })) })()`
      const result = await ctx.log.attempt('sign in with a restored user and read notes through the recovered API', 'docker', ['run', '--rm', '--network', names.internal, '-e', `ANON=${replica.secret.SUPABASE_ANON_KEY}`, '-e', `EMAIL=${user.email}`, '-e', `PASSWORD=${user.password}`, '-e', `COMPANY=${company.id}`, '--entrypoint', 'node', ctx.images.api, '-e', script])
      const out = JSON.parse(result.output.trim().split(/\r?\n/).at(-1))
      if (out.step !== 'notes' || out.status !== 200) throw Error(`unexpected result ${JSON.stringify(out)}`)
      if (!out.titles.some(title => title.startsWith('Nota con imagen'))) throw Error(`the restored note is not listed: ${JSON.stringify(out.titles)}`)
      return `status 200; notes: ${out.titles.join(' | ')}`
    })
  } finally {
    ctx.state.isolationNames = names
    await save(ctx)
    await command('docker', ['rm', '-f', names.api, names.worker]).catch(() => {})
    await simulator.close().catch(() => {})
    for (const service of ['supabase-db', 'supabase-kong', 'supabase-storage', 'supabase-auth', 'supabase-rest']) {
      const container = await replica.container(service).catch(() => '')
      if (container) await command('docker', ['network', 'disconnect', '-f', names.internal, container]).catch(() => {})
    }
    await command('docker', ['network', 'rm', names.internal]).catch(() => {})
    await replica.pool.end().catch(() => {})
  }
}
