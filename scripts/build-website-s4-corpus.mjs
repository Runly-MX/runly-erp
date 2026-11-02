// Official toolchains run only on generated fixtures, never on imported ZIPs.
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,copyFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join,dirname} from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),work=mkdtempSync(join(tmpdir(),'runly-s4-frameworks-')),out=resolve(root,'.artifacts/website-s4/corpus')
const versions={vite:'8.3.4',react:'19.3.1','react-dom':'19.3.1',vue:'3.5.44',astro:'7.3.0',next:'16.4.4','@angular/cli':'22.2.5','@angular/build':'22.2.5','@angular/core':'22.2.4','@angular/compiler':'22.2.4','@angular/compiler-cli':'22.2.4','@angular/platform-browser':'22.2.4',typescript:'6.0.3',tslib:'2.8.1',rxjs:'7.8.2'}
function write(path,text){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text)}
function copyTree(from,to){mkdirSync(to,{recursive:true});for(const item of readdirSync(from,{withFileTypes:true})){const source=join(from,item.name),dest=join(to,item.name);if(item.isDirectory())copyTree(source,dest);else copyFileSync(source,dest)}}
write(join(work,'package.json'),JSON.stringify({private:true,type:'module',dependencies:versions}))
console.log('Installing pinned fixture-only official toolchains into a new temporary directory')
execFileSync('npm.cmd',['install','--ignore-scripts','--no-audit','--no-fund'],{cwd:work,stdio:'inherit',shell:true,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',NEXT_TELEMETRY_DISABLED:'1',NG_CLI_ANALYTICS:'false'}})
const run=(tool,args,cwd)=>execFileSync(process.execPath,[join(work,'node_modules',...tool.split('/')),...args],{cwd,stdio:'inherit',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',NEXT_TELEMETRY_DISABLED:'1',NG_CLI_ANALYTICS:'false'}})
const records=[]
for(const framework of ['react','vue']){
 const dir=join(work,framework);write(join(dir,'index.html'),'<div id="app"></div><script type="module" src="/src/main.js"></script>')
 write(join(dir,'src/main.js'),framework==='react'?`import React from 'react';import{createRoot}from'react-dom/client';createRoot(document.getElementById('app')).render(React.createElement('h1',null,'S4 React OK'));`:`import{createApp,h}from'vue';createApp({render:()=>h('h1','S4 Vue OK')}).mount('#app');`)
 run('vite/bin/vite.js',['build'],dir);copyTree(join(dir,'dist'),join(out,framework));records.push({framework,versions:{vite:versions.vite,[framework]:versions[framework]},directory:framework})
}
{
 const dir=join(work,'astro');write(join(dir,'package.json'),'{"type":"module"}');write(join(dir,'src/pages/index.astro'),'<html><body><h1>S4 Astro OK</h1><a href="/about/">About</a></body></html>');write(join(dir,'src/pages/about.astro'),'<h1>S4 Astro About OK</h1>');run('astro/bin/astro.mjs',['build'],dir);copyTree(join(dir,'dist'),join(out,'astro'));records.push({framework:'astro',version:versions.astro,directory:'astro'})
}
{
 const dir=join(work,'next');write(join(dir,'package.json'),'{"private":true}');write(join(dir,'next.config.mjs'),"export default {output:'export',trailingSlash:true,experimental:{cpus:2}};")
 write(join(dir,'pages/index.jsx'),"import{useState}from'react';export default function Page(){const[n,set]=useState(0);return <><h1>S4 Next OK</h1><button onClick={()=>set(n+1)}>Count {n}</button></>}");write(join(dir,'pages/about.jsx'),"export default function About(){return <h1>S4 Next About OK</h1>}")
 run('next/dist/bin/next',['build','--webpack'],dir);copyTree(join(dir,'out'),join(out,'next'));records.push({framework:'next',version:versions.next,directory:'next'})
}
{
 const dir=join(work,'angular');write(join(dir,'package.json'),'{"private":true}');write(join(dir,'angular.json'),JSON.stringify({version:1,newProjectRoot:'projects',projects:{fixture:{projectType:'application',root:'',sourceRoot:'src',architect:{build:{builder:'@angular/build:application',options:{outputPath:'dist',index:'src/index.html',browser:'src/main.ts',tsConfig:'tsconfig.json',outputHashing:'all',sourceMap:false,optimization:true,extractLicenses:false}}}}}}))
 write(join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'preserve',moduleResolution:'bundler',experimentalDecorators:true,skipLibCheck:true,lib:['ES2022','dom']},angularCompilerOptions:{strictTemplates:true},files:['src/main.ts']}))
 write(join(dir,'src/index.html'),'<html><head><base href="/"></head><body><fixture-root></fixture-root></body></html>');write(join(dir,'src/main.ts'),"import{Component,provideZonelessChangeDetection}from'@angular/core';import{bootstrapApplication}from'@angular/platform-browser';@Component({selector:'fixture-root',standalone:true,template:'<h1>S4 Angular OK</h1>'})class App{}bootstrapApplication(App,{providers:[provideZonelessChangeDetection()]});")
 run('@angular/cli/bin/ng.js',['build','fixture'],dir);copyTree(join(dir,'dist/browser'),join(out,'angular'));records.push({framework:'angular',version:versions['@angular/core'],cli:versions['@angular/cli'],directory:'angular'})
}
write(join(out,'static/index.html'),'<link rel="stylesheet" href="/style-v1.css"><h1>S4 Static OK</h1><script src="/main-v1.js"></script>');write(join(out,'static/main-v1.js'),"document.body.dataset.script='OK'");write(join(out,'static/style-v1.css'),'body { background-color: #eeeeff; }');records.push({framework:'static',directory:'static'})
write(join(out,'matrix.json'),JSON.stringify(records,null,2));console.log(JSON.stringify({corpus:out,frameworks:records.map(r=>r.framework)}))
