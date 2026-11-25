// `vite build` with NODE_ENV forced to production.
// vite.config.js sets envDir to the repository root, and Vite reads NODE_ENV from that .env: a developer .env with
// NODE_ENV=development made dependencies that branch on it ship their development builds (Excalidraw dev.js:
// +3 MB raw, different chunking). The variable has to be in the environment before Vite starts, which is why this is
// a launcher and not a setting in vite.config.js. Docker builds never see the .env; local builds now match them.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const viteCli = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
const result = spawnSync(process.execPath, [viteCli, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
})
process.exit(result.status ?? 1)
