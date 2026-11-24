// usage: node run-suite.mjs <repoRoot> <outFile>; runs tracked test files in batches, writes one "status<TAB>file<TAB>name" line per test
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
const [root,out]=process.argv.slice(2)
const files=spawnSync('git',['ls-files'],{cwd:root,encoding:'utf8',maxBuffer:1e8}).stdout.split('\n').filter(f=>/\.test\.(js|mjs|cjs)$/.test(f))
const lines=[]
for(let i=0;i<files.length;i+=40){
  const batch=files.slice(i,i+40)
  const r=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=4',...batch],{cwd:root,encoding:'utf8',maxBuffer:1e9,timeout:900000})
  let cur=''
  for(const l of (r.stdout||'').split('\n')){
    const m=l.match(/^(\s*)(not ok|ok) \d+ - (.*)$/)
    if(m&&m[1]===''&&/\.test\.(js|mjs|cjs)$/.test(m[3])){cur=m[3];lines.push(`${m[2]}\tFILE\t${m[3]}`)}
    else if(m&&!/#\s*(SKIP|TODO)/i.test(l)){lines.push(`${m[2]}\t${cur}\t${m[1].length}:${m[3].replace(/ # .*/,'')}`)}
  }
  console.error(`${Math.min(i+40,files.length)}/${files.length}`)
}
writeFileSync(out,lines.join('\n'))
