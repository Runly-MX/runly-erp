import { resolve, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import pg from 'pg'
import { resolveSupabaseSecrets } from '../../../infra/installer/lib/supabase-selfhosted-config.mjs'

export async function unusedPort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

// Deliberately excludes inherited application variables and Compose overrides.
const dockerEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(path|pathext|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles(?:\(x86\))?|programw6432|homedrive|homepath|home)$/i.test(key)))
export async function command(executable, args, { env = dockerEnv, input, log } = {}) {
  const child = spawn(executable, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  if(input?.pipe)input.pipe(child.stdin)
  else child.stdin.end(input)
  const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  if (log) await writeFile(log, output)
  if (status !== 0) throw Error(`${executable} failed (${status}); ${log ? 'see private log' : output.slice(-1500)}`)
  return output.trim()
}

export async function createStudioStack({apiImage='runly-studio-test:api-local',webImage,normalApiStartup=false,enableMcp=false}={}) {
  if(!/^[a-z0-9][a-z0-9./_-]*:[a-zA-Z0-9_.-]+$/.test(apiImage)||(webImage&&!/^[a-z0-9][a-z0-9./_-]*:[a-zA-Z0-9_.-]+$/.test(webImage)))throw Error('EXPLICIT_LOCAL_IMAGE_TAG_REQUIRED')
  const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
  if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
  const name = `runly-studio-e2e-${randomBytes(6).toString('hex')}`
  const directory = resolve('.artifacts/studio', name)
  await mkdir(directory, { recursive: true })
  const secret = resolveSupabaseSecrets({})
  const ports = { web: await unusedPort(), api: await unusedPort(), kong: await unusedPort(), db: await unusedPort() }
  const urls = Object.fromEntries(Object.entries(ports).map(([key, port]) => [key, `http://127.0.0.1:${port}`]))
  const values = { ...secret, RUNLY_CONTAINER_PREFIX: name, RUNLY_COMPOSE_PROJECT_NAME: name,
    RUNLY_SUPABASE_PUBLIC_URL: urls.kong, CORS_ORIGIN: urls.web, RUNLY_PUBLIC_BIND_ADDR: '127.0.0.1',
    RUNLY_SUPABASE_KONG_HOST_PORT: ports.kong, RUNLY_SUPABASE_MAILER_AUTOCONFIRM: 'true',
    RUNLY_SUPABASE_DISABLE_SIGNUP: 'true' }
  const envFile = join(directory, 'test.env')
  await writeFile(envFile, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'))
  const source = JSON.parse(await command('docker', ['compose', '--project-directory', resolve('infra/installer'), '--env-file', envFile, '-f',
    resolve('infra/installer/supabase/docker-compose.supabase.yml'), 'config', '--format', 'json']))
  const allowed = ['supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong']
  const services = Object.fromEntries(allowed.map(key => [key, source.services[key]]))
  for (const service of Object.values(services)) {
    delete service.container_name
    service.restart = 'no'; service.pull_policy = 'never'
    // Compose config expands default networks to project-specific names; use only ours.
    service.networks = { default: null }
  }
  services['supabase-db'].ports = [{ target: 5432, published: String(ports.db), host_ip: '127.0.0.1' }]
  services['supabase-auth'].environment.GOTRUE_SMTP_HOST = ''
  // Fail a test outage promptly; production gateway timeouts remain unchanged.
  const kongSource = services['supabase-kong'].volumes.find(mount => mount.target === '/home/kong/temp.yml')
  const kongConfig = join(directory, 'kong.yml')
  await writeFile(kongConfig, (await readFile(kongSource.source, 'utf8')).replace(/^    url:/gm,
    '    connect_timeout: 2000\n    read_timeout: 3000\n    write_timeout: 3000\n    retries: 0\n    url:'))
  kongSource.source = kongConfig
  const databaseUrl = `postgresql://postgres:${secret.SUPABASE_POSTGRES_PASSWORD}@supabase-db:5432/postgres`
  services['runly-api'] = { image: apiImage, pull_policy: 'never', restart: 'no',
    entrypoint: ['node', 'apps/api/src/index.js'],
    environment: { NODE_ENV: 'production', DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
      SUPABASE_URL: 'http://supabase-kong:8000', RUNLY_SUPABASE_PUBLIC_URL: urls.kong,
      SUPABASE_ANON_KEY: secret.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: secret.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_JWT_SECRET: secret.SUPABASE_JWT_SECRET, RUNLY_INTERNAL_SECRET: randomBytes(32).toString('hex'),
      RUNLY_SKIP_DB_INIT: '1', CORS_ORIGIN: urls.web, RUNLY_PROJECT_ROOT: '/app', RUNLY_MODULES_DIR: '/app/modules/custom', STUDIO_CATALOG_TEST_PROJECT:name },
    ports: [{ target: 4010, published: String(ports.api), host_ip: '127.0.0.1' }], networks: { default: null } }
  if(normalApiStartup){delete services['runly-api'].entrypoint;services['runly-api'].environment.RUNLY_SKIP_DB_INIT='0'}
  if(enableMcp)Object.assign(services['runly-api'].environment,{RUNLY_MCP_ENABLED:'true',RUNLY_MCP_PUBLIC_URL:urls.api+'/mcp',RUNLY_MCP_WEB_URL:urls.web+'/app/'})
  if(webImage)services['runly-web']={image:webImage,pull_policy:'never',restart:'no',
    environment:{RUNLY_API_URL:urls.api,SUPABASE_URL:urls.kong,SUPABASE_ANON_KEY:secret.SUPABASE_ANON_KEY},
    ports:[{target:80,published:String(ports.web),host_ip:'127.0.0.1'}],networks:{default:null}}
  services['runly-api'].networks={default:{aliases:['api']}}
  services['studio-catalog-test']={image:apiImage,pull_policy:'never',restart:'no',entrypoint:['node','/app/studio-catalog-server.mjs'],
    volumes:[{type:'bind',source:resolve('scripts/fixtures/studio/catalog-server.mjs'),target:'/app/studio-catalog-server.mjs',read_only:true}],networks:{default:null}}
  const volumes = Object.fromEntries(Object.keys(source.volumes).map(key => [key, {}]))
  const composeFile = join(directory, 'compose.json')
  await writeFile(composeFile, JSON.stringify({ name, services, volumes, networks: { default: {} } }, null, 2))
  const compose = (args, options) => command('docker', ['compose', '--project-name', name, '--env-file', envFile, '-f', composeFile, ...args], options)
  const pool = new pg.Pool({ connectionString: `postgresql://postgres:${secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${ports.db}/postgres` })
  let verified = false
  async function verifyTarget() {
    const id = await compose(['ps', '-q', 'supabase-db'])
    const [container] = JSON.parse(await command('docker', ['inspect', id]))
    if (container.Config.Labels['com.docker.compose.project'] !== name ||
      container.Mounts.some(mount => mount.Type === 'volume' && !mount.Name.startsWith(`${name}_`))) throw Error('DISPOSABLE_DATABASE_IDENTITY_MISMATCH')
    const existing = await pool.query("SELECT to_regclass('public._prisma_migrations') AS history")
    if (existing.rows[0].history) throw Error('FRESH_DATABASE_REQUIRED')
    await pool.query('CREATE SCHEMA runly_studio_test; CREATE TABLE runly_studio_test.environment(id text PRIMARY KEY)')
    await pool.query('INSERT INTO runly_studio_test.environment VALUES ($1)', [name])
    verified = true
  }
  async function initialize() {
    const guard = async () => {
      if (!verified || (await pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id !== name) throw Error('DISPOSABLE_DATABASE_NOT_VERIFIED')
    }
    await guard()
    await compose(['run', '--rm', '--no-deps', '--entrypoint', 'node', 'runly-api', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], { log: join(directory, 'migrate.log') })
    await guard()
    await compose(['run', '--rm', '--no-deps', '--entrypoint', 'node', 'runly-api', 'prisma/seed.js'], { log: join(directory, 'seed.log') })
  }
  let closing
  return { name, directory, secret, ports, urls, pool, compose, composeFile, verifyTarget, initialize,
    close() {
      return closing ??= (async () => {
      await pool.end()
      await compose(['unpause', 'supabase-storage']).catch(() => {})
      await compose(['logs', '--no-color'], { log: join(directory, 'services.log') }).catch(() => {})
      await compose(['down', '--volumes', '--remove-orphans'], { log: join(directory, 'cleanup.log') })
      })()
    } }
}
