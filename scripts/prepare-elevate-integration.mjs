// Private fixture only. Reuse native Atlas properties; never ship prototype HTML as a template.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectWebsiteTemplate} from '../packages/studio-interchange/src/website-template.js';
import {exportWebsiteTemplate} from '../packages/studio-interchange/src/website-write.js';
import {BLOCK_CATALOG} from '../apps/api/src/routes/website/page-document.js';
const input=process.argv[2]??'.artifacts/website-w3/website.elevate-wellness-v2.zip',folder='.artifacts/website-integration';
const catalogs={'0.3.5':BLOCK_CATALOG},before=await inspectWebsiteTemplate(await readFile(input),{builderCatalogs:catalogs});assert(before.ok);
const {content,manifest}=before;
function restyle(section){
 if(section.type==='HeadingBlock')Object.assign(section.props,{weight:'800',lineHeight:'1.2',letterSpacing:'-0.05em'});
 if(section.type==='ImageBlock')section.props.radius='lg';
 for(const children of Object.values(section.children??{}))for(const child of children)restyle(child);
}
const pages=structuredClone(content.pages);for(const p of pages)for(const section of p.sections)restyle(section);
const result=await exportWebsiteTemplate({title:manifest.title,summary:manifest.summary,locale:manifest.locale,siteKind:manifest.siteKind,builderVersion:'0.3.5',catalog:BLOCK_CATALOG,pages,theme:{...content.theme,fonts:{body:'Inter',heading:'Inter'}},assets:content.assets.map(a=>({mime:a.mime,license:a.license,data:a.data})),licenses:content.licenses});
const after=await inspectWebsiteTemplate(result.bytes,{builderCatalogs:catalogs});assert(after.ok,JSON.stringify(after.errors));
assert.deepEqual(after.content.assets.map(a=>a.sha256).sort(),content.assets.map(a=>a.sha256).sort());assert.deepEqual(after.content.licenses,content.licenses);
assert.equal(after.report.pages.reduce((n,p)=>n+p.blocks,0),133);assert.equal(after.content.assets.length,16);assert(after.warnings.some(w=>w.code==='license_unknown'));
await mkdir(folder,{recursive:true});await writeFile(folder+'/website.elevate-wellness-v2.zip',result.bytes);await writeFile(folder+'/fixture.json',JSON.stringify({sha256:createHash('sha256').update(result.bytes).digest('hex'),bytes:result.bytes.length,blocks:133,assets:16,license:'license_unknown',changes:['native heading weight/line-height/tracking','native image radius','portable Inter font tokens'],catalog:manifest.builder.catalogDigest},null,2));
console.log(JSON.stringify({ok:true,folder,bytes:result.bytes.length}));
