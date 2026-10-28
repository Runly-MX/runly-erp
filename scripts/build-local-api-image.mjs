import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'
// Builds the API image from a committed ref only, so a measurement label always
// maps to an exact SHA. Local Docker engine only; nothing is pushed.
const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const ref = await command('git', ['rev-parse', process.argv.find(a => a.startsWith('--ref='))?.slice(6) ?? 'HEAD'])
const short = ref.slice(0, 12)
const kinds = (process.argv.find(a => a.startsWith('--kinds='))?.slice(8) ?? 'api').split(',')
assert.ok(kinds.every(kind => ['api', 'worker', 'web'].includes(kind)))
const directory = resolve('.artifacts/notifications', `build-${short}`), source = join(directory, 'source'), archive = join(directory, 'source.tar')
await mkdir(source, { recursive: true })
await command('git', ['archive', '--format=tar', '--output', archive, ref])
await command('tar', ['-xf', archive, '-C', source])
for (const kind of kinds) {
  const image = `runly-notifications:${kind}-${short}`
  // Web bakes its API/Supabase URLs at build time; the placeholders are only for local container boot.
  const args = kind === 'web' ? ['--build-arg', 'VITE_RUNLY_API_URL=http://localhost:4010'] : []
  await command('docker', ['build', '--pull=false', ...args, '-f', join(source, `infra/docker/${kind}.Dockerfile`), '-t', image, source], { log: join(directory, `build-${kind}.log`) })
  console.log(image)
}
