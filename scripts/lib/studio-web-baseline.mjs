import {execFileSync}from'node:child_process'
import {resolve,join}from'node:path'
import {writeFile}from'node:fs/promises'
import {inspectStudioWeb}from'./studio-web-verification.mjs'
// Read HEAD through Vite's loader. No checkout, branch, worktree or source overwrite.
export async function measureStudioBaseline(build,config,directory,base='HEAD') {
  const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim()
  if(!/^(HEAD|[a-f0-9]{7,40})$/i.test(base))throw Error('BASELINE_COMMIT_REQUIRED')
  const ref=git(['rev-parse','--verify',base]),sources=new Map()
  for(const path of git(['diff','--name-only','--diff-filter=M',ref,'--','apps/desktop','apps/shared','packages/sdk']).split(/\r?\n/).filter(path=>/\.(?:js|jsx|css)$/.test(path))) {
    sources.set(resolve(path).replaceAll('\\','/'),execFileSync('git',['show',`${ref}:${path}`],{encoding:'utf8',maxBuffer:16*1024*1024}))
  }
  const outDir=join(directory,'web-baseline')
  await build({...config,plugins:[{name:'studio-read-head-baseline',enforce:'pre',load(id){return sources.get(id.split('?')[0].replaceAll('\\','/'))??null}}],build:{...config.build,outDir}})
  const result={ref,...await inspectStudioWeb(outDir)}
  await writeFile(join(directory,'baseline.json'),JSON.stringify(result,null,2))
  return result
}
