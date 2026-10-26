import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

export async function inspectStudioWeb(html, { forbiddenValues = [] } = {}) {
const assets = join(html, 'assets');
const filenames = await readdir(assets), studio = filenames.find(name => /^StudioScreen-.*\.js$/.test(name));
for (const name of filenames.filter(name => name.endsWith('.js'))) {
  if (!forbiddenValues.length) break;
  const code = await readFile(join(assets, name), 'utf8');
  assert.ok(!forbiddenValues.some(value => value && code.includes(value)), 'Private secret leaked into browser build');
}
assert.ok(studio, 'Studio lazy chunk missing');
const studioCode = await readFile(join(assets, studio), 'utf8');
assert.ok(studioCode.includes('fabric') && studioCode.includes('Textbox'), 'Fabric code missing from Studio chunk');
const compilerRequire = createRequire(new URL('../../packages/module-compiler/package.json', import.meta.url));
const { parse } = compilerRequire('acorn');
function sources(code) {
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }), staticImports = [], dynamicImports = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source?.value) staticImports.push(basename(node.source.value));
    if (node.type === 'ImportExpression') {
      const source = node.source;
      const value = typeof source?.value === 'string' ? source.value : source?.type === 'TemplateLiteral' && !source.expressions.length ? source.quasis[0].value.cooked : null;
      if (value) dynamicImports.push(basename(value));
    }
    for (const value of Object.values(node)) { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value); }
  };
  visit(ast); return { staticImports, dynamicImports };
}
const index = await readFile(join(html, 'index.html'), 'utf8');
const entries = [...index.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)].map(match => basename(match[1])).filter(name => filenames.includes(name));
assert.ok(entries.length, 'Web entry script missing');
const initial = new Set(), dynamic = new Set();
async function inspectInitial(name) {
  if (initial.has(name)) return;
  initial.add(name);
  const graph = sources(await readFile(join(assets, name), 'utf8'));
  graph.dynamicImports.forEach(value => dynamic.add(value));
  for (const child of graph.staticImports) if (filenames.includes(child)) await inspectInitial(child);
}
for (const entry of entries) await inspectInitial(entry);
assert.ok(!initial.has(studio), 'Studio/Fabric was eagerly bundled into the initial static graph');
// The authenticated AppEntry can itself be lazy. Follow its graph without
// treating any of those chunks as part of the initial static load.
const reachable = new Set(initial), queue = [...dynamic];
while (queue.length && !dynamic.has(studio)) {
  const name = queue.shift();
  if (reachable.has(name) || !filenames.includes(name)) continue;
  reachable.add(name);
  const graph = sources(await readFile(join(assets, name), 'utf8'));
  graph.dynamicImports.forEach(value => dynamic.add(value));
  queue.push(...graph.staticImports, ...graph.dynamicImports);
}
assert.ok(dynamic.has(studio), 'Studio is not reachable through a lazy import');
const initialCode=await Promise.all([...initial].map(name=>readFile(join(assets,name))))
return { studioChunk: studio, studioBytes: Buffer.byteLength(studioCode), studioGzipBytes:gzipSync(studioCode).length, fabric: true, lazy: true, initialChunks: initial.size,
  initialBytes:initialCode.reduce((sum,code)=>sum+code.length,0),initialGzipBytes:initialCode.reduce((sum,code)=>sum+gzipSync(code).length,0) };
}
