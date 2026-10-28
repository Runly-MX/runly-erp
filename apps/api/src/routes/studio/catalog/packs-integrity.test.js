import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPacksProvider } from './providers/packs.js'

// The manifests pin each SVG by SHA256. Git must never rewrite their line endings: on Windows (core.eol=crlf with
// `* text=auto`) a checkout or `git archive` turned every SVG into CRLF, the hashes stopped matching and both
// collections were silently rejected. These tests reproduce a CRLF checkout on any platform.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const PACKS = 'apps/api/src/routes/studio/catalog/packs'
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const tracked = git('ls-files', '-z', '--', PACKS).split('\0').filter(Boolean)
const svgs = tracked.filter(file => file.endsWith('.svg'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

test('every illustration SVG is exempt from line-ending conversion', () => {
  assert.equal(svgs.length, 24)
  const attributes = git('check-attr', 'text', 'eol', '--', ...svgs).trim().split('\n')
  assert.equal(attributes.length, svgs.length * 2)
  for (const line of attributes) assert.match(line, /: (text: unset|eol: unspecified)$/, line)
})
test('a CRLF checkout (Windows defaults) keeps every SVG byte-identical to its manifest SHA256 and both packs load', async () => {
  const target = mkdtempSync(join(tmpdir(), 'studio-pack-checkout-'))
  try {
    // checkout-index applies the same eol/attribute conversion as a real checkout, without touching the working tree.
    git('-c', 'core.eol=crlf', '-c', 'core.autocrlf=true', 'checkout-index', `--prefix=${target.replaceAll('\\', '/')}/`, '--', ...tracked)
    let checked = 0
    for (const pack of ['open-doodles', 'open-peeps']) {
      const base = join(target, PACKS, pack), manifest = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'))
      for (const asset of manifest.assets) { assert.equal(sha256(readFileSync(join(base, asset.file))), asset.sha256, `${pack}/${asset.file}`); checked++ }
    }
    assert.equal(checked, 24)
    const provider = createPacksProvider({ dir: pathToFileURL(`${resolve(target, PACKS)}/`) })
    assert.equal(await provider.rejected(), 0)
    assert.equal((await provider.search({ q: '', page: 1 })).data.length, 24)
  } finally { rmSync(target, { recursive: true, force: true }) }
})
