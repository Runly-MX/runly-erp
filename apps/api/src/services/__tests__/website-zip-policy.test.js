import {test} from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {inspectWebsiteZip,zipArtifactPath,validateStaticReferences,STATIC_ZIP_POLICY} from '../website-zip-policy.js'
import {validateWebsiteZipReferences} from '../website-zip-references.js'
const archive=async files=>{const zip=new JSZip();for(const [path,body]of Object.entries(files))zip.file(path,body);return zip.generateAsync({type:'nodebuffer',compression:'STORE'})}
for(const path of ['../escape','/absolute','C:/drive','\\server\\file','a\\b','a//b','a/./b','a/../b','a%2fb','a:b','a\0b','AUX.txt','nested/COM1','a.','a ','a?b','unicode/\u00e1.png'])test(`raw archive path rejected: ${JSON.stringify(path)}`,()=>assert.throws(()=>zipArtifactPath(path)))
test('ZIP root is explicit and a wrapper never truncates outside entries',async()=>{
 const valid=await inspectWebsiteZip(await archive({'dist/index.html':'ok','dist/assets/a.js':'ok'}));assert.equal(valid.files[1].path,'assets/a.js')
 await assert.rejects(inspectWebsiteZip(await archive({'dist/index.html':'ok','outside.txt':'no'})),e=>e.code==='archive_root_mismatch')
 await assert.rejects(inspectWebsiteZip(await archive({'a/index.html':'a','b/index.html':'b'})),e=>e.code==='ambiguous_archive_root')
})
for(const path of ['.env','server.js','package.json','x.map','src/a.ts','node_modules/x.js','.next/server.js','private.pem','backup.zip','app/index.html'])test(`private/server archive file rejected: ${path}`,async()=>await assert.rejects(inspectWebsiteZip(await archive({'index.html':'ok',[path]:'private'}))))
test('original path, case collisions, symlinks, CRC and truncation fail closed',async()=>{
 await assert.rejects(inspectWebsiteZip(await archive({'index.html':'ok','A.js':'a','a.js':'b'})),e=>e.code==='duplicate_archive_path')
 await assert.rejects(inspectWebsiteZip(await archive({'index.html':'ok','../escape.txt':'no'})))
 const symlink=new JSZip();symlink.file('index.html','ok');symlink.file('link','target',{unixPermissions:0o120777});await assert.rejects(inspectWebsiteZip(await symlink.generateAsync({type:'nodebuffer',platform:'UNIX'})))
 const bad=await archive({'index.html':'unique corrupt text'});bad[bad.indexOf('unique corrupt text')]=33;await assert.rejects(inspectWebsiteZip(bad),e=>e.code==='archive_integrity_failed')
 await assert.rejects(inspectWebsiteZip(bad.subarray(0,-10)))
})
test('both declared and streamed expansion budgets are enforced',async()=>{
 const zip=new JSZip();zip.file('index.html','x'.repeat(200000));await assert.rejects(inspectWebsiteZip(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})),e=>e.code==='archive_expansion_limit')
 await assert.rejects(inspectWebsiteZip(await archive({'index.html':'large'}),{limits:{...STATIC_ZIP_POLICY,entry:2}}),e=>e.status===413)
 await assert.rejects(inspectWebsiteZip(await archive({'index.html':'a','one.js':'b'}),{limits:{...STATIC_ZIP_POLICY,files:1}}),e=>e.code==='archive_file_limit')
})
test('static references reject missing files, external dependencies and Node imports without rewriting bytes',()=>{
 const files=[{path:'index.html',mime:'text/html'},{path:'assets/main.js',mime:'text/javascript'},{path:'assets/part.js',mime:'text/javascript'}]
 const texts=new Map([['index.html','<script type="module" src="/assets/main.js"></script>'],['assets/main.js','import "./part.js"']]);validateStaticReferences(files,texts)
 for(const value of ['import "./missing.js"','import "react"','import "node:fs"']){texts.set('assets/main.js',value);assert.throws(()=>validateStaticReferences(files,texts))}
 texts.set('assets/main.js','');texts.set('index.html','<script src="https://untrusted.example/evil.js"></script>');assert.throws(()=>validateStaticReferences(files,texts))
})
test('central-directory overlap and encrypted members are rejected before publication',async()=>{
 const bytes=await archive({'index.html':'first','other.js':'second'}),first=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])),second=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),first+4)
 const overlap=Buffer.from(bytes);overlap.writeUInt32LE(bytes.readUInt32LE(first+42),second+42);await assert.rejects(inspectWebsiteZip(overlap))
 const encrypted=Buffer.from(bytes);encrypted.writeUInt16LE(encrypted.readUInt16LE(first+8)|1,first+8);await assert.rejects(inspectWebsiteZip(encrypted),e=>e.status===422)
})
test('reference parsing has a terminable CPU budget and a later validation still succeeds',async()=>{
 const files=[{path:'main.js',mime:'text/javascript'}],texts=new Map([['main.js','import '+ ' '.repeat(1000000)]])
 await assert.rejects(validateWebsiteZipReferences(files,texts,{timeout:1}),e=>e.code==='archive_timeout'&&e.status===413)
 await validateWebsiteZipReferences([{path:'index.html',mime:'text/html'}],new Map([['index.html','<h1>valid</h1>']]))
})
