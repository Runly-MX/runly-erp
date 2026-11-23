// Generates apps/api/src/routes/website/block-catalog.json from the Website
// builder blocks (package base blocks + apps/desktop runlyBlocks). The API and
// the MCP website adapter validate AI-generated pages against this snapshot.
// Run after adding or changing a block:
//   node scripts/generate-website-block-catalog.mjs
import { writeFile } from 'node:fs/promises';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const desktopRoot = resolve(root, 'apps/desktop');
const requireDesktop = createRequire(resolve(desktopRoot, 'package.json'));
const { build } = createRequire(new URL('../apps/api/package.json', import.meta.url))('esbuild');

function field(definition) {
  const out = { type: definition.type, label: definition.label ?? '' };
  if (Array.isArray(definition.options)) out.options = definition.options.map(option => (option && typeof option === 'object' ? String(option.value) : String(option)));
  for (const key of ['min', 'max', 'step']) if (definition[key] !== undefined) out[key] = definition[key];
  return out;
}

{
  const builder = requireDesktop('@raulbellosom/atlas-web-builder');
  const bundle = await build({ entryPoints: [resolve(root, 'packages/website-blocks/src/index.js')], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent' });
  const filename = resolve(desktopRoot, '.website-catalog.cjs'), compiled = new Module(filename);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(dirname(filename));
  compiled._compile(bundle.outputFiles[0].text, filename);
  const runly = compiled.exports;
  const groups = [['base', builder.baseBlocks], ['universal', runly.universalRunlyBlocks], ['ecommerce', runly.ecommerceRunlyBlocks], ['bookings', runly.bookingsRunlyBlocks], ['restaurant', runly.restaurantRunlyBlocks]];
  const blocks = [];
  for (const [group, list] of groups) {
    for (const block of list) {
      // The picker stores this renderer flag without exposing it as an Inspector control.
      const fields = block.type === 'ImageBlock' && 'vector' in block.defaultProps ? { ...block.fields, vector: { type: 'toggle', label: 'Imagen vectorial (SVG)' } } : block.fields;
      blocks.push({
        type: block.type, label: block.label ?? block.type, category: block.category ?? null, group,
        slots: Object.keys(block.slots ?? {}),
        defaultProps: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(block.defaultProps ?? {}).filter(([key]) => key in (fields ?? {}))))),
        fields: Object.fromEntries(Object.entries(fields ?? {}).map(([key, definition]) => [key, field(definition)])),
      });
    }
  }
  const catalog = { generatedBy: 'scripts/generate-website-block-catalog.mjs', schemaVersion: builder.CURRENT_SCHEMA_VERSION, blocks };
  await writeFile(new URL('../apps/api/src/routes/website/block-catalog.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`block-catalog.json: ${blocks.length} blocks`);
}
