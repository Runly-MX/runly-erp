// Validate local Docker artifacts without starting the API entrypoint or jobs.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inspectStudioWeb } from './lib/studio-web-verification.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), images = {};
for (let n = 0; n < args.length; n += 2) {
  const key = args[n]?.slice(2), value = args[n + 1];
  if (!['api', 'web', 'worker'].includes(key) || !value || value.startsWith('-') || images[key]) throw Error('USE_API_WEB_WORKER_IMAGE_ARGUMENTS');
  images[key] = value;
}
if (Object.keys(images).length !== 3) throw Error('THREE_LOCAL_VALIDATION_IMAGES_REQUIRED');
const output = resolve(root, '.artifacts/studio/deployment');
await mkdir(output, { recursive: true });
const docker = (args, input) => execFileSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true, input, maxBuffer: 32 * 1024 * 1024 });
const runtime = String.raw`
import {createRequire,isBuiltin} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire('/app/packages/module-compiler/package.json');
const {parse}=require('acorn');
const visited=new Set();let imports=0;
function walkAst(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(v=>walkAst(v,visit));else if(value&&typeof value==='object')walkAst(value,visit)}}
function inspect(file){
 if(visited.has(file))return;visited.add(file);
 const ast=parse(readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
 const specs=[];walkAst(ast,node=>{if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration','ImportExpression'].includes(node.type))return;const source=node.source;const value=typeof source?.value==='string'?source.value:source?.type==='TemplateLiteral'&&!source.expressions.length?source.quasis[0].value.cooked:null;if(value)specs.push(value)});
 for(const spec of specs){if(isBuiltin(spec))continue;imports++;const target=import.meta.resolve(spec,pathToFileURL(file).href);if(!target.startsWith('file:'))continue;const path=fileURLToPath(target);assert.ok(existsSync(path),'Missing runtime import: '+spec+' from '+file);if(/^\/app\/(apps|packages)\//.test(path)&&/\.[cm]?js$/.test(path))inspect(path)}
}
inspect(process.env.RUNLY_VALIDATE_ENTRY);
await import('./apps/api/src/routes/studio/index.js');
for(const spec of ['@runly/core','@runly/sdk','@runly/module-engine','@runly/module-compiler'])await import(spec);
await import(import.meta.resolve('@runly/preview-runtime/contracts',pathToFileURL('/app/apps/desktop/package.json').href));
const apiRequire=createRequire('/app/apps/api/package.json');
const sharp=apiRequire('sharp');
const png=await sharp({create:{width:2,height:2,channels:4,background:'#ffffff'}}).png().toBuffer({resolveWithObject:true});assert.equal(png.info.format,'png');
const prisma=apiRequire('@prisma/client');assert.equal(typeof prisma.PrismaClient,'function');
console.log(JSON.stringify({node:process.version,platform:process.platform,architecture:process.arch,localModules:visited.size,imports,studioRoute:true,sharedPackages:true,prisma:true,sharpPng:true}));
`;
const results = {};
const skipBootstrap = String.raw`
set -eu
mkdir -p /tmp/runly-validate-bin
cat > /tmp/runly-validate-bin/pnpm <<'STUB'
#!/bin/sh
if [ "$*" = "--filter @runly/api start" ]; then echo API_START_VALIDATED; else exit 92; fi
STUB
cat > /tmp/runly-validate-bin/node <<'STUB'
#!/bin/sh
exit 91
STUB
chmod +x /tmp/runly-validate-bin/pnpm /tmp/runly-validate-bin/node
PATH="/tmp/runly-validate-bin:$PATH" RUNLY_SKIP_DB_INIT=1 /entrypoint.sh
`;
const skipOutput = docker(['run', '--rm', '--pull=never', '--network', 'none', '--entrypoint', 'sh', images.api, '-c', skipBootstrap]);
assert.ok(skipOutput.includes('API_START_VALIDATED') && skipOutput.includes('Skipping migrations and seed'));
for (const key of ['api', 'worker']) {
  const entry = `/app/apps/${key}/src/index.js`;
  const raw = docker(['run', '--rm', '-i', '--pull=never', '--network', 'none', '--entrypoint', 'node', '-e', `RUNLY_VALIDATE_ENTRY=${entry}`,
    images[key], '--experimental-import-meta-resolve', '--input-type=module', '-'], runtime);
  results[key] = JSON.parse(raw.trim().split('\n').at(-1));
}
results.api.bootstrapSkipped = true;

const artifact = await mkdtemp(join(output, 'web-image-'));
const container = docker(['create', '--pull=never', '--network', 'none', images.web]).trim();
try { docker(['cp', `${container}:/usr/share/nginx/html`, artifact]); }
finally { docker(['rm', container]); }
const html = join(artifact, 'html');
results.web = await inspectStudioWeb(html);
await writeFile(join(output, 'image-verification.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
