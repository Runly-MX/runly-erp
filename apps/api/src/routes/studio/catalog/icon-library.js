import { readFileSync, readdirSync } from 'node:fs'
import { iconGeometry } from '../../../../../shared/studio/svg-geometry.js'
import { iconSource } from '../../../../../shared/studio/licenses.js'
import { expandWord, meaningfulWords } from './icon-synonyms.js'

// Local Tabler (MIT) and Lucide (ISC) library read from the pinned npm packages.
// Only a light index (id + searchable text) lives in memory; each SVG is read on demand
// from disk, validated by the strict geometry grammar and never sent to the browser as SVG.
const ROOT = new URL('../../../../node_modules/', import.meta.url)
const PAGE_SIZE = 32
const LIBRARIES = {
  tabler: { package: '@tabler/icons/', license: 'MIT' },
  lucide: { package: 'lucide-static/', license: 'ISC' },
}
const packageFile = (collection, path) => new URL(`${LIBRARIES[collection].package}${path}`, ROOT)
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const exclusions = () => JSON.parse(readFileSync(new URL('./icon-library.exclusions.json', import.meta.url), 'utf8'))

let loaded
function load() {
  if (loaded) return loaded
  const excluded = exclusions(), versions = {}, indexes = {}
  for (const [collection, library] of Object.entries(LIBRARIES)) {
    const manifest = JSON.parse(readFileSync(packageFile(collection, 'package.json'), 'utf8'))
    if (manifest.license !== library.license) throw new Error(`Licencia inesperada en ${library.package}`)
    versions[collection] = manifest.version
    const skip = new Set(excluded[collection] ?? []), rows = []
    if (collection === 'tabler') {
      const icons = JSON.parse(readFileSync(packageFile(collection, 'icons.json'), 'utf8'))
      for (const [name, row] of Object.entries(icons)) {
        const text = normalize(`${name} ${(row.tags ?? []).join(' ')} ${row.category ?? ''}`)
        if (row.styles?.outline && !skip.has(name)) rows.push({ id: `tabler:${name}`, name, style: 'outline', text })
        if (row.styles?.filled && !skip.has(`${name}-filled`)) rows.push({ id: `tabler:${name}-filled`, name: `${name}-filled`, style: 'filled', text })
      }
    } else {
      const tags = JSON.parse(readFileSync(packageFile(collection, 'tags.json'), 'utf8'))
      for (const file of readdirSync(packageFile(collection, 'icons/'))) {
        const name = file.endsWith('.svg') ? file.slice(0, -4) : ''
        if (name && /^[a-z0-9][a-z0-9-]{0,79}$/.test(name) && !skip.has(name)) rows.push({ id: `lucide:${name}`, name, style: 'outline', text: normalize(`${name} ${(tags[name] ?? []).join(' ')}`) })
      }
    }
    rows.sort((a, b) => a.name.localeCompare(b.name))
    indexes[collection] = { rows, byId: new Map(rows.map(row => [row.id, row])) }
  }
  return loaded = { versions, indexes }
}

// Compact arc flags ("a1 1 0 00.5.5") are valid SVG but not for the strict path grammar.
export function expandPath(d) {
  const number = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/
  let out = '', i = 0, command = '', argument = 0
  while (i < d.length) {
    const char = d[i]
    if (/[mMlLhHvVcCsSqQtTaAzZ]/.test(char)) { command = char; argument = 0; out += char; i++; continue }
    if (/[\s,]/.test(char)) { out += ' '; i++; continue }
    if (/[aA]/.test(command) && [3, 4].includes(argument % 7) && /[01]/.test(char)) { out += `${char} `; i++; argument++; continue }
    const match = d.slice(i).match(number)
    if (!match) throw new Error('Ruta no compatible')
    out += `${match[0]} `; i += match[0].length; argument++
  }
  return out.replace(/\s+/g, ' ').trim()
}
export function iconBody(svg, filled) {
  const clean = svg.replace(/<!--[\s\S]*?-->/g, '')
  const inner = clean.slice(clean.indexOf('>') + 1, clean.lastIndexOf('</svg>'))
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
    .replace(/\bd="([^"]*)"/g, (_, d) => `d="${expandPath(d)}"`)
  return filled ? `<g fill="currentColor">${inner}</g>` : `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${inner}</g>`
}
const svgFile = (row, collection) => collection === 'tabler'
  ? packageFile(collection, `icons/${row.style}/${row.style === 'filled' ? row.name.slice(0, -7) : row.name}.svg`)
  : packageFile(collection, `icons/${row.name}.svg`)
const geometryOf = (row, collection) => iconGeometry(iconBody(readFileSync(svgFile(row, collection), 'utf8'), row.style === 'filled'), 24, 24)

export const libraryVersions = () => ({ ...load().versions })
export function searchLibrary(collection, q, page) {
  const { rows } = load().indexes[collection]
  // Each typed word may match itself, its singular form or its English equivalents (Spanish search).
  const words = meaningfulWords(q).map(expandWord)
  const rank = (row, variants) => Math.min(...variants.map(v => row.name === v ? 0 : row.name.startsWith(v) ? 1 : row.name.includes(v) ? 2 : 3))
  const scored = words.length ? rows.flatMap(row => {
    if (!words.every(variants => variants.some(v => row.text.includes(v)))) return []
    return [{ row, rank: rank(row, words[0]) }]
  }).sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name)).map(item => item.row) : rows
  const start = (page - 1) * PAGE_SIZE
  return { data: scored.slice(start, start + PAGE_SIZE).map(row => ({ ...iconSource(row.id), local: true })), hasNext: start + PAGE_SIZE < scored.length, total: scored.length }
}
export function libraryIcon(id) {
  const source = iconSource(id)
  if (!source) return null
  const collection = id.split(':')[0], row = load().indexes[collection].byId.get(id)
  if (!row) return null
  try { return { resource: { ...source, local: true }, geometry: geometryOf(row, collection) } } catch { return null }
}
// Used by the generator script and by the test that keeps the exclusion list in step with the pinned versions.
export function auditLibrary() {
  const result = {}
  for (const collection of Object.keys(LIBRARIES)) {
    const names = new Set(), files = []
    if (collection === 'tabler') {
      for (const style of ['outline', 'filled']) for (const file of readdirSync(packageFile(collection, `icons/${style}/`))) files.push({ style, name: file.slice(0, -4) })
    } else for (const file of readdirSync(packageFile(collection, 'icons/'))) if (file.endsWith('.svg')) files.push({ style: 'outline', name: file.slice(0, -4) })
    for (const { style, name } of files) {
      const id = style === 'filled' ? `${name}-filled` : name
      try { iconGeometry(iconBody(readFileSync(svgFile({ style, name: id }, collection), 'utf8'), style === 'filled'), 24, 24) } catch { names.add(id) }
    }
    result[collection] = [...names].sort()
  }
  return result
}
