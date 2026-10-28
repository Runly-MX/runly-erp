// Disposable local API and worker images for the Studio Resources E2E: HEAD plus ONLY the files this
// workstream owns (listed explicitly below). Files other sessions are editing are never copied.
// Builds nothing outside Docker's local image store; it does not push, run, stop or remove anything.
//   node scripts/build-studio-resources-local.mjs
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'

const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
// Everything under these prefixes was created or changed by the Resources work; the rest of the tree is HEAD.
const OWNED = [/^apps\/api\/(package\.json|src\/routes\/studio\/)/, /^apps\/shared\/studio\//, /^pnpm-lock\.yaml$/, /^scripts\/diagnose-studio-catalog\.mjs$/]
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const head = git('rev-parse', 'HEAD').trim()
const changed = git('status', '--porcelain', '-uall', '--', 'apps/api', 'apps/shared', 'pnpm-lock.yaml', 'scripts/diagnose-studio-catalog.mjs').split(/\r?\n/).filter(Boolean)
  .map(line => ({ status: line.slice(0, 2), file: line.slice(3).replace(/^"|"$/g, '') }))
const foreign = changed.filter(row => !OWNED.some(pattern => pattern.test(row.file)))
if (foreign.length) throw Error(`UNOWNED_CHANGES_IN_API_TREE: ${foreign.map(row => row.file).join(', ')}`)
if (changed.some(row => /D/.test(row.status))) throw Error('DELETIONS_NOT_SUPPORTED_IN_OVERLAY')
const files = changed.map(row => row.file)
const sources = await Promise.all(files.map(async file => [file, await readFile(file)]))
const digest = createHash('sha256').update(head)
for (const [file, bytes] of sources) digest.update(file).update(bytes)
const version = digest.digest('hex').slice(0, 12), directory = resolve('.artifacts/studio', `resources-build-${version}`), source = join(directory, 'source')
await mkdir(source, { recursive: true })
const archive = join(directory, 'source.tar')
// Relative paths: GNU tar reads "D:\..." as a remote host.
const here = path => relative(process.cwd(), path).replaceAll('\\', '/')
execFileSync('git', ['archive', '--format=tar', '--output', here(archive), head]); execFileSync('tar', ['-xf', here(archive), '-C', here(source)])
for (const [file, bytes] of sources) { const target = join(source, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes) }
console.log(`Overlay on ${head.slice(0, 9)}: ${files.length} files`); for (const file of files) console.log(`  ${file}`)
const images = {}
for (const kind of ['api', 'worker']) {
  const image = `runly-studio-resources:${version}-${kind}`
  await command('docker', ['build', '--pull=false', '-f', join(source, `infra/docker/${kind}.Dockerfile`), '-t', image, '--label', `org.opencontainers.image.revision=${head}`, source], { log: join(directory, `${kind}.log`) })
  images[kind] = image; console.log(`Local ${kind} build: ${image}`)
}
await writeFile(resolve('.artifacts/studio/resources-build.json'), JSON.stringify({ head, version, images, files }, null, 2))
