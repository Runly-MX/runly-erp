// Builds docs/THIRD_PARTY_NOTICES.md (PRELIMINARY) from the license evidence CSVs. Not a legal document.
// Inputs: docs/audits/evidence/licenses-npm-prod.csv (pnpm licenses list --prod), licenses-rust.csv (Cargo.lock names only; cargo metadata could not resolve offline, so crate licenses are unverified).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
const dir = 'docs/audits/evidence/'
const parse = (file) => readFileSync(file, 'utf8').trim().split('\n').slice(1)
  .map((l) => { const m = l.match(/^("(?:[^"]*)"|[^,]*),(.*),([^,]*)$/); return m && { license: m[1].replace(/^"|"$/g, '') || '(sin declarar)', name: m[2], version: m[3] } })
  .filter(Boolean)
const npm = parse(dir + 'licenses-npm-prod.csv')
const rust = existsSync(dir + 'licenses-rust.csv') ? parse(dir + 'licenses-rust.csv') : []
const tally = (rows) => Object.entries(rows.reduce((a, r) => ({ ...a, [r.license]: (a[r.license] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
const table = (rows) => ['| Paquete | Versión | Licencia declarada |', '|---|---|---|', ...rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => `| ${r.name} | ${r.version} | ${r.license} |`)].join('\n')
const sbom = existsSync('docs/sbom/runly-npm-prod.cdx.json') ? JSON.parse(readFileSync('docs/sbom/runly-npm-prod.cdx.json', 'utf8')).components : []
const licenseOf = (c) => c.licenses?.[0]?.license?.id ?? c.licenses?.[0]?.expression ?? 'NOASSERTION'
const review = sbom.filter((c) => /GPL|MPL|NOASSERTION|MIT\/X11|\sAND\s|\sOR\s|Python|CC0|Zlib/.test(licenseOf(c)))
const fontFamilies = existsSync('apps/desktop/public/studio-fonts') ? readdirSync('apps/desktop/public/studio-fonts').filter((f) => f.endsWith('-OFL.txt')).map((f) => f.replace('-OFL.txt', '')) : []
const out = `# Avisos de terceros (PRELIMINAR)

Estado: **inventario parcial, generado automáticamente, sin revisión jurídica.** Lista componentes y la licencia que cada uno declara en sus metadatos; no sustituye la lectura de los textos de licencia ni los avisos que cada licencia exige. Regenerar con \`node scripts/generate-third-party-notices.mjs\`.

## Cobertura

| Ámbito | Estado |
|---|---|
| Dependencias npm de producción (\`pnpm licenses list --prod\`) | Incluido (${npm.length} filas, un renglón por versión) |
| Crates de Rust del shell de escritorio (Tauri) | ${rust.length ? `Parcial: ${rust.length} crates por nombre y versión (de Cargo.lock); licencias NO verificadas (cargo metadata requiere red o caché)` : 'No generado'} |
| Imágenes de contenedor y paquetes del sistema (Node, nginx, Postgres, LiveKit, Collabora, Piper, LibreDWG, Ollama) | **No incluido** |
| Binarios distribuidos (ffmpeg-core.wasm, modelos de voz, fuentes, iconos, imágenes) | Solo los dos avisos de abajo; resto pendiente |
| Dependencias de los repositorios Atlas Web Builder y Developer Hub | **No incluido** |

## Formatos y textos

- SBOM CycloneDX 1.5 (SPDX por componente cuando la licencia declarada es un identificador): \`docs/sbom/runly-npm-prod.cdx.json\` (${sbom.length} versiones de producción con hash SHA-512 del lockfile) y \`docs/sbom/runly-desktop-cargo.cdx.json\` (crates, hash SHA-256, **licencias sin resolver**). Generar con \`node scripts/generate-sbom.mjs\`. Es una lista de componentes del lockfile, **no** un SBOM de lo que contiene cada artefacto distribuido.
- Textos de licencia y NOTICE tomados de los propios paquetes: \`docs/THIRD_PARTY_LICENSE_TEXTS.md\` (\`node scripts/generate-license-texts.mjs\`). MIT, BSD y Apache-2.0 exigen conservar el aviso de copyright y el texto; Apache-2.0 además los NOTICE. Los paquetes que no traen archivo de licencia están listados allí.

## Licencias que requieren revisión (${review.length} versiones)

Expresiones compuestas, copyleft, MPL o sin declarar. Decidir, caso por caso, qué alternativa aplica y si el paquete llega al navegador o a un binario distribuido.

${review.map((c) => `- ${c.name}@${c.version}: ${licenseOf(c)}`).join('\n')}

## Fuentes

- Fuentes de Studio (\`apps/desktop/public/studio-fonts/\`, 124 archivos): ${fontFamilies.length} familias, cada una con su texto SIL OFL junto a los archivos (${fontFamilies.join(', ')}). Pendiente verificar los avisos de copyright por familia.
- Fuentes de la interfaz: se piden a Google Fonts (\`apps/desktop/index.html\`: Plus Jakarta Sans, Playfair Display, Space Grotesk, DM Sans, Merriweather, Hanken Grotesk, JetBrains Mono); todas OFL, pero cargarlas desde un tercero es una cuestión de privacidad a decidir.

## Recursos sin inventariar

Sonidos (\`apps/desktop/public/sounds/\`: notificación y llamadas), logos de módulos, iconos de PWA, \`og-image.png\`, iconos de \`lucide-react\` (ISC, en npm) y modelos de voz (Piper) no tienen procedencia ni licencia registradas en el repositorio. **Pendiente de confirmar con el autor o la fuente.**

## Avisos específicos

- **Datos geográficos (\`country-state-city\` 3.2.1).** El código del paquete npm es GPL-3.0; los datos proceden de la base \`dr5hn/countries-states-cities-database\`, publicada bajo Open Database License (ODbL). Aviso exigido para uso público de obras producidas: «Contains information from Countries States Cities Database (https://github.com/dr5hn/countries-states-cities-database), which is made available here under the Open Database License (ODbL).» Pendiente de decisión jurídica y de sustitución del paquete (ver RUNLY_LICENSE_INVENTORY_PRELIMINARY.md).
- **FFmpeg (\`@ffmpeg/core\` 0.12.10, WebAssembly).** El binario distribuido en \`/ffmpeg/\` se compiló con \`--enable-gpl\` e incluye x264, x265, libvpx, LAME, Opus, Vorbis y libass (verificado en el binario). Declarado GPL-2.0-or-later. Pendiente de revisión jurídica (obligaciones de fuente correspondiente).

## Resumen por licencia declarada

### npm
${tally(npm).map(([l, n]) => `- ${l}: ${n}`).join('\n')}
${rust.length ? `\n### Rust\n${tally(rust).map(([l, n]) => `- ${l}: ${n}`).join('\n')}\n` : ''}
## npm (producción)

${table(npm)}
${rust.length ? `\n## Rust (crates del escritorio)\n\n${table(rust)}\n` : ''}`
writeFileSync('docs/THIRD_PARTY_NOTICES.md', out)
console.log('written', npm.length, rust.length)
