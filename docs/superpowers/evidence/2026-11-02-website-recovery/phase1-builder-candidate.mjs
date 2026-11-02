// Verify a downloaded npm artifact against the ERP's installed dependency.
// Requires RUNLY_WEBSITE_BUILDER_TGZ pointing at the 0.2.4 tarball (see phase 1 plan).
// No install, package update, build scripts, network, service or database calls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

globalThis.fetch = async () => { throw new Error('Network forbidden') }
const artifact = process.env.RUNLY_WEBSITE_BUILDER_TGZ
assert.ok(artifact, 'Set RUNLY_WEBSITE_BUILDER_TGZ to the downloaded 0.2.4 .tgz')
const integrity = 'sha512-YEg7f9blG0o9Z7gml9EbS1HI4P8iarCmgclc2WSEMlGg72Uo6vuPpWp8qeGblIlU0tWmyQgIcrPJZmqHDqBuSg=='
assert.equal('sha512-' + createHash('sha512').update(readFileSync(artifact)).digest('base64'), integrity)
const readEntry = name => execFileSync('tar', ['-xOf', artifact, `package/${name}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
const manifest = JSON.parse(readEntry('package.json'))
const desktopRequire = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
const apiRequire = createRequire(new URL('../../../../apps/api/package.json', import.meta.url))
const installed = desktopRequire('@raulbellosom/atlas-web-builder')
const peerRequire = createRequire(desktopRequire.resolve('@raulbellosom/atlas-web-builder'))
function loadCjs(source, requireFn) {
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(requireFn, mod, mod.exports)
  return mod.exports
}
const candidate = loadCjs(readEntry('dist/atlas-web-builder.cjs'), peerRequire)
const React = desktopRequire('react')
const { renderToStaticMarkup } = desktopRequire('react-dom/server')
const { buildSync } = apiRequire('esbuild')
const bundle = buildSync({
  stdin: {
    contents: "export * from './apps/desktop/src/website/runlyBlocks/index.js'; export { allTemplates } from './apps/desktop/src/website/runlyTemplates/index.js';",
    resolveDir: fileURLToPath(new URL('../../../../', import.meta.url)), sourcefile: 'research-entry.js',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', define: { 'import.meta.env': '{}' }, logLevel: 'silent',
}).outputFiles[0].text
function localBlocks(builder) {
  return loadCjs(bundle, name => name === '@raulbellosom/atlas-web-builder' ? builder : desktopRequire(name))
}
const oldLocal = localBlocks(installed)
const newLocal = localBlocks(candidate)
const registry = (builder, local) => [...builder.baseBlocks, ...local.universalRunlyBlocks, ...local.ecommerceRunlyBlocks, ...local.bookingsRunlyBlocks, ...local.restaurantRunlyBlocks]
function documentFor(tree, id = 'fixture') {
  return { schemaVersion: 1, id, slug: '/', title: 'Fixture', visibility: 'public', layoutId: null, regions: { main: { id: 'main', children: tree.rootIds } }, blocks: tree.blocks, seo: {}, updatedAt: '' }
}
const normalize = doc => { const { updatedAt, ...rest } = doc; return rest }
const render = (builder, local, doc) => renderToStaticMarkup(React.createElement(builder.AtlasWebBuilderProvider, { blocks: registry(builder, local), theme: builder.defaultTheme }, React.createElement(builder.AtlasWebRenderer, { page: doc, mode: 'public' })))

test('npm artifact is exact 0.2.4, retains 79 exports, peers and CSS/ESM files', () => {
  assert.equal(installed.version, '0.2.0')
  assert.equal(candidate.version, '0.2.4')
  assert.equal(manifest.version, '0.2.4')
  assert.deepEqual(Object.keys(candidate).sort(), Object.keys(installed).sort())
  assert.equal(Object.keys(candidate).length, 79)
  for (const key of Object.keys(installed)) assert.equal(typeof candidate[key], typeof installed[key], key)
  assert.deepEqual(manifest.peerDependencies, { react: '>=18.0.0', 'react-dom': '>=18.0.0' })
  assert.deepEqual(manifest.dependencies, desktopRequire('@raulbellosom/atlas-web-builder/package.json').dependencies)
  assert.ok(readEntry('dist/style.css').length > 0)
  assert.match(readEntry('dist/atlas-web-builder.js'), /export\s*\{/)
})

test('published ESM entry transforms through existing esbuild and preserves API/render', () => {
  const esmSource = buildSync({ stdin: { contents: readEntry('dist/atlas-web-builder.js'), loader: 'js' }, write: false, format: 'cjs', platform: 'node', logLevel: 'silent' }).outputFiles[0].text
  const esm = loadCjs(esmSource, peerRequire)
  assert.deepEqual(Object.keys(esm).sort(), Object.keys(candidate).sort())
  const doc = oldLocal.allTemplates[0].pages[0].page
  assert.deepEqual(normalize(esm.parsePage(installed.serializePage(doc))), normalize(candidate.parsePage(installed.serializePage(doc))))
  assert.ok(render(esm, localBlocks(esm), doc).length > 0)
})

test('all 18 base blocks round-trip in both directions and render deterministically with React 19', () => {
  const tree = { rootIds: [], blocks: {} }
  for (const [i, block] of installed.baseBlocks.entries()) {
    const id = `fixture_${i}`
    tree.rootIds.push(id)
    tree.blocks[id] = { id, type: block.type, props: block.defaultProps, children: {} }
  }
  const doc = documentFor(tree)
  const original = installed.parsePage(installed.serializePage(doc))
  const reopened = candidate.parsePage(installed.serializePage(doc))
  assert.deepEqual(normalize(reopened), normalize(original))
  assert.deepEqual(normalize(installed.parsePage(candidate.serializePage(reopened))), normalize(original))
  const markup = render(candidate, newLocal, reopened)
  assert.ok(markup.length > 0)
  assert.equal(render(candidate, newLocal, reopened), markup)
})

let pages = 0
for (const template of oldLocal.allTemplates) {
  test(`current Runly template ${template.id}: bidirectional serialization and public renderer`, () => {
    for (const entry of template.pages) {
      const doc = entry.page
      const baseline = installed.parsePage(installed.serializePage(doc))
      const reopened = candidate.parsePage(installed.serializePage(doc))
      assert.deepEqual(normalize(reopened), normalize(baseline))
      assert.deepEqual(normalize(installed.parsePage(candidate.serializePage(reopened))), normalize(baseline))
      const markup = render(candidate, newLocal, reopened)
      assert.ok(markup.length > 0)
      assert.equal(render(candidate, newLocal, reopened), markup)
      // Both must render; markup can intentionally change between package versions.
      assert.ok(render(installed, oldLocal, baseline).length > 0)
      pages++
    }
  })
}

test('local Runly extension registry preserves block types and invalid JSON fails consistently', () => {
  assert.deepEqual(registry(candidate, newLocal).map(x => x.type), registry(installed, oldLocal).map(x => x.type))
  assert.throws(() => candidate.parsePage('{invalid'))
  assert.throws(() => installed.parsePage('{invalid'))
  assert.ok(pages > 0)
  process.stdout.write(`# corpus_documents ${pages}; base_blocks ${installed.baseBlocks.length}; React ${React.version}\n`)
})
