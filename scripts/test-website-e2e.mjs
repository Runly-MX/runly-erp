import {spawn,spawnSync} from 'node:child_process'
import {readFileSync,rmSync,mkdirSync,openSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
// Single entry point for the Website end-to-end battery: `pnpm test:website:e2e`.
// Builds a fresh disposable lab, runs the scripts in dependency order, always tears down.
// Deliberate dependencies between scripts (each one reuses the lab state left by the previous):
//   1 functional-browser   creates the baseline site, form, releases and the ZIP import
//   2 sections-browser     adds a second site; assumes the default site exists
//   3 dependencies         grants Catalog/Growth permissions and writes dependencies-fixture.json
//   4 dependencies-browser consumes that fixture, so it must follow 3
//   5 final                cross-company, secret-free output and accessibility
const dir=resolve('.artifacts/website-integration'),node=process.execPath
const steps=[
 ['functional-browser','scripts/test-website-functional-browser.mjs'],
 ['sections-browser','scripts/test-website-sections-browser.mjs'],
 ['dependencies','scripts/test-website-dependencies.mjs'],
 ['dependencies-browser','scripts/test-website-dependencies-browser.mjs'],
 ['final','scripts/test-website-final.mjs'],
]
const run=(args,opts={})=>spawnSync(node,args,{stdio:'inherit',...opts}).status===0
const children=[]
const killTree=child=>{try{spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})}catch{}try{child.kill()}catch{}}
async function waitFor(url,ms=180000){const end=Date.now()+ms;while(Date.now()<end){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,1000))}throw Error('LAB_NOT_READY '+url)}
function teardown() {
  for(const child of children)killTree(child)
  if(!existsSync(dir+'/target.json'))return
  const {name,composeFile}=JSON.parse(readFileSync(dir+'/target.json','utf8'))
  if(!/^runly-studio-e2e-[a-f0-9]+$/.test(name))return console.error('Refusing to remove unrecognized project',name)
  spawnSync('docker',['compose','-f',composeFile,'-p',name,'down','-v'],{stdio:'inherit'})
}
let failed=[]
try{
 rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true})
 if(!run(['scripts/fixtures/website-integration-lab.mjs']))throw Error('LAB_SETUP_FAILED')
 const config=JSON.parse(readFileSync(dir+'/private.json','utf8'))
 for(const [name,args] of [['api',[]],['web',['--web']]])children.push(spawn(node,['scripts/fixtures/website-integration-server.mjs',...args],{stdio:['ignore',openSync(`${dir}/${name}.log`,'a'),openSync(`${dir}/${name}.log`,'a')]}))
 await waitFor(`${config.urls.api}/health`);await waitFor(`${config.urls.web}/app/`)
 for(const [name,file] of steps){console.log(`\n=== ${name}`);if(!run([file]))failed.push(name)}
}catch(error){console.error(error.message);failed.push('setup')}
finally{teardown()}
console.log(failed.length?`\nWebsite E2E FAILED: ${failed.join(', ')}`:`\nWebsite E2E PASSED (${steps.length} scripts)`)
process.exit(failed.length?1:0)
