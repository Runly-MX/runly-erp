// Generates apps/api/src/routes/website/block-catalog.json from the Website
// builder blocks (package base blocks + apps/desktop runlyBlocks). The API and
// the MCP website adapter validate AI-generated pages against this snapshot.
// Run after adding or changing a block:
//   node scripts/generate-website-block-catalog.mjs
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const desktopRoot = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const { createServer } = await import(pathToFileURL(createRequire(`${desktopRoot}package.json`).resolve('vite')).href);
const server = await createServer({ root: desktopRoot, configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } });

function field(definition) {
  const out = { type: definition.type, label: definition.label ?? '' };
  if (Array.isArray(definition.options)) out.options = definition.options.map(option => (option && typeof option === 'object' ? String(option.value) : String(option)));
  for (const key of ['min', 'max', 'step']) if (definition[key] !== undefined) out[key] = definition[key];
  return out;
}

try {
  const builder = await server.ssrLoadModule('@raulbellosom/atlas-web-builder');
  const runly = await server.ssrLoadModule('/src/website/runlyBlocks/index.js');
  const groups = [['base', builder.baseBlocks], ['universal', runly.universalRunlyBlocks], ['ecommerce', runly.ecommerceRunlyBlocks], ['bookings', runly.bookingsRunlyBlocks], ['restaurant', runly.restaurantRunlyBlocks]];
  const blocks = [];
  for (const [group, list] of groups) {
    for (const block of list) {
      blocks.push({
        type: block.type, label: block.label ?? block.type, category: block.category ?? null, group,
        slots: Object.keys(block.slots ?? {}),
        defaultProps: JSON.parse(JSON.stringify(block.defaultProps ?? {})),
        fields: Object.fromEntries(Object.entries(block.fields ?? {}).map(([key, definition]) => [key, field(definition)])),
      });
    }
  }
  const catalog = { generatedBy: 'scripts/generate-website-block-catalog.mjs', schemaVersion: builder.CURRENT_SCHEMA_VERSION, blocks };
  await writeFile(new URL('../apps/api/src/routes/website/block-catalog.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`block-catalog.json: ${blocks.length} blocks`);
} finally {
  await server.close();
}
