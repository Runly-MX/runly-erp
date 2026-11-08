// Regenerates packages/studio-interchange/corpus/ (functional archives + expected diagnostics)
// from the same builders the tests use. Run after changing a validator or the website block catalog:
//   node scripts/write-interchange-corpus.mjs
// The test suite fails when the committed corpus no longer matches what the builders produce.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILDER, studioCorpus, websiteCorpus } from '../packages/studio-interchange/src/__tests__/corpus.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/studio-interchange/corpus')
const cases = { ...(await studioCorpus()), ...(await websiteCorpus()) }
await rm(root, { recursive: true, force: true })
const expected = {}
for (const [name, { bytes, expect }] of Object.entries(cases)) {
  await mkdir(dirname(resolve(root, name)), { recursive: true })
  await writeFile(resolve(root, name), bytes)
  expected[name] = expect
}
await writeFile(resolve(root, 'expected.json'), `${JSON.stringify({ websiteBuilder: BUILDER, cases: expected }, null, 2)}\n`)
console.log(`${Object.keys(cases).length} corpus archives written to ${root}`)
