#!/usr/bin/env node
// Builds packages/ui/src/geo-data/ from the pinned upstream export of
// dr5hn/countries-states-cities-database (ODbL-1.0): countries.json plus one <ISO2>.json per country
// ({ states: [{ isoCode, name, cities: [name] }] }). Names only; coordinates are not used by any form.
//   node scripts/geo/build-geo-dataset.mjs [path-to-json-countries+states+cities.json.gz]
// Without an argument the pinned release asset is downloaded and its sha256 verified.
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const UPSTREAM = {
  repository: 'https://github.com/dr5hn/countries-states-cities-database',
  release: 'v5.2.0-export.1',
  asset: 'json-countries+states+cities.json.gz',
  sha256: 'd748ee4faf6c8bda6c9f7f30e9126b14cb9e5fb0b6c187162a083e715479475d',
  license: 'ODbL-1.0',
}
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/ui/src/geo-data')

export function buildGeoFiles(countries) {
  const files = new Map()
  files.set('countries.json', JSON.stringify(countries.map((c) => ({ isoCode: c.iso2, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))))
  for (const c of countries) {
    const states = (c.states ?? []).map((s) => ({ isoCode: s.iso2, name: s.name, cities: (s.cities ?? []).map((t) => t.name) }))
    files.set(`${c.iso2}.json`, JSON.stringify({ states }))
  }
  return files
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2]
  const gz = arg ? readFileSync(arg) : Buffer.from(await (await fetch(`${UPSTREAM.repository}/releases/download/${UPSTREAM.release}/${UPSTREAM.asset}`)).arrayBuffer())
  const sha = createHash('sha256').update(gz).digest('hex')
  if (sha !== UPSTREAM.sha256) throw new Error(`sha256 mismatch: ${sha}`)
  const files = buildGeoFiles(JSON.parse(gunzipSync(gz)))
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  for (const [name, text] of files) writeFileSync(join(OUT, name), text)
  writeFileSync(join(OUT, 'NOTICE.md'), `# Geographic data

Contains information from Countries States Cities Database (${UPSTREAM.repository}), which is made available here under the Open Database License (ODbL) 1.0 (https://opendatacommons.org/licenses/odbl/1-0/).

- Release: ${UPSTREAM.release}, asset ${UPSTREAM.asset} (sha256 ${UPSTREAM.sha256}).
- These files are a derived database (names and ISO codes only) and remain available under the ODbL.
- Upstream notices for its own sources (OpenStreetMap contributors, Wikidata, national statistics offices): see NOTICE-SOURCES.txt in the upstream release.
- Regenerate with scripts/geo/build-geo-dataset.mjs.
`)
  console.log(`${files.size} files written to ${OUT}`)
}
