#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareExternalStudioRealtime } from './lib/studio-realtime-external.mjs'

const cwd = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
try {
  const image = args.find(v => v.startsWith('--api-image='))?.slice('--api-image='.length)
  const recover = args.includes('--recover-known-failure')
  prepareExternalStudioRealtime({ image, envFile: join(cwd, '.env.external'), cwd, diagnose: !recover, recover })
  console.log(recover ? 'Recuperación completada. Ejecuta ./update-external.sh para aplicar la migración.' : 'Solo diagnóstico; no se modificó la base.')
} catch (error) { console.error(error.message); process.exitCode = 1 }
