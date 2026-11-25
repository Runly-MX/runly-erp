// Generates CycloneDX 1.5 SBOMs from lockfiles (no network, no extra tools):
//   docs/sbom/runly-npm-prod.cdx.json   production npm closure (pnpm licenses list --prod) + lockfile integrity hashes
//   docs/sbom/runly-desktop-cargo.cdx.json   Tauri shell crates from Cargo.lock (names, versions, checksums; licenses NOT resolved)
// This lists components; it is not a statement about what each distributed artifact contains.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const spec = (components, name, note) => ({
  bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
  metadata: { component: { type: 'application', name }, properties: [{ name: 'runly:scope', value: note }] },
  components,
})
mkdirSync('docs/sbom', { recursive: true })

// npm
const lock = readFileSync('pnpm-lock.yaml', 'utf8')
const integrity = new Map()
for (const m of lock.matchAll(/^  '?([^\n']+?)'?:\n    resolution: \{integrity: (sha512-[^,}]+)/gm)) integrity.set(m[1], m[2])
const licenses = JSON.parse(execSync('pnpm licenses list --prod --json', { maxBuffer: 1 << 28 }).toString())
const npm = []
for (const [license, pkgs] of Object.entries(licenses)) {
  for (const p of pkgs) {
    for (const version of p.versions) {
      const key = `${p.name}@${version}`
      const sri = integrity.get(key)
      const spdx = /^[A-Za-z0-9.+-]+$/.test(license) && license !== 'Unknown'
      npm.push({
        type: 'library', 'bom-ref': `pkg:npm/${p.name}@${version}`, name: p.name, version, purl: `pkg:npm/${encodeURIComponent(p.name).replace('%40', '%40')}@${version}`.replace('%2F', '/'),
        licenses: spdx ? [{ license: { id: license } }] : [{ expression: license === 'Unknown' ? 'NOASSERTION' : license }],
        ...(sri ? { hashes: [{ alg: 'SHA-512', content: Buffer.from(sri.slice(7), 'base64').toString('hex') }] } : {}),
      })
    }
  }
}
npm.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']))
writeFileSync('docs/sbom/runly-npm-prod.cdx.json', JSON.stringify(spec(npm, 'runly-npm-production', 'npm production dependency closure from pnpm-lock.yaml; not the shipped bundles'), null, 1))

// cargo: with CARGO_METADATA=<file from `cargo metadata --format-version 1 --locked --filter-platform x86_64-pc-windows-msvc`> the
// crates carry their declared licenses; without it only Cargo.lock names, versions and checksums are listed.
const meta = process.env.CARGO_METADATA ? JSON.parse(readFileSync(process.env.CARGO_METADATA, 'utf8')) : null
const declared = new Map((meta?.packages ?? []).map((p) => [`${p.name}@${p.version}`, p.license]))
const lic = (name, version) => {
  if (!meta) return {}
  const l = declared.get(`${name}@${version}`)
  if (!l) return { licenses: [{ expression: 'NOASSERTION' }] }
  return { licenses: [{ expression: l.replace(/\//g, ' OR ') }] }
}
const crates = readFileSync('apps/desktop/src-tauri/Cargo.lock', 'utf8').split('[[package]]').slice(1)
  .map((b) => ({ name: /name = "(.*)"/.exec(b)?.[1], version: /version = "(.*)"/.exec(b)?.[1], source: /source = "(.*)"/.exec(b)?.[1], sum: /checksum = "(.*)"/.exec(b)?.[1] }))
  .filter((c) => c.source)
  .map((c) => ({ type: 'library', 'bom-ref': `pkg:cargo/${c.name}@${c.version}`, name: c.name, version: c.version, purl: `pkg:cargo/${c.name}@${c.version}`, ...lic(c.name, c.version), ...(c.sum ? { hashes: [{ alg: 'SHA-256', content: c.sum }] } : {}) }))
  .sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']))
writeFileSync('docs/sbom/runly-desktop-cargo.cdx.json', JSON.stringify(spec(crates, 'runly-desktop-cargo', 'Cargo.lock registry crates of the Tauri shell' + (meta ? '; licenses from cargo metadata (declared, all platforms)' : '; licenses unresolved')), null, 1))
console.log('npm components', npm.length, 'with hash', npm.filter((c) => c.hashes).length, '| cargo', crates.length)
