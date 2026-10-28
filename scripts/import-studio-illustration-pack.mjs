// Builds a Studio illustration pack from the official download buttons of a CC0 collection.
//   node scripts/import-studio-illustration-pack.mjs open-doodles 12
//   node scripts/import-studio-illustration-pack.mjs open-peeps 12
// It only follows links published by the official page (no mirrors), keeps the first N files that pass the
// same strict SVG check the server applies, and records source URL, SHA256 and a snapshot of the license
// statement. Review the diff of packs/<id>/ before committing; nothing is uploaded anywhere.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeSvg } from '../apps/api/src/routes/studio/catalog/providers/packs.js'

const SOURCES = {
  'open-doodles': {
    name: 'Open Doodles', page: 'https://www.opendoodles.com/', author: 'Pablo Stanley', sourceUrl: 'https://www.opendoodles.com/',
    statementPage: 'https://www.opendoodles.com/about', hosts: ['opendoodles.s3-us-west-1.amazonaws.com'],
    tags: { doggie: 'perro mascota', dancing: 'baile', reading: 'lectura leer libro', coffee: 'cafe', 'ice-cream': 'helado', plant: 'planta', playing: 'jugar', running: 'correr', selfie: 'foto', meditating: 'meditar', loving: 'amor', float: 'flotar' },
  },
  'open-peeps': {
    name: 'Open Peeps', page: 'https://www.openpeeps.com/', author: 'Pablo Stanley', sourceUrl: 'https://www.openpeeps.com/',
    statementPage: 'https://www.openpeeps.com/', hosts: ['cdn.prod.website-files.com'], tags: {},
  },
}
const today = new Date().toLocaleDateString('en-CA')
const [id, countArgument] = process.argv.slice(2), source = SOURCES[id], count = Math.min(40, Number(countArgument) || 12)
if (!source) throw Error(`Usa uno de: ${Object.keys(SOURCES).join(', ')}`)
const get = async (url, max) => {
  const host = new URL(url).hostname
  if (new URL(url).protocol !== 'https:' || ![new URL(source.page).hostname, 'creativecommons.org', ...source.hosts].includes(host)) throw Error(`Origen no permitido: ${host}`)
  const response = await fetch(url, { headers: { 'User-Agent': 'RunlyStudio/1.0 (pack import; https://runly.mx)' }, redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw Error(`${response.status} ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > max) throw Error(`Demasiado grande: ${url}`)
  return bytes
}
const page = (await get(source.page, 2_000_000)).toString('utf8')
const statement = id === 'open-peeps' ? page : (await get(source.statementPage, 2_000_000)).toString('utf8')
const text = statement.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const claim = text.match(/[^.]{0,200}CC0[^.]{0,200}\./)?.[0]?.trim()
if (!claim || !/creativecommons\.org\/publicdomain\/zero\/1\.0/.test(statement) && id === 'open-doodles') throw Error('No se pudo verificar la declaración CC0 en la página oficial')
const links = [...new Set([...page.matchAll(/<a[^>]*href="(https:\/\/[^"]+\.svg)"/g)].map(match => match[1]))].filter(url => source.hosts.includes(new URL(url).hostname))
const root = fileURLToPath(new URL(`../apps/api/src/routes/studio/catalog/packs/${id}/`, import.meta.url))
await mkdir(join(root, 'assets'), { recursive: true })
const assets = [], used = new Set()
for (const url of links) {
  if (assets.length >= count) break
  const file = decodeURIComponent(new URL(url).pathname.split('/').pop()).replace(/^[0-9a-f]{20,}_/i, '')
  const slug = file.replace(/\.svg$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
  if (!slug || used.has(slug)) continue
  const bytes = await get(url, 1_500_000)
  if (!safeSvg(bytes.toString('utf8'))) { console.log(`omitido (SVG no seguro): ${file}`); continue }
  used.add(slug)
  await writeFile(join(root, 'assets', `${slug}.svg`), bytes)
  const title = id === 'open-peeps' ? `Personaje ${slug.replace('peep-', '')}` : slug.replace(/-/g, ' ').replace(/^./, letter => letter.toUpperCase())
  assets.push({ id: slug, title, file: `assets/${slug}.svg`, tags: [...slug.split('-'), ...(source.tags[slug] ?? (id === 'open-peeps' ? 'persona personaje gente ilustracion' : 'ilustracion personaje')).split(' ')],
    sha256: createHash('sha256').update(bytes).digest('hex'), sourceFile: url })
}
if (!assets.length) throw Error('Ningún archivo pasó la validación')
const legal = (await get('https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt', 200_000)).toString('utf8')
await writeFile(join(root, 'LICENSE-CC0-1.0.txt'), legal)
await writeFile(join(root, 'PROVENANCE.md'), `# ${source.name}\n\nAutor: ${source.author}. Fuente oficial: ${source.page}\n\nDeclaración de licencia en la página oficial (${source.statementPage}), capturada el ${today}:\n\n> ${claim}\n\nTexto legal: LICENSE-CC0-1.0.txt (https://creativecommons.org/publicdomain/zero/1.0/legalcode). Los archivos se descargaron de los botones de descarga de la página oficial; sus URLs y SHA256 están en manifest.json. Subconjunto limitado de ${assets.length} ilustraciones.\n`)
await writeFile(join(root, 'manifest.json'), `${JSON.stringify({ id, name: source.name, author: source.author, sourceUrl: source.sourceUrl,
  license: { id: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', evidenceUrl: source.statementPage, verifiedAt: today, statement: claim },
  assets }, null, 2)}\n`)
console.log(`${id}: ${assets.length} ilustraciones en ${root}`)
