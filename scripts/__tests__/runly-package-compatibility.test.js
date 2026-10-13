import { test } from 'node:test'
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import viteConfig from '../../apps/desktop/vite.config.js'
import { BUNDLE_EXTERNALS } from '../../apps/api/src/services/module-bundler-service.js'

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const { build } = requireApi('esbuild')

test('legacy and Runly workspace imports resolve to the same implementation', async () => {
  for (const name of ['core', 'module-engine', 'sdk', 'ui', 'validators', 'offline']) {
    const current = realpathSync(fileURLToPath(import.meta.resolve(`@runly/${name}`)))
    const legacy = realpathSync(fileURLToPath(import.meta.resolve(`@atlas/${name}`)))
    assert.equal(current, legacy, name)
  }
  for (const [name, currentName, legacyName] of [
    ['core', 'RunlyEventBus', 'AtlasEventBus'],
    ['module-engine', 'defineRunlyModule', 'defineAtlasModule'],
    ['sdk', 'createRunlyClient', 'createAtlasClient'],
  ]) {
    const current = await import(`@runly/${name}`)
    const legacy = await import(`@atlas/${name}`)
    assert.equal(typeof current[currentName], 'function')
    assert.equal(current, legacy, `${name} must share the module instance`)
    assert.equal(current[currentName], legacy[legacyName])
  }
})

test('dynamic bundles accept mixed package scopes and both importmaps share shim URLs', async () => {
  const specifiers = ['@atlas/ui', '@runly/ui', '@atlas/sdk', '@runly/sdk', '@atlas/validators', '@runly/validators']
  const { outputFiles, metafile } = await build({
    stdin: {
      contents: specifiers.map((name, index) => `import * as dep${index} from '${name}'; export { dep${index} };`).join('\n'),
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    bundle: true,
    write: false,
    format: 'esm',
    external: BUNDLE_EXTERNALS,
    metafile: true,
  })
  assert.ok(outputFiles[0].text.length > 0)
  const imports = Object.values(metafile.outputs).flatMap((output) => output.imports)
  assert.deepEqual(imports.map((entry) => entry.path).sort(), [...specifiers].sort())
  assert.ok(imports.every((entry) => entry.external))

  for (const mode of ['serve', 'build']) {
    const plugin = viteConfig.plugins.flat().find((entry) => entry.apply === mode && entry.transformIndexHtml)
    assert.ok(plugin, `missing ${mode} importmap`)
    if (plugin.configResolved) plugin.configResolved({ base: '/erp/' })
    const tags = plugin.transformIndexHtml.handler()
    const map = JSON.parse(tags.find((tag) => tag.attrs.type === 'importmap').children).imports
    for (const external of BUNDLE_EXTERNALS) assert.ok(map[external], `${mode}: ${external}`)
    for (const name of ['ui', 'sdk', 'validators']) {
      assert.equal(map[`@atlas/${name}`], map[`@runly/${name}`])
      assert.ok(map[`@runly/${name}`].startsWith(mode === 'serve' ? '/src/shims/' : '/erp/shims/'))
    }
  }
})

test('public UI entrypoints expose all documented legacy renderer names in a browser bundle', async () => {
  const pairs = ['Table', 'Form', 'Detail', 'CrudView', 'CardView']
  const result = await build({
    stdin: { resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
      contents: `import { ${pairs.flatMap(name => [`Runly${name}`, `Atlas${name}`]).join(', ')} } from '@runly/ui';
        import { AtlasTable as LegacyScopeTable } from '@atlas/ui';
        export const aliases = [${pairs.map(name => `Runly${name} === Atlas${name}`).join(', ')}, RunlyTable === LegacyScopeTable];` },
    bundle: true, write: false, format: 'esm', platform: 'browser', outdir: 'ignored-consumer-build',
    external: BUNDLE_EXTERNALS.filter(name => !['@runly/ui', '@atlas/ui'].includes(name)),
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
    metafile: true, logLevel: 'silent',
  })
  assert.ok(Object.values(result.metafile.outputs).some(output => output.exports.includes('aliases')))
  assert.equal(Object.keys(result.metafile.inputs).filter(path => /packages[\\/]ui[\\/]src[\\/]index\.js$/.test(path)).length, 1)
})
