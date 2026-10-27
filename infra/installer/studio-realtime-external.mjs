#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareExternalStudioRealtime } from './lib/studio-realtime-external.mjs'
import { readFileSync } from 'node:fs'
import { externalMigrationNetwork, acquireInstallerDeployment } from './lib/installer-runtime.mjs'

const cwd = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
let releaseDeployment = () => {}
try {
  releaseDeployment = acquireInstallerDeployment(cwd)
  const image = args.find(v => v.startsWith('--api-image='))?.slice('--api-image='.length)
  const recover = args.includes('--recover-known-failure')
  const selectedEnv = args.find(v => v.startsWith('--env-file='))?.slice('--env-file='.length) || '.env.external'
  if (!['.env.local', '.env.external'].includes(selectedEnv)) throw Error('STUDIO_ENV_FILE_INVALID')
  const envFile = join(cwd, selectedEnv)
  prepareExternalStudioRealtime({ image, envFile, cwd, diagnose: !recover, recover, dockerArgs:externalMigrationNetwork(readFileSync(envFile, 'utf8')) })
  console.log(recover ? 'Recuperación completada. Ejecuta ./update-external.sh para aplicar la migración.' : 'Solo diagnóstico; no se modificó la base.')
} catch (error) { console.error(error.message); process.exitCode = 1 } finally { releaseDeployment() }
