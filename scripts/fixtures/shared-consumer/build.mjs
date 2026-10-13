import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
const root = realpathSync(process.cwd());
mkdirSync('dist', { recursive: true });
const result = await build({ entryPoints: ['browser-contract.jsx'], bundle: true, jsx: 'automatic',
  platform: 'browser', format: 'esm', target: 'chrome120', outdir: 'dist', metafile: true,
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl', '.gif': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
for (const file of Object.keys(result.metafile.inputs)) {
  const actual = realpathSync(resolve(file));
  assert.ok(actual.startsWith(root + sep), 'Build input escaped the isolated consumer');
}
const inputs = Object.keys(result.metafile.inputs).map(f => f.replaceAll('\\', '/'));
const singletons = {};
for (const name of ['react', 'react-dom', '@tanstack/react-query']) {
  const roots = new Set(inputs.filter(f => f.includes(`/node_modules/${name}/`))
    .map(f => realpathSync(resolve(f.slice(0, f.indexOf(`/node_modules/${name}/`) + `/node_modules/${name}`.length)))));
  assert.equal(roots.size, 1, `Expected one implementation of ${name}`);
  singletons[name] = 1;
}
assert.ok(Object.keys(result.metafile.outputs).some(f => f.endsWith('.css')), 'CSS exports must produce an output');
writeFileSync('dist/index.html', '<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/browser-contract.css"></head><body><div id="root"></div><script type="module" src="/browser-contract.js"></script></body></html>');
writeFileSync('build-result.json', JSON.stringify({ isolatedInputs: inputs.length, singletons, css: true }));
console.log('Browser bundle uses only isolated consumer inputs, one React/ReactDOM/Query and exported CSS');
