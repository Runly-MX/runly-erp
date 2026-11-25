// Collects the license and NOTICE texts shipped inside each production npm package (from the pnpm store layout
// in node_modules/.pnpm) into docs/THIRD_PARTY_LICENSE_TEXTS.md, grouping packages with identical text.
// Needs `pnpm install` done and docs/sbom/runly-npm-prod.cdx.json (scripts/generate-sbom.mjs).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const sbom = JSON.parse(readFileSync('docs/sbom/runly-npm-prod.cdx.json', 'utf8'))
const store = 'node_modules/.pnpm'
const dirs = readdirSync(store)
const FILE = /^(licen[sc]e|copying|notice|unlicense)(\..*)?$/i
const groups = new Map() // hash -> { text, kind, pkgs[] }
const missing = []
for (const c of sbom.components) {
  const prefix = `${c.name.replace('/', '+')}@${c.version}`
  const dir = dirs.find((d) => d === prefix || d.startsWith(prefix + '_'))
  const root = dir && join(store, dir, 'node_modules', c.name)
  const files = root && existsSync(root) ? readdirSync(root).filter((f) => FILE.test(f)) : []
  if (!files.length) { missing.push(`${c.name}@${c.version} (${c.licenses[0].license?.id ?? c.licenses[0].expression})`); continue }
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n').trim()
    if (!text) continue
    const kind = /^notice/i.test(f) ? 'NOTICE' : 'LICENSE'
    const h = createHash('sha1').update(kind + text).digest('hex')
    if (!groups.has(h)) groups.set(h, { text, kind, pkgs: [] })
    groups.get(h).pkgs.push(`${c.name}@${c.version}`)
  }
}
const parts = [...groups.values()].sort((a, b) => b.pkgs.length - a.pkgs.length).map((g) =>
  `### ${g.kind} text shared by ${g.pkgs.length} package(s)\n\n${g.pkgs.join(', ')}\n\n\`\`\`text\n${g.text}\n\`\`\``)
writeFileSync('docs/THIRD_PARTY_LICENSE_TEXTS.md', `# Third-party license and NOTICE texts (PRELIMINARY)

Texts taken verbatim from the installed production npm packages (${sbom.components.length} package versions; ${sbom.components.length - missing.length} include a license or NOTICE file). Not legal advice; not a complete distribution notice. Regenerate with scripts/generate-license-texts.mjs.

## Packages without a license file in the installed package (declared license only)

${missing.map((m) => `- ${m}`).join('\n') || '(none)'}

## Texts

${parts.join('\n\n')}
`)

// Authentic copyright lines of third parties are kept verbatim. The privacy scanner exempts, for this one file only, the exact lines whose
// sha256 is listed here (any edited line, or any other address, is still a finding). See scripts/check-repository-privacy.mjs.
const PERSONAL = /\b[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo)\.[A-Z.]+\b/i
const attribution = [...new Set([...groups.values()].flatMap((g) => g.text.split('\n')).concat(missing).filter((l) => PERSONAL.test(l)).map((l) => createHash('sha256').update(l).digest('hex')))].sort()
writeFileSync('scripts/privacy-third-party-attribution.json', JSON.stringify({ file: 'docs/THIRD_PARTY_LICENSE_TEXTS.md', lineSha256: attribution }, null, 1) + '\n')
console.log('groups', groups.size, 'missing', missing.length, 'of', sbom.components.length)
