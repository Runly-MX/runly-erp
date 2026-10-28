import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'
// Builds the API image from a committed ref only, so a measurement label always
// maps to an exact SHA. Local Docker engine only; nothing is pushed.
const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const ref = await command('git', ['rev-parse', process.argv.find(a => a.startsWith('--ref='))?.slice(6) ?? 'HEAD'])
const short = ref.slice(0, 12), image = `runly-notifications:api-${short}`
const directory = resolve('.artifacts/notifications', `build-${short}`), source = join(directory, 'source'), archive = join(directory, 'source.tar')
await mkdir(source, { recursive: true })
await command('git', ['archive', '--format=tar', '--output', archive, ref])
await command('tar', ['-xf', archive, '-C', source])
await command('docker', ['build', '--pull=false', '-f', join(source, 'infra/docker/api.Dockerfile'), '-t', image, source], { log: join(directory, 'build.log') })
console.log(image)
