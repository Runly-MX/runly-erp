import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
const directory=resolve('.artifacts/realtime-2/web-build'),envDir=join(directory,'config')
await mkdir(envDir,{recursive:true})
// Never consume a workstation .env or inherited deployment configuration.
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key]
const require=createRequire(resolve('apps/desktop/package.json'))
const {build}=await import(pathToFileURL(require.resolve('vite')).href)
await build({root:resolve('apps/desktop'),configFile:resolve('apps/desktop/vite.config.js'),envDir,base:'/',
  define:{'import.meta.env.VITE_RUNLY_API_URL':JSON.stringify('https://api.example.test'),'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://realtime.example.test'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('example-anon-key')},
  build:{outDir:join(directory,'web'),emptyOutDir:true}})
await writeFile(join(directory,'result.json'),JSON.stringify({passed:true,configuration:'isolated example values; no deployment'},null,2))
