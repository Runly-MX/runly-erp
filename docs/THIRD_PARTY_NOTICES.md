# Avisos de terceros (PRELIMINAR)

Estado: **inventario parcial, generado automáticamente, sin revisión jurídica.** Lista componentes y la licencia que cada uno declara en sus metadatos; no sustituye la lectura de los textos de licencia ni los avisos que cada licencia exige. Regenerar con `node scripts/generate-third-party-notices.mjs`.

## Cobertura

| Ámbito | Estado |
|---|---|
| Dependencias npm de producción (`pnpm licenses list --prod`) | Incluido (1153 filas, un renglón por versión) |
| Crates de Rust del shell de escritorio (Tauri) | Incluido: 625 crates con la licencia declarada en sus metadatos (cargo metadata, todas las plataformas; 5 MPL-2.0, 2 con LGPL-2.1 como alternativa dentro de una expresión OR) |
| Imágenes de contenedor y paquetes del sistema (Node, nginx, Postgres, LiveKit, Collabora, Piper, LibreDWG, Ollama) | **No incluido** |
| Binarios distribuidos (ffmpeg-core.wasm, modelos de voz, fuentes, iconos, imágenes) | Solo los dos avisos de abajo; resto pendiente |
| Dependencias de los repositorios Atlas Web Builder y Developer Hub | **No incluido** |

## Formatos y textos

- SBOM CycloneDX 1.5 (SPDX por componente cuando la licencia declarada es un identificador): `docs/sbom/runly-npm-prod.cdx.json` (1323 versiones de producción con hash SHA-512 del lockfile) y `docs/sbom/runly-desktop-cargo.cdx.json` (crates, hash SHA-256, **licencias sin resolver**). Generar con `node scripts/generate-sbom.mjs`. Es una lista de componentes del lockfile, **no** un SBOM de lo que contiene cada artefacto distribuido.
- Textos de licencia y NOTICE tomados de los propios paquetes: `docs/THIRD_PARTY_LICENSE_TEXTS.md` (`node scripts/generate-license-texts.mjs`). MIT, BSD y Apache-2.0 exigen conservar el aviso de copyright y el texto; Apache-2.0 además los NOTICE. Los paquetes que no traen archivo de licencia están listados allí.

## Licencias que requieren revisión (28 versiones)

Expresiones compuestas, copyleft, MPL o sin declarar. Decidir, caso por caso, qué alternativa aplica y si el paquete llega al navegador o a un binario distribuido.

- @bufbuild/protobuf@1.10.1: (Apache-2.0 AND BSD-3-Clause)
- @ffmpeg/core@0.12.10: GPL-2.0-or-later
- @img/sharp-win32-x64@0.35.5: Apache-2.0 AND LGPL-3.0-or-later
- @maplibre/mlt@1.3.0: (MIT OR Apache-2.0)
- @tauri-apps/api@2.11.1: Apache-2.0 OR MIT
- @tauri-apps/api@2.12.1: Apache-2.0 OR MIT
- @tauri-apps/plugin-haptics@2.3.3: MIT OR Apache-2.0
- @tauri-apps/plugin-notification@2.4.0: MIT OR Apache-2.0
- @tauri-apps/plugin-sql@2.4.0: MIT OR Apache-2.0
- @tauri-apps/plugin-store@2.4.3: MIT OR Apache-2.0
- @zxing/text-encoding@0.9.0: (Unlicense OR Apache-2.0)
- argparse@2.0.1: Python-2.0
- buffers@0.1.1: NOASSERTION
- chainsaw@0.1.0: MIT/X11
- country-state-city@3.2.1: GPL-3.0
- dompurify@3.4.16: (MPL-2.0 OR Apache-2.0)
- fractional-indexing@3.2.0: CC0-1.0
- jszip@3.10.1: (MIT OR GPL-3.0-or-later)
- khroma@2.1.0: NOASSERTION
- lightningcss-win32-x64-msvc@1.32.0: MPL-2.0
- lightningcss@1.32.0: MPL-2.0
- pako@1.0.11: (MIT AND Zlib)
- pako@2.0.3: (MIT AND Zlib)
- pako@2.2.0: (MIT AND Zlib)
- pizzip@3.3.0: (MIT OR GPL-3.0)
- traverse@0.3.9: MIT/X11
- victory-vendor@37.3.6: MIT AND ISC
- web-push@3.6.7: MPL-2.0

## Fuentes

- Fuentes de Studio (`apps/desktop/public/studio-fonts/`, 124 archivos): 28 familias, cada una con su texto SIL OFL junto a los archivos (bebasneue, bitter, caveat, cormorantgaramond, dancingscript, dmsans, greatvibes, ibmplexmono, inter, jetbrainsmono, kalam, lato, librebaskerville, lobster, lora, merriweather, montserrat, nunito, opensans, oswald, pacifico, playfairdisplay, poppins, raleway, roboto, sacramento, sourcesans3, spacemono). Pendiente verificar los avisos de copyright por familia.
- Fuentes de la interfaz: se piden a Google Fonts (`apps/desktop/index.html`: Plus Jakarta Sans, Playfair Display, Space Grotesk, DM Sans, Merriweather, Hanken Grotesk, JetBrains Mono); todas OFL, pero cargarlas desde un tercero es una cuestión de privacidad a decidir.

## Recursos sin inventariar

Sonidos (`apps/desktop/public/sounds/`: notificación y llamadas), logos de módulos, iconos de PWA, `og-image.png`, iconos de `lucide-react` (ISC, en npm) y modelos de voz (Piper) no tienen procedencia ni licencia registradas en el repositorio. **Pendiente de confirmar con el autor o la fuente.**

## Avisos específicos

- **Datos geográficos (`country-state-city` 3.2.1).** El código del paquete npm es GPL-3.0; los datos proceden de la base `dr5hn/countries-states-cities-database`, publicada bajo Open Database License (ODbL). Aviso exigido para uso público de obras producidas: «Contains information from Countries States Cities Database (https://github.com/dr5hn/countries-states-cities-database), which is made available here under the Open Database License (ODbL).» Pendiente de decisión jurídica y de sustitución del paquete (ver RUNLY_LICENSE_INVENTORY_PRELIMINARY.md).
- **FFmpeg (`@ffmpeg/core` 0.12.10, WebAssembly).** El binario distribuido en `/ffmpeg/` se compiló con `--enable-gpl` e incluye x264, x265, libvpx, LAME, Opus, Vorbis y libass (verificado en el binario). Declarado GPL-2.0-or-later. Pendiente de revisión jurídica (obligaciones de fuente correspondiente).

## Resumen por licencia declarada

### npm
- MIT: 915
- ISC: 92
- Apache-2.0: 73
- BSD-3-Clause: 33
- BSD-2-Clause: 10
- MIT OR Apache-2.0: 4
- Unlicense: 3
- MPL-2.0: 3
- Unknown: 2
- MIT/X11: 2
- (Apache-2.0 AND BSD-3-Clause): 1
- GPL-2.0-or-later: 1
- Apache-2.0 AND LGPL-3.0-or-later: 1
- (MIT OR Apache-2.0): 1
- Apache-2.0 OR MIT: 1
- (Unlicense OR Apache-2.0): 1
- Python-2.0: 1
- GPL-3.0: 1
- (MPL-2.0 OR Apache-2.0): 1
- CC0-1.0: 1
- (MIT OR GPL-3.0-or-later): 1
- MIT-0: 1
- (MIT AND Zlib): 1
- (MIT OR GPL-3.0): 1
- 0BSD: 1
- MIT AND ISC: 1

### Rust
- MIT OR Apache-2.0: 317
- MIT: 143
- Apache-2.0 OR MIT: 66
- Unicode-3.0: 18
- Zlib OR Apache-2.0 OR MIT: 17
- Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT: 15
- Unlicense OR MIT: 6
- MPL-2.0: 5
- BSD-3-Clause: 3
- Apache-2.0: 3
- ISC: 3
- MIT OR Apache-2.0 OR Zlib: 3
- Zlib: 2
- Apache-2.0 OR ISC OR MIT: 2
- BSD-3-Clause OR MIT OR Apache-2.0: 2
- MIT OR Apache-2.0 OR LGPL-2.1-or-later: 2
- Apache-2.0 OR BSL-1.0 OR MIT: 2
- BSD-2-Clause OR Apache-2.0 OR MIT: 2
- 0BSD OR MIT OR Apache-2.0: 1
- BSD-3-Clause OR MIT: 1
- BSD-3-Clause AND MIT: 1
- Apache-2.0 AND MIT: 1
- CC0-1.0 OR MIT-0 OR Apache-2.0: 1
- (Apache-2.0 OR MIT) AND BSD-3-Clause: 1
- Apache-2.0  OR  MIT: 1
- MIT OR Zlib OR Apache-2.0: 1
- Apache-2.0 AND ISC: 1
- Apache-2.0 OR BSL-1.0: 1
- Apache-2.0 WITH LLVM-exception: 1
- CC0-1.0: 1
- (MIT OR Apache-2.0) AND Unicode-3.0: 1
- CDLA-Permissive-2.0: 1

## npm (producción)

| Paquete | Versión | Licencia declarada |
|---|---|---|
| @antfu/install-pkg | 2.0.1 | MIT |
| @babel/runtime | 7.29.7 | MIT |
| @braintree/sanitize-url | 6.0.2 7.1.2 | MIT |
| @bufbuild/protobuf | 1.10.1 | (Apache-2.0 AND BSD-3-Clause) |
| @chevrotain/cst-dts-gen | 11.0.3 | Apache-2.0 |
| @chevrotain/gast | 11.0.3 | Apache-2.0 |
| @chevrotain/regexp-to-ast | 11.0.3 | Apache-2.0 |
| @chevrotain/types | 11.0.3 11.1.2 | Apache-2.0 |
| @chevrotain/utils | 11.0.3 | Apache-2.0 |
| @codemirror/autocomplete | 6.20.2 | MIT |
| @codemirror/commands | 6.10.3 | MIT |
| @codemirror/lang-angular | 0.1.4 | MIT |
| @codemirror/lang-cpp | 6.0.3 | MIT |
| @codemirror/lang-css | 6.3.1 | MIT |
| @codemirror/lang-go | 6.0.1 | MIT |
| @codemirror/lang-html | 6.4.11 | MIT |
| @codemirror/lang-java | 6.0.2 | MIT |
| @codemirror/lang-javascript | 6.2.5 | MIT |
| @codemirror/lang-jinja | 6.0.1 | MIT |
| @codemirror/lang-json | 6.0.2 | MIT |
| @codemirror/lang-less | 6.0.2 | MIT |
| @codemirror/lang-liquid | 6.3.2 | MIT |
| @codemirror/lang-markdown | 6.5.0 | MIT |
| @codemirror/lang-php | 6.0.2 | MIT |
| @codemirror/lang-python | 6.2.1 | MIT |
| @codemirror/lang-rust | 6.0.2 | MIT |
| @codemirror/lang-sass | 6.0.2 | MIT |
| @codemirror/lang-sql | 6.10.0 | MIT |
| @codemirror/lang-vue | 0.1.3 | MIT |
| @codemirror/lang-wast | 6.0.2 | MIT |
| @codemirror/lang-xml | 6.1.0 | MIT |
| @codemirror/lang-yaml | 6.1.3 | MIT |
| @codemirror/language | 6.12.3 | MIT |
| @codemirror/language-data | 6.5.2 | MIT |
| @codemirror/legacy-modes | 6.5.3 | MIT |
| @codemirror/lint | 6.9.6 | MIT |
| @codemirror/merge | 6.12.1 | MIT |
| @codemirror/search | 6.7.0 | MIT |
| @codemirror/state | 6.6.0 | MIT |
| @codemirror/view | 6.43.0 | MIT |
| @dnd-kit/accessibility | 3.1.1 | MIT |
| @dnd-kit/core | 6.3.1 | MIT |
| @dnd-kit/sortable | 8.0.0 10.0.0 | MIT |
| @dnd-kit/utilities | 3.2.2 | MIT |
| @electric-sql/pglite | 0.4.1 | Apache-2.0 |
| @electric-sql/pglite-socket | 0.1.1 | Apache-2.0 |
| @electric-sql/pglite-tools | 0.3.1 | Apache-2.0 |
| @esbuild/win32-x64 | 0.25.12 | MIT |
| @excalidraw/excalidraw | 0.18.1 | MIT |
| @excalidraw/laser-pointer | 1.3.1 | MIT |
| @excalidraw/markdown-to-text | 0.1.2 | MIT |
| @excalidraw/mermaid-to-excalidraw | 2.2.2 | MIT |
| @excalidraw/random-username | 1.1.0 | MIT |
| @fast-csv/format | 4.3.5 | MIT |
| @fast-csv/parse | 4.3.6 | MIT |
| @fastify/busboy | 3.2.2 | MIT |
| @ffmpeg/core | 0.12.10 | GPL-2.0-or-later |
| @ffmpeg/ffmpeg | 0.12.15 | MIT |
| @ffmpeg/types | 0.12.4 | MIT |
| @ffmpeg/util | 0.12.2 | MIT |
| @firebase/app-check-interop-types | 0.3.5 | Apache-2.0 |
| @firebase/app-types | 0.9.6 | Apache-2.0 |
| @firebase/auth-interop-types | 0.2.6 | Apache-2.0 |
| @firebase/component | 0.7.5 | Apache-2.0 |
| @firebase/database | 1.1.5 | Apache-2.0 |
| @firebase/database-compat | 2.1.7 | Apache-2.0 |
| @firebase/database-types | 1.0.22 | Apache-2.0 |
| @firebase/logger | 0.5.2 | Apache-2.0 |
| @firebase/util | 1.15.3 | Apache-2.0 |
| @floating-ui/core | 1.7.5 | MIT |
| @floating-ui/dom | 1.7.6 | MIT |
| @floating-ui/react | 0.27.19 | MIT |
| @floating-ui/react-dom | 2.1.8 | MIT |
| @floating-ui/utils | 0.2.11 | MIT |
| @google-cloud/firestore | 7.11.6 | Apache-2.0 |
| @google-cloud/paginator | 5.0.2 | Apache-2.0 |
| @google-cloud/projectify | 4.0.0 | Apache-2.0 |
| @google-cloud/promisify | 4.0.0 | Apache-2.0 |
| @google-cloud/storage | 7.22.0 | Apache-2.0 |
| @grpc/grpc-js | 1.14.5 | Apache-2.0 |
| @grpc/proto-loader | 0.7.15 0.8.1 | Apache-2.0 |
| @hono/node-server | 1.19.18 1.19.19 | MIT |
| @hono/zod-validator | 0.8.0 | MIT |
| @hookform/resolvers | 5.4.0 | MIT |
| @iconify/types | 2.0.0 | MIT |
| @iconify/utils | 3.1.7 | MIT |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later |
| @jridgewell/gen-mapping | 0.3.13 | MIT |
| @jridgewell/remapping | 2.3.5 | MIT |
| @jridgewell/resolve-uri | 3.1.2 | MIT |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT |
| @js-sdsl/ordered-map | 4.4.2 | MIT |
| @kurkle/color | 0.3.4 | MIT |
| @lexical/clipboard | 0.35.0 | MIT |
| @lexical/code | 0.35.0 | MIT |
| @lexical/devtools-core | 0.35.0 | MIT |
| @lexical/dragon | 0.35.0 | MIT |
| @lexical/hashtag | 0.35.0 | MIT |
| @lexical/history | 0.35.0 | MIT |
| @lexical/html | 0.35.0 | MIT |
| @lexical/link | 0.35.0 | MIT |
| @lexical/list | 0.35.0 | MIT |
| @lexical/mark | 0.35.0 | MIT |
| @lexical/markdown | 0.35.0 | MIT |
| @lexical/offset | 0.35.0 | MIT |
| @lexical/overflow | 0.35.0 | MIT |
| @lexical/plain-text | 0.35.0 | MIT |
| @lexical/react | 0.35.0 | MIT |
| @lexical/rich-text | 0.35.0 | MIT |
| @lexical/selection | 0.35.0 | MIT |
| @lexical/table | 0.35.0 | MIT |
| @lexical/text | 0.35.0 | MIT |
| @lexical/utils | 0.35.0 | MIT |
| @lexical/yjs | 0.35.0 | MIT |
| @lezer/common | 1.5.2 | MIT |
| @lezer/cpp | 1.1.6 | MIT |
| @lezer/css | 1.3.3 | MIT |
| @lezer/go | 1.0.1 | MIT |
| @lezer/highlight | 1.2.3 | MIT |
| @lezer/html | 1.3.13 | MIT |
| @lezer/java | 1.1.3 | MIT |
| @lezer/javascript | 1.5.4 | MIT |
| @lezer/json | 1.0.3 | MIT |
| @lezer/lr | 1.4.10 | MIT |
| @lezer/markdown | 1.6.4 | MIT |
| @lezer/php | 1.0.5 | MIT |
| @lezer/python | 1.1.19 | MIT |
| @lezer/rust | 1.0.2 | MIT |
| @lezer/sass | 1.1.0 | MIT |
| @lezer/xml | 1.0.6 | MIT |
| @lezer/yaml | 1.0.4 | MIT |
| @livekit/mutex | 1.1.1 | Apache-2.0 |
| @livekit/protocol | 1.48.0 1.50.4 | Apache-2.0 |
| @mapbox/jsonlint-lines-primitives | 2.0.3 | MIT |
| @mapbox/node-pre-gyp | 1.0.11 | BSD-3-Clause |
| @mapbox/point-geometry | 1.1.0 | ISC |
| @mapbox/tiny-sdf | 2.2.0 | BSD-2-Clause |
| @mapbox/unitbezier | 1.0.0 | BSD-2-Clause |
| @mapbox/vector-tile | 3.0.0 | BSD-3-Clause |
| @maplibre/geojson-vt | 6.1.1 | ISC |
| @maplibre/maplibre-gl-style-spec | 26.4.4 | ISC |
| @maplibre/mlt | 1.3.0 | (MIT OR Apache-2.0) |
| @maplibre/vt-pbf | 4.3.2 | MIT |
| @marijn/find-cluster-break | 1.0.2 | MIT |
| @mdxeditor/editor | 4.0.1 | MIT |
| @mdxeditor/gurx | 1.2.4 | MIT |
| @mermaid-js/parser | 0.6.3 1.2.1 | MIT |
| @modelcontextprotocol/sdk | 1.32.1 | MIT |
| @napi-rs/canvas | 0.1.100 | MIT |
| @napi-rs/canvas-win32-x64-msvc | 0.1.100 | MIT |
| @noble/ciphers | 1.3.0 | MIT |
| @noble/hashes | 1.8.0 | MIT |
| @nodable/entities | 3.0.0 | MIT |
| @opentelemetry/api | 1.9.1 | Apache-2.0 |
| @pdf-lib/standard-fonts | 1.0.0 | MIT |
| @pdf-lib/upng | 1.0.1 | MIT |
| @prisma/adapter-pg | 7.8.0 | Apache-2.0 |
| @prisma/client | 7.8.0 | Apache-2.0 |
| @prisma/client-runtime-utils | 7.8.0 | Apache-2.0 |
| @prisma/config | 7.8.0 | Apache-2.0 |
| @prisma/debug | 7.2.0 7.8.0 | Apache-2.0 |
| @prisma/dev | 0.24.3 | ISC |
| @prisma/driver-adapter-utils | 7.8.0 | Apache-2.0 |
| @prisma/engines | 7.8.0 | Apache-2.0 |
| @prisma/engines-version | 7.8.0-6.3c6e192761c0362d496ed980de936e2f3cebcd3a | Apache-2.0 |
| @prisma/fetch-engine | 7.8.0 | Apache-2.0 |
| @prisma/get-platform | 7.2.0 7.8.0 | Apache-2.0 |
| @prisma/query-plan-executor | 7.2.0 | Apache-2.0 |
| @prisma/streams-local | 0.1.2 | Apache-2.0 |
| @prisma/studio-core | 0.27.3 | Apache-2.0 |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause |
| @protobufjs/float | 1.0.2 | BSD-3-Clause |
| @protobufjs/path | 1.1.2 | BSD-3-Clause |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause |
| @radix-ui/colors | 3.0.0 | MIT |
| @radix-ui/number | 1.1.1 | MIT |
| @radix-ui/primitive | 1.0.0 1.1.1 1.1.3 1.1.7 1.2.0 | MIT |
| @radix-ui/react-accordion | 1.2.12 | MIT |
| @radix-ui/react-arrow | 1.1.2 1.1.7 1.1.15 1.1.17 | MIT |
| @radix-ui/react-avatar | 1.1.11 | MIT |
| @radix-ui/react-checkbox | 1.3.3 | MIT |
| @radix-ui/react-collapsible | 1.1.12 | MIT |
| @radix-ui/react-collection | 1.0.1 1.1.7 1.1.15 1.2.0 | MIT |
| @radix-ui/react-compose-refs | 1.0.0 1.1.1 1.1.2 1.1.5 | MIT |
| @radix-ui/react-context | 1.0.0 1.1.1 1.1.2 1.1.3 1.2.2 1.3.0 | MIT |
| @radix-ui/react-context-menu | 2.3.7 | MIT |
| @radix-ui/react-dialog | 1.1.15 1.3.1 | MIT |
| @radix-ui/react-direction | 1.0.0 1.1.1 1.1.4 1.2.0 | MIT |
| @radix-ui/react-dismissable-layer | 1.1.5 1.1.11 1.1.19 1.2.1 | MIT |
| @radix-ui/react-dropdown-menu | 2.1.16 2.2.1 | MIT |
| @radix-ui/react-focus-guards | 1.1.1 1.1.3 1.1.6 1.2.0 | MIT |
| @radix-ui/react-focus-scope | 1.1.2 1.1.7 1.1.16 1.3.1 | MIT |
| @radix-ui/react-icons | 1.3.2 | MIT |
| @radix-ui/react-id | 1.0.0 1.1.0 1.1.1 1.1.4 | MIT |
| @radix-ui/react-label | 2.1.8 | MIT |
| @radix-ui/react-menu | 2.1.16 2.1.24 2.2.1 | MIT |
| @radix-ui/react-popover | 1.1.6 1.1.15 1.3.1 | MIT |
| @radix-ui/react-popper | 1.2.2 1.2.8 1.3.7 1.4.0 | MIT |
| @radix-ui/react-portal | 1.1.4 1.1.9 1.1.17 1.2.0 | MIT |
| @radix-ui/react-presence | 1.0.0 1.1.2 1.1.5 1.1.10 1.1.11 | MIT |
| @radix-ui/react-primitive | 1.0.1 2.0.2 2.1.3 2.1.4 2.1.10 2.2.0 | MIT |
| @radix-ui/react-roving-focus | 1.0.2 1.1.11 1.1.19 1.2.1 | MIT |
| @radix-ui/react-select | 2.2.6 | MIT |
| @radix-ui/react-separator | 1.1.7 1.1.8 | MIT |
| @radix-ui/react-slot | 1.0.1 1.1.2 1.2.3 1.2.4 1.3.3 1.5.0 | MIT |
| @radix-ui/react-switch | 1.2.6 | MIT |
| @radix-ui/react-tabs | 1.0.2 1.1.13 | MIT |
| @radix-ui/react-toggle | 1.1.10 | MIT |
| @radix-ui/react-toggle-group | 1.1.11 | MIT |
| @radix-ui/react-toolbar | 1.1.11 | MIT |
| @radix-ui/react-tooltip | 1.2.8 1.4.1 | MIT |
| @radix-ui/react-use-callback-ref | 1.0.0 1.1.0 1.1.1 1.1.4 1.1.5 | MIT |
| @radix-ui/react-use-controllable-state | 1.0.0 1.1.0 1.2.2 1.2.6 1.3.0 | MIT |
| @radix-ui/react-use-effect-event | 0.0.2 0.0.5 | MIT |
| @radix-ui/react-use-escape-keydown | 1.1.0 1.1.1 | MIT |
| @radix-ui/react-use-is-hydrated | 0.1.0 0.1.3 | MIT |
| @radix-ui/react-use-layout-effect | 1.0.0 1.1.0 1.1.1 1.1.4 | MIT |
| @radix-ui/react-use-previous | 1.1.1 | MIT |
| @radix-ui/react-use-rect | 1.1.0 1.1.1 1.1.4 | MIT |
| @radix-ui/react-use-size | 1.1.0 1.1.1 1.1.4 1.1.5 | MIT |
| @radix-ui/react-visually-hidden | 1.2.3 1.2.13 | MIT |
| @radix-ui/rect | 1.1.0 1.1.1 1.1.3 | MIT |
| @raulbellosom/atlas-web-builder | 0.11.0 | MIT |
| @reduxjs/toolkit | 2.12.0 | MIT |
| @standard-schema/spec | 1.1.0 | MIT |
| @standard-schema/utils | 0.3.0 | MIT |
| @supabase/auth-js | 2.105.1 | MIT |
| @supabase/functions-js | 2.105.1 | MIT |
| @supabase/phoenix | 0.4.1 | MIT |
| @supabase/postgrest-js | 2.105.1 | MIT |
| @supabase/realtime-js | 2.105.1 | MIT |
| @supabase/storage-js | 2.105.1 | MIT |
| @supabase/supabase-js | 2.105.1 | MIT |
| @swc/helpers | 0.5.21 | Apache-2.0 |
| @tabler/icons | 3.50.0 | MIT |
| @tailwindcss/node | 4.2.4 | MIT |
| @tailwindcss/oxide | 4.2.4 | MIT |
| @tailwindcss/oxide-win32-x64-msvc | 4.2.4 | MIT |
| @tanstack/query-core | 5.101.0 5.104.0 5.104.1 5.104.4 | MIT |
| @tanstack/query-persist-client-core | 5.101.0 | MIT |
| @tanstack/react-query | 5.101.0 5.104.0 5.104.1 5.104.4 | MIT |
| @tanstack/react-query-persist-client | 5.101.0 | MIT |
| @tanstack/react-table | 8.21.3 | MIT |
| @tanstack/table-core | 8.21.3 | MIT |
| @tauri-apps/api | 2.11.1 2.12.1 | Apache-2.0 OR MIT |
| @tauri-apps/plugin-haptics | 2.3.3 | MIT OR Apache-2.0 |
| @tauri-apps/plugin-notification | 2.4.0 | MIT OR Apache-2.0 |
| @tauri-apps/plugin-sql | 2.4.0 | MIT OR Apache-2.0 |
| @tauri-apps/plugin-store | 2.4.3 | MIT OR Apache-2.0 |
| @tiptap/core | 3.30.5 | MIT |
| @tiptap/extension-blockquote | 3.30.5 | MIT |
| @tiptap/extension-bold | 3.30.5 | MIT |
| @tiptap/extension-bubble-menu | 3.30.5 | MIT |
| @tiptap/extension-bullet-list | 3.30.5 | MIT |
| @tiptap/extension-character-count | 3.30.5 | MIT |
| @tiptap/extension-code | 3.30.5 | MIT |
| @tiptap/extension-code-block | 3.30.5 | MIT |
| @tiptap/extension-collaboration | 3.30.5 | MIT |
| @tiptap/extension-collaboration-caret | 3.30.5 | MIT |
| @tiptap/extension-color | 3.30.5 | MIT |
| @tiptap/extension-document | 3.30.5 | MIT |
| @tiptap/extension-dropcursor | 3.30.5 | MIT |
| @tiptap/extension-floating-menu | 3.30.5 | MIT |
| @tiptap/extension-gapcursor | 3.30.5 | MIT |
| @tiptap/extension-hard-break | 3.30.5 | MIT |
| @tiptap/extension-heading | 3.30.5 | MIT |
| @tiptap/extension-highlight | 3.30.5 | MIT |
| @tiptap/extension-horizontal-rule | 3.30.5 | MIT |
| @tiptap/extension-image | 3.30.5 | MIT |
| @tiptap/extension-italic | 3.30.5 | MIT |
| @tiptap/extension-link | 3.30.5 | MIT |
| @tiptap/extension-list | 3.30.5 | MIT |
| @tiptap/extension-list-item | 3.30.5 | MIT |
| @tiptap/extension-list-keymap | 3.30.5 | MIT |
| @tiptap/extension-ordered-list | 3.30.5 | MIT |
| @tiptap/extension-paragraph | 3.30.5 | MIT |
| @tiptap/extension-placeholder | 3.30.5 | MIT |
| @tiptap/extension-strike | 3.30.5 | MIT |
| @tiptap/extension-table | 3.30.5 | MIT |
| @tiptap/extension-table-cell | 3.30.5 | MIT |
| @tiptap/extension-table-header | 3.30.5 | MIT |
| @tiptap/extension-table-row | 3.30.5 | MIT |
| @tiptap/extension-task-item | 3.30.5 | MIT |
| @tiptap/extension-task-list | 3.30.5 | MIT |
| @tiptap/extension-text | 3.30.5 | MIT |
| @tiptap/extension-text-style | 3.30.5 | MIT |
| @tiptap/extension-underline | 3.30.5 | MIT |
| @tiptap/extensions | 3.30.5 | MIT |
| @tiptap/pm | 3.30.5 | MIT |
| @tiptap/react | 3.30.5 | MIT |
| @tiptap/starter-kit | 3.30.5 | MIT |
| @tiptap/suggestion | 3.30.5 | MIT |
| @tiptap/y-tiptap | 3.0.7 | MIT |
| @tootallnate/once | 2.0.1 | MIT |
| @types/caseless | 0.12.5 | MIT |
| @types/d3 | 7.4.3 | MIT |
| @types/d3-array | 3.2.2 | MIT |
| @types/d3-axis | 3.0.6 | MIT |
| @types/d3-brush | 3.0.6 | MIT |
| @types/d3-chord | 3.0.6 | MIT |
| @types/d3-color | 3.1.3 | MIT |
| @types/d3-contour | 3.0.6 | MIT |
| @types/d3-delaunay | 6.0.4 | MIT |
| @types/d3-dispatch | 3.0.7 | MIT |
| @types/d3-drag | 3.0.7 | MIT |
| @types/d3-dsv | 3.0.7 | MIT |
| @types/d3-ease | 3.0.2 | MIT |
| @types/d3-fetch | 3.0.7 | MIT |
| @types/d3-force | 3.0.10 | MIT |
| @types/d3-format | 3.0.4 | MIT |
| @types/d3-geo | 3.1.1 | MIT |
| @types/d3-hierarchy | 3.1.7 | MIT |
| @types/d3-interpolate | 3.0.4 | MIT |
| @types/d3-path | 3.1.1 | MIT |
| @types/d3-polygon | 3.0.2 | MIT |
| @types/d3-quadtree | 3.0.6 | MIT |
| @types/d3-random | 3.0.4 | MIT |
| @types/d3-scale | 4.0.9 | MIT |
| @types/d3-scale-chromatic | 3.1.0 | MIT |
| @types/d3-selection | 3.0.11 | MIT |
| @types/d3-shape | 3.1.8 | MIT |
| @types/d3-time | 3.0.4 | MIT |
| @types/d3-time-format | 4.0.3 | MIT |
| @types/d3-timer | 3.0.2 | MIT |
| @types/d3-transition | 3.0.9 | MIT |
| @types/d3-zoom | 3.0.8 | MIT |
| @types/debug | 4.1.13 | MIT |
| @types/dom-mediacapture-record | 1.0.22 | MIT |
| @types/estree | 1.0.9 | MIT |
| @types/estree-jsx | 1.0.5 | MIT |
| @types/geojson | 7946.0.16 | MIT |
| @types/hast | 3.0.4 | MIT |
| @types/jsonwebtoken | 9.0.10 | MIT |
| @types/long | 4.0.2 | MIT |
| @types/mdast | 4.0.4 | MIT |
| @types/ms | 2.1.0 | MIT |
| @types/node | 14.18.63 22.20.5 25.6.0 | MIT |
| @types/pako | 2.0.4 | MIT |
| @types/pg | 8.20.0 | MIT |
| @types/raf | 3.4.3 | MIT |
| @types/react | 19.2.14 | MIT |
| @types/react-dom | 19.2.3 | MIT |
| @types/request | 2.48.13 | MIT |
| @types/tough-cookie | 4.0.5 | MIT |
| @types/trusted-types | 2.0.7 | MIT |
| @types/unist | 2.0.11 3.0.3 | MIT |
| @types/use-sync-external-store | 0.0.6 | MIT |
| @types/ws | 8.18.1 | MIT |
| @ungap/structured-clone | 1.3.1 | ISC |
| @upsetjs/venn.js | 2.0.0 | MIT |
| @xmldom/xmldom | 0.8.15 0.9.12 | MIT |
| @zxing/browser | 0.2.1 | MIT |
| @zxing/library | 0.23.0 | Apache-2.0 |
| @zxing/text-encoding | 0.9.0 | (Unlicense OR Apache-2.0) |
| abab | 2.0.6 | BSD-3-Clause |
| abbrev | 1.1.1 | ISC |
| abort-controller | 3.0.0 | MIT |
| accepts | 2.0.0 | MIT |
| acorn | 8.16.0 | MIT |
| acorn-globals | 7.0.1 | MIT |
| acorn-jsx | 5.3.2 | MIT |
| acorn-walk | 8.3.5 | MIT |
| agent-base | 6.0.2 7.1.4 | MIT |
| ajv | 8.20.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| ansi-regex | 5.0.1 | MIT |
| ansi-styles | 4.3.0 | MIT |
| anymatch | 3.1.3 | ISC |
| anynum | 1.0.1 | MIT |
| aproba | 2.1.0 | ISC |
| archiver | 5.3.2 | MIT |
| archiver-utils | 2.1.0 3.0.4 | MIT |
| are-we-there-yet | 2.0.0 | ISC |
| argparse | 2.0.1 | Python-2.0 |
| aria-hidden | 1.2.6 | MIT |
| arrify | 2.0.1 | MIT |
| asn1.js | 5.4.1 | MIT |
| async | 3.2.6 | MIT |
| async-retry | 1.3.3 | MIT |
| asynckit | 0.4.0 | MIT |
| aws-ssl-profiles | 1.1.2 | MIT |
| bail | 2.0.2 | MIT |
| balanced-match | 1.0.2 | MIT |
| base64-arraybuffer | 1.0.2 | MIT |
| base64-js | 0.0.8 1.5.1 | MIT |
| better-result | 2.9.2 | MIT |
| bidi-js | 1.1.0 | MIT |
| big-integer | 1.6.52 | Unlicense |
| bignumber.js | 9.3.1 | MIT |
| binary | 0.3.0 | MIT |
| binary-extensions | 2.3.0 | MIT |
| bl | 4.1.0 | MIT |
| bluebird | 3.4.7 | MIT |
| bn.js | 4.12.3 | MIT |
| body-parser | 2.4.0 | MIT |
| brace-expansion | 1.1.21 2.1.7 | MIT |
| braces | 3.0.3 | MIT |
| brotli | 1.3.3 | MIT |
| browser-fs-access | 0.29.1 | Apache-2.0 |
| browserify-zlib | 0.2.0 | MIT |
| buffer | 5.7.1 | MIT |
| buffer-crc32 | 0.2.13 | MIT |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause |
| buffer-indexof-polyfill | 1.0.2 | MIT |
| buffers | 0.1.1 | Unknown |
| bytes | 3.1.2 | MIT |
| c12 | 3.3.4 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| camelcase | 5.3.1 | MIT |
| canvas | 2.11.2 | MIT |
| canvas-roundrect-polyfill | 0.0.1 | MIT |
| canvg | 3.0.11 | MIT |
| ccount | 2.0.1 | MIT |
| chainsaw | 0.1.0 | MIT/X11 |
| character-entities | 2.0.2 | MIT |
| character-entities-html4 | 2.1.0 | MIT |
| character-entities-legacy | 3.0.0 | MIT |
| character-reference-invalid | 2.0.1 | MIT |
| chart.js | 4.5.1 | MIT |
| chevrotain | 11.0.3 | Apache-2.0 |
| chevrotain-allstar | 0.3.1 | MIT |
| chokidar | 3.6.0 5.0.0 | MIT |
| chownr | 2.0.0 | ISC |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| classnames | 2.5.1 | MIT |
| cliui | 6.0.0 8.0.1 | ISC |
| clone | 2.1.2 | MIT |
| clsx | 1.1.1 2.1.1 | MIT |
| cm6-theme-basic-light | 0.2.0 | MIT |
| codemirror | 6.0.2 | MIT |
| color-convert | 2.0.1 | MIT |
| color-name | 1.1.4 | MIT |
| color-support | 1.1.3 | ISC |
| combined-stream | 1.0.8 | MIT |
| comma-separated-tokens | 2.0.3 | MIT |
| commander | 7.2.0 8.3.0 | MIT |
| compress-commons | 4.1.2 | MIT |
| compute-scroll-into-view | 2.0.4 | MIT |
| concat-map | 0.0.1 | MIT |
| confbox | 0.2.4 | MIT |
| console-control-strings | 1.1.0 | ISC |
| content-disposition | 2.0.1 | MIT |
| content-type | 1.0.5 2.1.0 | MIT |
| cookie | 0.7.2 1.1.1 | MIT |
| cookie-signature | 1.2.2 | MIT |
| core-js | 3.50.0 | MIT |
| core-util-is | 1.0.3 | MIT |
| cors | 2.8.6 | MIT |
| cose-base | 1.0.3 2.2.0 | MIT |
| country-state-city | 3.2.1 | GPL-3.0 |
| crc-32 | 0.3.0 1.2.2 | Apache-2.0 |
| crc32-stream | 4.0.3 | MIT |
| crelt | 1.0.6 | MIT |
| cross-env | 7.0.3 | MIT |
| cross-spawn | 7.0.6 | MIT |
| css-line-break | 2.1.0 | MIT |
| cssom | 0.3.8 0.5.0 | MIT |
| cssstyle | 2.3.0 | MIT |
| csstype | 3.2.3 | MIT |
| csv-parse | 5.6.0 | MIT |
| cytoscape | 3.34.3 | MIT |
| cytoscape-cose-bilkent | 4.1.0 | MIT |
| cytoscape-fcose | 2.2.0 | MIT |
| d3 | 7.9.0 | ISC |
| d3-array | 2.12.1 | BSD-3-Clause |
| d3-array | 3.2.4 | ISC |
| d3-axis | 3.0.0 | ISC |
| d3-brush | 3.0.0 | ISC |
| d3-chord | 3.0.1 | ISC |
| d3-color | 3.1.0 | ISC |
| d3-contour | 4.0.2 | ISC |
| d3-delaunay | 6.0.4 | ISC |
| d3-dispatch | 3.0.1 | ISC |
| d3-drag | 3.0.0 | ISC |
| d3-dsv | 3.0.1 | ISC |
| d3-ease | 3.0.1 | BSD-3-Clause |
| d3-fetch | 3.0.1 | ISC |
| d3-force | 3.0.0 | ISC |
| d3-format | 3.1.2 | ISC |
| d3-geo | 3.1.1 | ISC |
| d3-hierarchy | 3.1.2 | ISC |
| d3-interpolate | 3.0.1 | ISC |
| d3-path | 1.0.9 | BSD-3-Clause |
| d3-path | 3.1.0 | ISC |
| d3-polygon | 3.0.1 | ISC |
| d3-quadtree | 3.0.1 | ISC |
| d3-random | 3.0.1 | ISC |
| d3-sankey | 0.12.3 | BSD-3-Clause |
| d3-scale | 4.0.2 | ISC |
| d3-scale-chromatic | 3.1.0 | ISC |
| d3-selection | 3.0.0 | ISC |
| d3-shape | 1.3.7 | BSD-3-Clause |
| d3-shape | 3.2.0 | ISC |
| d3-time | 3.1.0 | ISC |
| d3-time-format | 4.1.0 | ISC |
| d3-timer | 3.0.1 | ISC |
| d3-transition | 3.0.1 | ISC |
| d3-zoom | 3.0.0 | ISC |
| dagre-d3-es | 7.0.14 | MIT |
| data-uri-to-buffer | 4.0.1 | MIT |
| data-urls | 3.0.2 | MIT |
| date-fns | 4.3.0 | MIT |
| dayjs | 1.11.20 1.11.23 | MIT |
| debug | 4.4.3 | MIT |
| decamelize | 1.2.0 | MIT |
| decimal.js | 10.6.0 | MIT |
| decimal.js-light | 2.5.1 | MIT |
| decode-named-character-reference | 1.3.0 | MIT |
| decompress-response | 4.2.1 | MIT |
| deepmerge-ts | 7.1.5 | BSD-3-Clause |
| defu | 6.1.7 | MIT |
| delaunator | 5.1.0 | ISC |
| delayed-stream | 1.0.0 | MIT |
| delegates | 1.0.0 | MIT |
| denque | 2.1.0 | Apache-2.0 |
| depd | 2.0.0 | MIT |
| dequal | 2.0.3 | MIT |
| destr | 2.0.5 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| detect-node-es | 1.1.0 | MIT |
| devlop | 1.1.0 | MIT |
| dexie | 3.2.7 | Apache-2.0 |
| dfa | 1.2.0 | MIT |
| diff | 5.2.2 | BSD-3-Clause |
| dijkstrajs | 1.0.3 | MIT |
| docxtemplater | 3.71.0 | MIT |
| docxtemplater-image-module-free | 1.1.1 | MIT |
| domexception | 4.0.0 | MIT |
| dompurify | 3.4.16 | (MPL-2.0 OR Apache-2.0) |
| dotenv | 17.4.2 | BSD-2-Clause |
| downshift | 7.6.2 | MIT |
| dunder-proto | 1.0.1 | MIT |
| duplexer2 | 0.1.4 | BSD-3-Clause |
| duplexify | 4.1.3 | MIT |
| dxf-parser | 1.1.2 | MIT |
| earcut | 3.2.4 | ISC |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 |
| ee-first | 1.1.1 | MIT |
| effect | 3.20.0 | MIT |
| emoji-picker-react | 4.19.1 | MIT |
| emoji-regex | 8.0.0 | MIT |
| empathic | 2.0.0 | MIT |
| encodeurl | 2.0.0 | MIT |
| end-of-stream | 1.4.5 | MIT |
| enhanced-resolve | 5.21.0 | MIT |
| entities | 6.0.1 | BSD-2-Clause |
| env-paths | 3.0.0 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| es-set-tostringtag | 2.1.0 | MIT |
| es-toolkit | 1.47.0 | MIT |
| es6-promise-pool | 2.5.0 | MIT |
| esbuild | 0.25.12 | MIT |
| escalade | 3.2.0 | MIT |
| escape-html | 1.0.3 | MIT |
| escape-string-regexp | 5.0.0 | MIT |
| escodegen | 2.1.0 | BSD-2-Clause |
| esprima | 4.0.1 | BSD-2-Clause |
| estraverse | 5.3.0 | BSD-2-Clause |
| estree-util-is-identifier-name | 3.0.0 | MIT |
| estree-util-visit | 2.0.0 | MIT |
| esutils | 2.0.3 | BSD-2-Clause |
| etag | 1.8.1 | MIT |
| event-target-shim | 5.0.1 | MIT |
| eventemitter3 | 5.0.4 | MIT |
| events | 3.3.0 | MIT |
| eventsource | 3.0.7 | MIT |
| eventsource-parser | 3.1.1 | MIT |
| exceljs | 4.4.0 | MIT |
| express | 5.3.0 | MIT |
| express-rate-limit | 8.7.1 | MIT |
| exsolve | 1.0.8 | MIT |
| extend | 3.0.2 | MIT |
| fabric | 6.9.1 | MIT |
| farmhash-modern | 1.1.0 | MIT |
| fast-check | 3.23.2 | MIT |
| fast-csv | 4.3.6 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-equals | 5.4.0 | MIT |
| fast-png | 6.4.0 | MIT |
| fast-uri | 3.1.8 | BSD-3-Clause |
| fast-xml-builder | 1.3.1 | MIT |
| fast-xml-parser | 5.11.1 | MIT |
| fastdom | 1.0.12 | MIT |
| fault | 2.0.1 | MIT |
| faye-websocket | 0.11.4 | Apache-2.0 |
| fetch-blob | 3.2.0 | MIT |
| fflate | 0.8.3 | MIT |
| fill-range | 7.1.1 | MIT |
| finalhandler | 2.1.1 | MIT |
| find-up | 4.1.0 | MIT |
| firebase-admin | 13.10.0 | Apache-2.0 |
| flairup | 1.0.0 | MIT |
| fontkit | 2.0.4 | MIT |
| foreground-child | 3.3.1 | ISC |
| form-data | 2.5.6 4.0.6 | MIT |
| format | 0.2.2 | MIT |
| formdata-polyfill | 4.0.10 | MIT |
| forwarded | 0.2.0 | MIT |
| fractional-indexing | 3.2.0 | CC0-1.0 |
| framer-motion | 12.38.0 | MIT |
| fresh | 2.0.0 | MIT |
| fs-constants | 1.0.0 | MIT |
| fs-minipass | 2.1.0 | ISC |
| fs.realpath | 1.0.0 | ISC |
| fstream | 1.0.12 | ISC |
| function-bind | 1.1.2 | MIT |
| functional-red-black-tree | 1.0.1 | MIT |
| fuzzy | 0.1.3 | MIT |
| gauge | 3.0.2 | ISC |
| gaxios | 6.7.1 7.3.1 | Apache-2.0 |
| gcp-metadata | 6.1.1 8.1.2 | Apache-2.0 |
| generate-function | 2.3.1 | MIT |
| get-caller-file | 2.0.5 | ISC |
| get-intrinsic | 1.3.0 | MIT |
| get-nonce | 1.0.1 | MIT |
| get-port-please | 3.2.0 | MIT |
| get-proto | 1.0.1 | MIT |
| giget | 3.2.0 | MIT |
| gl-matrix | 3.4.4 | MIT |
| glob | 7.2.3 | ISC |
| glob-parent | 5.1.2 | ISC |
| glur | 1.1.2 | MIT |
| google-auth-library | 9.15.1 10.9.1 | Apache-2.0 |
| google-gax | 4.6.1 | Apache-2.0 |
| google-logging-utils | 0.0.2 1.1.3 | Apache-2.0 |
| gopd | 1.2.0 | MIT |
| graceful-fs | 4.2.11 | ISC |
| grammex | 3.1.12 | MIT |
| graphmatch | 1.1.1 | MIT |
| gtoken | 7.1.0 | MIT |
| hachure-fill | 0.5.2 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| has-unicode | 2.0.1 | ISC |
| hasown | 2.0.4 | MIT |
| hast-util-to-jsx-runtime | 2.3.6 | MIT |
| hast-util-whitespace | 3.0.0 | MIT |
| hls.js | 1.7.3 | Apache-2.0 |
| hono | 4.13.21 | MIT |
| html-encoding-sniffer | 3.0.0 | MIT |
| html-entities | 2.6.0 | MIT |
| html-url-attributes | 3.0.1 | MIT |
| html2canvas | 1.4.1 | MIT |
| http_ece | 1.2.0 | MIT |
| http-errors | 2.0.1 | MIT |
| http-parser-js | 0.5.10 | MIT |
| http-proxy-agent | 5.0.0 | MIT |
| http-status-codes | 2.3.0 | MIT |
| https | 1.0.0 | ISC |
| https-proxy-agent | 5.0.1 7.0.6 | MIT |
| iceberg-js | 0.8.1 | MIT |
| iconv-lite | 0.6.3 0.7.2 0.7.3 | MIT |
| ieee754 | 1.2.1 | BSD-3-Clause |
| image-blob-reduce | 3.0.1 | MIT |
| image-size | 1.2.1 | MIT |
| immediate | 3.0.6 | MIT |
| immer | 10.2.0 11.1.8 | MIT |
| immutable | 4.3.9 | MIT |
| import-meta-resolve | 4.2.0 | MIT |
| inflight | 1.0.6 | ISC |
| inherits | 2.0.4 | ISC |
| inline-style-parser | 0.2.7 | MIT |
| internmap | 1.0.1 2.0.3 | ISC |
| iobuffer | 5.4.0 | MIT |
| ip-address | 10.7.4 | MIT |
| ipaddr.js | 1.9.1 | MIT |
| is-alphabetical | 2.0.1 | MIT |
| is-alphanumerical | 2.0.1 | MIT |
| is-binary-path | 2.1.0 | MIT |
| is-decimal | 2.0.1 | MIT |
| is-extglob | 2.1.1 | MIT |
| is-fullwidth-code-point | 3.0.0 | MIT |
| is-glob | 4.0.3 | MIT |
| is-hexadecimal | 2.0.1 | MIT |
| is-number | 7.0.0 | MIT |
| is-plain-obj | 4.1.0 | MIT |
| is-potential-custom-element-name | 1.0.1 | MIT |
| is-promise | 4.0.0 | MIT |
| is-property | 1.0.2 | MIT |
| is-stream | 2.0.1 | MIT |
| is-unsafe | 2.0.2 | MIT |
| isarray | 1.0.0 | MIT |
| isexe | 2.0.0 | ISC |
| isomorphic.js | 0.2.5 | MIT |
| jiti | 2.6.1 | MIT |
| jose | 4.15.9 5.10.0 6.2.10 6.2.12 | MIT |
| jotai | 2.11.0 | MIT |
| jotai-scope | 0.7.2 | MIT |
| js-md5 | 0.8.3 | MIT |
| js-tokens | 4.0.0 | MIT |
| js-yaml | 4.3.2 | MIT |
| jsdom | 20.0.3 | MIT |
| json-bigint | 1.0.0 | MIT |
| json-schema-traverse | 1.0.0 | MIT |
| json-schema-typed | 8.0.2 | BSD-2-Clause |
| json-stringify-pretty-compact | 4.0.0 | MIT |
| jsonwebtoken | 9.0.3 | MIT |
| jspdf | 4.2.1 | MIT |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) |
| jwa | 2.0.1 | MIT |
| jwks-rsa | 3.2.2 | MIT |
| jws | 4.0.1 | MIT |
| katex | 0.16.47 | MIT |
| kdbush | 4.1.0 | ISC |
| khroma | 2.1.0 | Unknown |
| kleur | 4.1.5 | MIT |
| langium | 3.3.1 | MIT |
| layout-base | 1.0.2 2.0.1 | MIT |
| lazystream | 1.0.1 | MIT |
| lexical | 0.35.0 | MIT |
| lib0 | 0.2.117 | MIT |
| lie | 3.3.0 | MIT |
| lightningcss | 1.32.0 | MPL-2.0 |
| lightningcss-win32-x64-msvc | 1.32.0 | MPL-2.0 |
| limiter | 1.1.5 | MIT |
| linebreak | 1.1.0 | MIT |
| linkifyjs | 4.3.3 | MIT |
| listenercount | 1.0.1 | ISC |
| livekit-client | 2.21.0 | Apache-2.0 |
| livekit-server-sdk | 2.18.0 | Apache-2.0 |
| locate-path | 5.0.0 | MIT |
| lodash-es | 4.18.1 | MIT |
| lodash.camelcase | 4.3.0 | MIT |
| lodash.clonedeep | 4.5.0 | MIT |
| lodash.debounce | 4.0.8 | MIT |
| lodash.defaults | 4.2.0 | MIT |
| lodash.difference | 4.5.0 | MIT |
| lodash.escaperegexp | 4.1.2 | MIT |
| lodash.flatten | 4.4.0 | MIT |
| lodash.groupby | 4.6.0 | MIT |
| lodash.includes | 4.3.0 | MIT |
| lodash.isboolean | 3.0.3 | MIT |
| lodash.isequal | 4.5.0 | MIT |
| lodash.isfunction | 3.0.9 | MIT |
| lodash.isinteger | 4.0.4 | MIT |
| lodash.isnil | 4.0.0 | MIT |
| lodash.isnumber | 3.0.3 | MIT |
| lodash.isplainobject | 4.0.6 | MIT |
| lodash.isstring | 4.0.1 | MIT |
| lodash.isundefined | 3.0.1 | MIT |
| lodash.once | 4.1.1 | MIT |
| lodash.throttle | 4.1.1 | MIT |
| lodash.union | 4.6.0 | MIT |
| lodash.uniq | 4.5.0 | MIT |
| loglevel | 1.9.2 | MIT |
| long | 5.3.2 | Apache-2.0 |
| longest-streak | 3.1.0 | MIT |
| loose-envify | 1.4.0 | MIT |
| lru-cache | 6.0.0 | ISC |
| lru-memoizer | 2.3.0 | MIT |
| lru.min | 1.1.4 | MIT |
| lucide-react | 1.59.0 1.78.0 | ISC |
| lucide-static | 1.63.0 | ISC |
| magic-string | 0.30.21 | MIT |
| make-cancellable-promise | 2.0.0 | MIT |
| make-dir | 3.1.0 | MIT |
| make-event-props | 2.0.0 | MIT |
| maplibre-gl | 6.11.2 | BSD-3-Clause |
| markdown-table | 3.0.4 | MIT |
| marked | 16.4.2 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| mdast-util-directive | 3.1.0 | MIT |
| mdast-util-find-and-replace | 3.0.2 | MIT |
| mdast-util-from-markdown | 2.0.3 | MIT |
| mdast-util-frontmatter | 2.0.1 | MIT |
| mdast-util-gfm | 3.1.0 | MIT |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT |
| mdast-util-gfm-footnote | 2.1.0 | MIT |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT |
| mdast-util-gfm-table | 2.0.0 | MIT |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT |
| mdast-util-highlight-mark | 1.2.2 | MIT |
| mdast-util-mdx | 3.0.0 | MIT |
| mdast-util-mdx-expression | 2.0.1 | MIT |
| mdast-util-mdx-jsx | 3.2.0 | MIT |
| mdast-util-mdxjs-esm | 2.0.1 | MIT |
| mdast-util-phrasing | 4.1.0 | MIT |
| mdast-util-to-hast | 13.2.1 | MIT |
| mdast-util-to-markdown | 2.1.2 | MIT |
| mdast-util-to-string | 4.0.0 | MIT |
| media-typer | 1.1.1 | MIT |
| merge-descriptors | 2.0.0 | MIT |
| merge-refs | 2.0.0 | MIT |
| mermaid | 11.17.2 | MIT |
| micromark | 4.0.2 | MIT |
| micromark-core-commonmark | 2.0.3 | MIT |
| micromark-extension-directive | 3.0.2 | MIT |
| micromark-extension-frontmatter | 2.0.0 | MIT |
| micromark-extension-gfm | 3.0.0 | MIT |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT |
| micromark-extension-gfm-footnote | 2.1.0 | MIT |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT |
| micromark-extension-gfm-table | 2.1.1 | MIT |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT |
| micromark-extension-highlight-mark | 1.2.0 | MIT |
| micromark-extension-mdx-expression | 3.0.1 | MIT |
| micromark-extension-mdx-jsx | 3.0.2 | MIT |
| micromark-extension-mdx-md | 2.0.0 | MIT |
| micromark-extension-mdxjs | 3.0.0 | MIT |
| micromark-extension-mdxjs-esm | 3.0.0 | MIT |
| micromark-factory-destination | 2.0.1 | MIT |
| micromark-factory-label | 2.0.1 | MIT |
| micromark-factory-mdx-expression | 2.0.3 | MIT |
| micromark-factory-space | 2.0.1 | MIT |
| micromark-factory-title | 2.0.1 | MIT |
| micromark-factory-whitespace | 2.0.1 | MIT |
| micromark-util-character | 2.1.1 | MIT |
| micromark-util-chunked | 2.0.1 | MIT |
| micromark-util-classify-character | 2.0.1 | MIT |
| micromark-util-combine-extensions | 2.0.1 | MIT |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT |
| micromark-util-decode-string | 2.0.1 | MIT |
| micromark-util-encode | 2.0.1 | MIT |
| micromark-util-events-to-acorn | 2.0.3 | MIT |
| micromark-util-html-tag-name | 2.0.1 | MIT |
| micromark-util-normalize-identifier | 2.0.1 | MIT |
| micromark-util-resolve-all | 2.0.1 | MIT |
| micromark-util-sanitize-uri | 2.0.1 | MIT |
| micromark-util-subtokenize | 2.1.0 | MIT |
| micromark-util-symbol | 2.0.1 | MIT |
| micromark-util-types | 2.0.2 | MIT |
| mime | 3.0.0 | MIT |
| mime-db | 1.52.0 1.54.0 | MIT |
| mime-types | 2.1.35 3.0.2 | MIT |
| mimic-response | 2.1.0 | MIT |
| minimalistic-assert | 1.0.1 | ISC |
| minimatch | 3.1.5 5.1.9 | ISC |
| minimist | 1.2.8 | MIT |
| minipass | 3.3.6 5.0.0 | ISC |
| minizlib | 2.1.2 | MIT |
| mkdirp | 0.5.6 1.0.4 | MIT |
| modern-screenshot | 4.7.0 | MIT |
| motion | 12.38.0 | MIT |
| motion-dom | 12.38.0 | MIT |
| motion-utils | 12.36.0 | MIT |
| mri | 1.2.0 | MIT |
| ms | 2.1.3 | MIT |
| multimath | 2.0.0 | MIT |
| murmurhash-js | 1.0.0 | MIT |
| mysql2 | 3.15.3 | MIT |
| named-placeholders | 1.1.6 | MIT |
| nan | 2.30.0 | MIT |
| nanoid | 5.1.16 | MIT |
| negotiator | 1.1.0 | MIT |
| node-cache | 5.1.2 | MIT |
| node-domexception | 1.0.0 | MIT |
| node-fetch | 2.7.0 3.3.2 | MIT |
| node-ical | 0.22.0 | Apache-2.0 |
| nodemailer | 10.6.1 | MIT-0 |
| nopt | 5.0.0 | ISC |
| normalize-path | 3.0.0 | MIT |
| npmlog | 5.0.1 | ISC |
| nwsapi | 2.2.28 | MIT |
| object-assign | 4.1.1 | MIT |
| object-hash | 3.0.0 | MIT |
| object-inspect | 1.13.4 | MIT |
| ohash | 2.0.11 | MIT |
| on-finished | 2.4.1 | MIT |
| once | 1.4.0 | ISC |
| open-color | 1.9.1 | MIT |
| orderedmap | 2.1.1 | MIT |
| p-limit | 2.3.0 3.1.0 | MIT |
| p-locate | 4.1.0 | MIT |
| p-try | 2.2.0 | MIT |
| package-manager-detector | 1.8.0 | MIT |
| pako | 0.2.9 | MIT |
| pako | 1.0.11 2.0.3 2.2.0 | (MIT AND Zlib) |
| parse-entities | 4.0.2 | MIT |
| parse5 | 7.3.0 | MIT |
| parseurl | 1.3.3 | MIT |
| path-data-parser | 0.1.0 | MIT |
| path-exists | 4.0.0 | MIT |
| path-expression-matcher | 1.6.2 | MIT |
| path-is-absolute | 1.0.1 | MIT |
| path-key | 3.1.1 | MIT |
| path-to-regexp | 8.4.2 | MIT |
| pathe | 2.0.3 | MIT |
| pbf | 5.1.2 | BSD-3-Clause |
| pdf-lib | 1.17.1 | MIT |
| pdfjs-dist | 5.4.296 | Apache-2.0 |
| pdfkit | 0.18.0 | MIT |
| pend | 1.2.0 | MIT |
| perfect-debounce | 2.1.0 | MIT |
| perfect-freehand | 1.2.0 | MIT |
| performance-now | 2.1.0 | MIT |
| pg | 8.20.0 | MIT |
| pg-cloudflare | 1.3.0 | MIT |
| pg-connection-string | 2.12.0 | MIT |
| pg-int8 | 1.0.1 | ISC |
| pg-pool | 3.13.0 | MIT |
| pg-protocol | 1.13.0 | MIT |
| pg-types | 2.2.0 | MIT |
| pgpass | 1.0.5 | MIT |
| pica | 7.1.1 | MIT |
| picomatch | 2.3.2 | MIT |
| pizzip | 3.3.0 | (MIT OR GPL-3.0) |
| pkce-challenge | 5.0.1 | MIT |
| pkg-types | 2.3.1 | MIT |
| png-chunk-text | 1.0.0 | MIT |
| png-chunks-encode | 1.0.0 | MIT |
| png-chunks-extract | 1.0.0 | MIT |
| png-js | 1.1.0 | MIT |
| pngjs | 5.0.0 | MIT |
| points-on-curve | 0.2.0 1.0.1 | MIT |
| points-on-path | 0.2.1 | MIT |
| postgres | 3.4.7 | Unlicense |
| postgres-array | 2.0.0 3.0.4 | MIT |
| postgres-bytea | 1.0.1 | MIT |
| postgres-date | 1.0.7 | MIT |
| postgres-interval | 1.2.0 | MIT |
| potpack | 2.1.0 | ISC |
| pptxgenjs | 4.0.1 | MIT |
| prisma | 7.8.0 | Apache-2.0 |
| prismjs | 1.30.0 | MIT |
| process-nextick-args | 2.0.1 | MIT |
| prop-types | 15.8.1 | MIT |
| proper-lockfile | 4.1.2 | MIT |
| property-information | 7.1.0 | MIT |
| prosemirror-changeset | 2.4.1 | MIT |
| prosemirror-commands | 1.7.1 | MIT |
| prosemirror-dropcursor | 1.8.2 | MIT |
| prosemirror-gapcursor | 1.4.1 | MIT |
| prosemirror-history | 1.5.0 | MIT |
| prosemirror-inputrules | 1.5.1 | MIT |
| prosemirror-keymap | 1.2.3 | MIT |
| prosemirror-model | 1.25.11 | MIT |
| prosemirror-schema-list | 1.5.1 | MIT |
| prosemirror-state | 1.4.4 | MIT |
| prosemirror-tables | 1.8.5 | MIT |
| prosemirror-transform | 1.12.0 | MIT |
| prosemirror-view | 1.42.3 | MIT |
| proto3-json-serializer | 2.0.2 | Apache-2.0 |
| protobufjs | 7.6.6 | BSD-3-Clause |
| protocol-buffers-schema | 3.6.1 | MIT |
| proxy-addr | 2.0.8 | MIT |
| psl | 1.15.0 | MIT |
| punycode | 2.3.1 | MIT |
| pure-rand | 6.1.0 | MIT |
| pwacompat | 2.0.17 | Apache-2.0 |
| qrcode | 1.5.4 | MIT |
| qs | 6.16.1 | BSD-3-Clause |
| querystringify | 2.2.0 | MIT |
| queue | 6.0.2 | MIT |
| quickselect | 3.0.0 | ISC |
| raf | 3.4.1 | MIT |
| range-parser | 1.3.0 | MIT |
| raw-body | 3.0.2 | MIT |
| rc9 | 3.0.1 | MIT |
| react | 19.2.5 19.2.7 19.3.0 19.3.1 | MIT |
| react-dom | 19.2.5 19.3.0 19.3.1 | MIT |
| react-error-boundary | 3.1.4 | MIT |
| react-hook-form | 7.75.0 | MIT |
| react-is | 16.13.1 17.0.2 19.2.6 | MIT |
| react-markdown | 10.1.0 | MIT |
| react-pdf | 10.4.1 | MIT |
| react-redux | 9.3.0 | MIT |
| react-remove-scroll | 2.7.2 | MIT |
| react-remove-scroll-bar | 2.3.8 | MIT |
| react-router | 7.18.3 | MIT |
| react-router-dom | 7.18.3 | MIT |
| react-style-singleton | 2.2.3 | MIT |
| readable-stream | 2.3.8 3.6.2 | MIT |
| readdir-glob | 1.1.3 | Apache-2.0 |
| readdirp | 3.6.0 5.0.0 | MIT |
| recharts | 3.8.1 | MIT |
| redux | 5.0.1 | MIT |
| redux-thunk | 3.1.0 | MIT |
| regenerator-runtime | 0.13.11 | MIT |
| remark-gfm | 4.0.1 | MIT |
| remark-parse | 11.0.0 | MIT |
| remark-rehype | 11.1.2 | MIT |
| remark-stringify | 11.0.0 | MIT |
| remeda | 2.33.4 | MIT |
| require-directory | 2.1.1 | MIT |
| require-from-string | 2.0.2 | MIT |
| require-main-filename | 2.0.0 | ISC |
| requires-port | 1.0.0 | MIT |
| reselect | 5.1.1 | MIT |
| resolve-protobuf-schema | 2.1.0 | MIT |
| restructure | 3.0.2 | MIT |
| retry | 0.12.0 0.13.1 | MIT |
| retry-request | 7.0.2 | MIT |
| rgbcolor | 1.0.1 | MIT |
| rimraf | 2.7.1 3.0.2 | ISC |
| robust-predicates | 3.0.3 | Unlicense |
| rope-sequence | 1.3.4 | MIT |
| roughjs | 4.6.4 4.6.6 | MIT |
| router | 2.2.0 | MIT |
| rrule | 2.8.1 | BSD-3-Clause |
| rw | 1.3.3 | BSD-3-Clause |
| rxjs | 7.8.2 | Apache-2.0 |
| sade | 1.8.1 | MIT |
| safe-buffer | 5.1.2 5.2.1 | MIT |
| safer-buffer | 2.1.2 | MIT |
| sass | 1.51.0 | MIT |
| saxes | 5.0.1 6.0.0 | ISC |
| scheduler | 0.27.0 0.28.0 | MIT |
| sdp | 3.2.2 | MIT |
| sdp-transform | 2.15.0 | MIT |
| semver | 6.3.1 7.8.5 | ISC |
| send | 1.2.1 | MIT |
| seq-queue | 0.0.5 | MIT |
| serve-static | 2.2.1 | MIT |
| set-blocking | 2.0.0 | ISC |
| set-cookie-parser | 2.7.2 | MIT |
| setimmediate | 1.0.5 | MIT |
| setprototypeof | 1.2.0 | ISC |
| sharp | 0.35.5 | Apache-2.0 |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| side-channel | 1.1.1 | MIT |
| side-channel-list | 1.0.1 | MIT |
| side-channel-map | 1.0.1 | MIT |
| side-channel-weakmap | 1.0.2 | MIT |
| signal-exit | 3.0.7 4.1.0 | ISC |
| simple-concat | 1.0.1 | MIT |
| simple-get | 3.1.1 | MIT |
| sliced | 1.0.1 | MIT |
| sonner | 2.0.7 | MIT |
| source-map | 0.6.1 | BSD-3-Clause |
| source-map-js | 1.2.2 | BSD-3-Clause |
| space-separated-tokens | 2.0.2 | MIT |
| split2 | 4.2.0 | ISC |
| sqlstring | 2.3.3 | MIT |
| stackblur-canvas | 2.7.0 | MIT |
| statuses | 2.0.2 | MIT |
| std-env | 3.10.0 | MIT |
| stream-events | 1.0.5 | MIT |
| stream-shift | 1.0.3 | MIT |
| strictdom | 1.0.1 | MIT |
| string_decoder | 1.1.1 | MIT |
| string-width | 4.2.3 | MIT |
| stringify-entities | 4.0.4 | MIT |
| strip-ansi | 6.0.1 | MIT |
| stripe | 22.2.0 | MIT |
| strnum | 2.4.2 | MIT |
| stubs | 3.0.0 | MIT |
| style-mod | 4.1.3 | MIT |
| style-to-js | 1.1.21 | MIT |
| style-to-object | 1.0.14 | MIT |
| stylis | 4.4.0 | MIT |
| svg-pathdata | 6.0.3 | MIT |
| symbol-tree | 3.2.4 | MIT |
| tabbable | 6.4.0 | MIT |
| tailwind-merge | 3.5.0 | MIT |
| tailwindcss | 4.2.4 | MIT |
| tapable | 2.3.3 | MIT |
| tar | 6.2.1 | ISC |
| tar-stream | 2.2.0 | MIT |
| teeny-request | 9.0.0 | Apache-2.0 |
| text-segmentation | 1.0.3 | MIT |
| tiny-inflate | 1.0.3 | MIT |
| tiny-invariant | 1.3.3 | MIT |
| tinyexec | 1.3.1 | MIT |
| tinyqueue | 3.0.0 | ISC |
| tldts | 7.4.19 | MIT |
| tldts-core | 7.4.20 | MIT |
| tmp | 0.2.7 | MIT |
| to-regex-range | 5.0.1 | MIT |
| toidentifier | 1.0.1 | MIT |
| tough-cookie | 4.1.4 | BSD-3-Clause |
| tr46 | 0.0.3 3.0.0 | MIT |
| traverse | 0.3.9 | MIT/X11 |
| trim-lines | 3.0.1 | MIT |
| trough | 2.2.0 | MIT |
| ts-custom-error | 3.3.1 | MIT |
| ts-dedent | 2.3.0 | MIT |
| tslib | 1.14.1 2.8.1 | 0BSD |
| tunnel-rat | 0.1.2 | MIT |
| type-is | 2.1.0 | MIT |
| typed-emitter | 2.1.0 | MIT |
| undici-types | 6.21.0 7.19.2 | MIT |
| unicode-properties | 1.4.1 | MIT |
| unicode-trie | 2.0.0 | MIT |
| unidiff | 1.0.4 | MIT |
| unified | 11.0.5 | MIT |
| unist-util-is | 6.0.1 | MIT |
| unist-util-position | 5.0.0 | MIT |
| unist-util-position-from-estree | 2.0.0 | MIT |
| unist-util-stringify-position | 4.0.0 | MIT |
| unist-util-visit | 5.1.0 | MIT |
| unist-util-visit-parents | 6.0.2 | MIT |
| universalify | 0.2.0 | MIT |
| unpipe | 1.0.0 | MIT |
| unzipper | 0.10.14 | MIT |
| url-parse | 1.5.10 | MIT |
| use-callback-ref | 1.3.3 | MIT |
| use-sidecar | 1.1.3 | MIT |
| use-sync-external-store | 1.6.0 | MIT |
| util-deprecate | 1.0.2 | MIT |
| utrie | 1.0.2 | MIT |
| uuid | 8.3.2 9.0.1 14.0.2 | MIT |
| uvu | 0.5.6 | MIT |
| valibot | 1.4.2 | MIT |
| vary | 1.1.2 | MIT |
| vfile | 6.0.3 | MIT |
| vfile-message | 4.0.3 | MIT |
| victory-vendor | 37.3.6 | MIT AND ISC |
| vscode-jsonrpc | 8.2.0 | MIT |
| vscode-languageserver | 9.0.1 | MIT |
| vscode-languageserver-protocol | 3.17.5 | MIT |
| vscode-languageserver-textdocument | 1.0.14 | MIT |
| vscode-languageserver-types | 3.17.5 | MIT |
| vscode-uri | 3.0.8 | MIT |
| w3c-keyname | 2.2.8 | MIT |
| w3c-xmlserializer | 4.0.0 | MIT |
| warning | 4.0.3 | MIT |
| web-push | 3.6.7 | MPL-2.0 |
| web-streams-polyfill | 3.3.3 | MIT |
| webidl-conversions | 3.0.1 7.0.0 | BSD-2-Clause |
| webrtc-adapter | 9.0.6 | BSD-3-Clause |
| websocket-driver | 0.7.5 | Apache-2.0 |
| websocket-extensions | 0.1.4 | Apache-2.0 |
| webworkify | 1.5.0 | MIT |
| whatwg-encoding | 2.0.0 | MIT |
| whatwg-mimetype | 3.0.0 | MIT |
| whatwg-url | 5.0.0 11.0.0 | MIT |
| which | 2.0.2 | ISC |
| which-module | 2.0.1 | ISC |
| wide-align | 1.1.5 | ISC |
| wrap-ansi | 6.2.0 7.0.0 | MIT |
| wrappy | 1.0.2 | ISC |
| ws | 8.21.3 | MIT |
| xml-name-validator | 4.0.0 | Apache-2.0 |
| xml-naming | 0.3.0 | MIT |
| xmlchars | 2.2.0 | MIT |
| xtend | 4.0.2 | MIT |
| y-protocols | 1.0.7 | MIT |
| y18n | 4.0.3 5.0.8 | ISC |
| yallist | 4.0.0 | ISC |
| yargs | 15.4.1 17.7.3 | MIT |
| yargs-parser | 18.1.3 21.1.1 | ISC |
| yauzl | 3.4.0 | MIT |
| yjs | 13.6.31 | MIT |
| yocto-queue | 0.1.0 | MIT |
| zeptomatch | 2.1.0 | MIT |
| zip-stream | 4.1.1 | MIT |
| zod | 4.6.7 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |
| zundo | 2.3.0 | MIT |
| zustand | 4.5.7 5.0.15 5.1.0 | MIT |
| zwitch | 2.0.4 | MIT |

## Rust (crates del escritorio)

| Paquete | Versión | Licencia declarada |
|---|---|---|
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |
| ahash | 0.7.8 | MIT OR Apache-2.0 |
| aho-corasick | 1.1.4 | Unlicense OR MIT |
| alloc-no-stdlib | 2.0.4 | BSD-3-Clause |
| alloc-stdlib | 0.2.2 | BSD-3-Clause |
| allocator-api2 | 0.2.21 | MIT OR Apache-2.0 |
| android_system_properties | 0.1.5 | MIT OR Apache-2.0 |
| anyhow | 1.0.102 | MIT OR Apache-2.0 |
| arrayvec | 0.7.6 | MIT OR Apache-2.0 |
| async-broadcast | 0.7.2 | MIT OR Apache-2.0 |
| async-channel | 2.5.0 | Apache-2.0 OR MIT |
| async-executor | 1.14.0 | Apache-2.0 OR MIT |
| async-io | 2.6.0 | Apache-2.0 OR MIT |
| async-lock | 3.4.2 | Apache-2.0 OR MIT |
| async-process | 2.5.0 | Apache-2.0 OR MIT |
| async-recursion | 1.1.1 | MIT OR Apache-2.0 |
| async-signal | 0.2.14 | Apache-2.0 OR MIT |
| async-task | 4.7.1 | Apache-2.0 OR MIT |
| async-trait | 0.1.92 | MIT OR Apache-2.0 |
| atk | 0.18.2 | MIT |
| atk-sys | 0.18.2 | MIT |
| atoi | 2.0.0 | MIT |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT |
| autocfg | 1.5.0 | Apache-2.0 OR MIT |
| base64 | 0.21.7 | MIT OR Apache-2.0 |
| base64 | 0.22.1 | MIT OR Apache-2.0 |
| base64ct | 1.8.3 | Apache-2.0 OR MIT |
| bit-set | 0.8.0 | Apache-2.0 OR MIT |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT |
| bitflags | 1.3.2 | MIT OR Apache-2.0 |
| bitflags | 2.11.1 | MIT OR Apache-2.0 |
| bitvec | 1.0.1 | MIT |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 |
| block2 | 0.6.2 | MIT |
| blocking | 1.7.0 | Apache-2.0 OR MIT |
| borsh | 1.6.1 | MIT OR Apache-2.0 |
| borsh-derive | 1.6.1 | Apache-2.0 |
| brotli | 8.0.2 | BSD-3-Clause AND MIT |
| brotli-decompressor | 5.0.0 | BSD-3-Clause OR MIT |
| bumpalo | 3.20.2 | MIT OR Apache-2.0 |
| bytecheck | 0.6.12 | MIT |
| bytecheck_derive | 0.6.12 | MIT |
| bytemuck | 1.25.0 | Zlib OR Apache-2.0 OR MIT |
| byteorder | 1.5.0 | Unlicense OR MIT |
| bytes | 1.11.1 | MIT |
| cairo-rs | 0.18.5 | MIT |
| cairo-sys-rs | 0.18.2 | MIT |
| camino | 1.2.2 | MIT OR Apache-2.0 |
| cargo_metadata | 0.19.2 | MIT |
| cargo_toml | 0.22.3 | Apache-2.0 OR MIT |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 |
| cc | 1.2.61 | MIT OR Apache-2.0 |
| cesu8 | 1.1.0 | Apache-2.0 OR MIT |
| cfb | 0.7.3 | MIT |
| cfg_aliases | 0.2.1 | MIT |
| cfg-expr | 0.15.8 | MIT OR Apache-2.0 |
| cfg-if | 1.0.4 | MIT OR Apache-2.0 |
| chacha20 | 0.10.2 | MIT OR Apache-2.0 |
| chrono | 0.4.44 | MIT OR Apache-2.0 |
| combine | 4.6.7 | MIT |
| concurrent-queue | 2.5.0 | Apache-2.0 OR MIT |
| const-oid | 0.9.6 | Apache-2.0 OR MIT |
| const-random | 0.1.18 | MIT OR Apache-2.0 |
| const-random-macro | 0.1.16 | MIT OR Apache-2.0 |
| cookie | 0.18.1 | MIT OR Apache-2.0 |
| core-foundation | 0.10.1 | MIT OR Apache-2.0 |
| core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 |
| core-graphics | 0.25.0 | MIT OR Apache-2.0 |
| core-graphics-types | 0.2.0 | MIT OR Apache-2.0 |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 |
| cpufeatures | 0.3.1 | MIT OR Apache-2.0 |
| crc | 3.4.0 | MIT OR Apache-2.0 |
| crc-catalog | 2.5.0 | MIT OR Apache-2.0 |
| crc32fast | 1.5.0 | MIT OR Apache-2.0 |
| crossbeam-channel | 0.5.15 | MIT OR Apache-2.0 |
| crossbeam-queue | 0.3.12 | MIT OR Apache-2.0 |
| crossbeam-utils | 0.8.21 | MIT OR Apache-2.0 |
| crunchy | 0.2.4 | MIT |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 |
| cssparser | 0.36.0 | MPL-2.0 |
| cssparser-macros | 0.6.1 | MPL-2.0 |
| ctor | 0.8.0 | Apache-2.0 OR MIT |
| ctor-proc-macro | 0.0.7 | Apache-2.0 OR MIT |
| darling | 0.23.0 | MIT |
| darling_core | 0.23.0 | MIT |
| darling_macro | 0.23.0 | MIT |
| dbus | 0.9.11 | Apache-2.0 OR MIT |
| der | 0.7.10 | Apache-2.0 OR MIT |
| deranged | 0.5.8 | MIT OR Apache-2.0 |
| derive_more | 2.1.1 | MIT |
| derive_more-impl | 2.1.1 | MIT |
| digest | 0.10.7 | MIT OR Apache-2.0 |
| dirs | 6.0.0 | MIT OR Apache-2.0 |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 |
| dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT |
| displaydoc | 0.2.5 | MIT OR Apache-2.0 |
| dlopen2 | 0.8.2 | MIT |
| dlopen2_derive | 0.4.3 | MIT |
| dlv-list | 0.5.2 | MIT OR Apache-2.0 |
| dom_query | 0.27.0 | MIT |
| dotenvy | 0.15.7 | MIT |
| dpi | 0.1.2 | Apache-2.0 AND MIT |
| dtoa | 1.0.11 | MIT OR Apache-2.0 |
| dtoa-short | 0.3.5 | MPL-2.0 |
| dtor | 0.3.0 | Apache-2.0 OR MIT |
| dtor-proc-macro | 0.0.6 | Apache-2.0 OR MIT |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 |
| either | 1.16.0 | MIT OR Apache-2.0 |
| embed_plist | 1.2.2 | MIT OR Apache-2.0 |
| embed-resource | 3.0.9 | MIT |
| encoding_rs | 0.8.35 | (Apache-2.0 OR MIT) AND BSD-3-Clause |
| endi | 1.1.1 | MIT |
| enumflags2 | 0.7.12 | MIT OR Apache-2.0 |
| enumflags2_derive | 0.7.12 | MIT OR Apache-2.0 |
| equivalent | 1.0.2 | Apache-2.0 OR MIT |
| erased-serde | 0.4.10 | MIT OR Apache-2.0 |
| errno | 0.3.14 | MIT OR Apache-2.0 |
| etcetera | 0.8.0 | MIT OR Apache-2.0 |
| event-listener | 5.4.1 | Apache-2.0 OR MIT |
| event-listener-strategy | 0.5.4 | Apache-2.0 OR MIT |
| fastrand | 2.4.1 | Apache-2.0 OR MIT |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 |
| field-offset | 0.3.6 | MIT OR Apache-2.0 |
| find-msvc-tools | 0.1.9 | MIT OR Apache-2.0 |
| flate2 | 1.1.9 | MIT OR Apache-2.0 |
| flume | 0.11.1 | Apache-2.0 OR MIT |
| fnv | 1.0.7 | Apache-2.0  OR  MIT |
| foldhash | 0.1.5 | Zlib |
| foldhash | 0.2.0 | Zlib |
| foreign-types | 0.5.0 | MIT OR Apache-2.0 |
| foreign-types-macros | 0.2.3 | MIT OR Apache-2.0 |
| foreign-types-shared | 0.3.1 | MIT OR Apache-2.0 |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 |
| funty | 2.0.0 | MIT |
| futures-channel | 0.3.32 | MIT OR Apache-2.0 |
| futures-core | 0.3.32 | MIT OR Apache-2.0 |
| futures-executor | 0.3.32 | MIT OR Apache-2.0 |
| futures-intrusive | 0.5.0 | MIT OR Apache-2.0 |
| futures-io | 0.3.32 | MIT OR Apache-2.0 |
| futures-lite | 2.6.1 | Apache-2.0 OR MIT |
| futures-macro | 0.3.32 | MIT OR Apache-2.0 |
| futures-sink | 0.3.32 | MIT OR Apache-2.0 |
| futures-task | 0.3.32 | MIT OR Apache-2.0 |
| futures-util | 0.3.32 | MIT OR Apache-2.0 |
| gdk | 0.18.2 | MIT |
| gdk-pixbuf | 0.18.5 | MIT |
| gdk-pixbuf-sys | 0.18.0 | MIT |
| gdk-sys | 0.18.2 | MIT |
| gdkwayland-sys | 0.18.2 | MIT |
| gdkx11 | 0.18.2 | MIT |
| gdkx11-sys | 0.18.2 | MIT |
| generic-array | 0.14.7 | MIT |
| getrandom | 0.2.17 | MIT OR Apache-2.0 |
| getrandom | 0.3.4 | MIT OR Apache-2.0 |
| getrandom | 0.4.2 | MIT OR Apache-2.0 |
| gio | 0.18.4 | MIT |
| gio-sys | 0.18.1 | MIT |
| glib | 0.18.5 | MIT |
| glib-macros | 0.18.5 | MIT |
| glib-sys | 0.18.1 | MIT |
| glob | 0.3.3 | MIT OR Apache-2.0 |
| gobject-sys | 0.18.0 | MIT |
| gtk | 0.18.2 | MIT |
| gtk-sys | 0.18.2 | MIT |
| gtk3-macros | 0.18.2 | MIT |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 |
| hashbrown | 0.14.5 | MIT OR Apache-2.0 |
| hashbrown | 0.15.5 | MIT OR Apache-2.0 |
| hashbrown | 0.17.0 | MIT OR Apache-2.0 |
| hashlink | 0.10.0 | MIT OR Apache-2.0 |
| heck | 0.4.1 | MIT OR Apache-2.0 |
| heck | 0.5.0 | MIT OR Apache-2.0 |
| hermit-abi | 0.5.3 | MIT OR Apache-2.0 |
| hex | 0.4.3 | MIT OR Apache-2.0 |
| hkdf | 0.12.4 | MIT OR Apache-2.0 |
| hmac | 0.12.1 | MIT OR Apache-2.0 |
| home | 0.5.12 | MIT OR Apache-2.0 |
| html5ever | 0.38.0 | MIT OR Apache-2.0 |
| http | 1.4.0 | MIT OR Apache-2.0 |
| http-body | 1.0.1 | MIT |
| http-body-util | 0.1.3 | MIT |
| httparse | 1.10.1 | MIT OR Apache-2.0 |
| hyper | 1.9.0 | MIT |
| hyper-rustls | 0.27.9 | Apache-2.0 OR ISC OR MIT |
| hyper-util | 0.1.20 | MIT |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 |
| iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 |
| ico | 0.5.0 | MIT |
| icu_collections | 2.2.0 | Unicode-3.0 |
| icu_locale_core | 2.2.0 | Unicode-3.0 |
| icu_normalizer | 2.2.0 | Unicode-3.0 |
| icu_normalizer_data | 2.2.0 | Unicode-3.0 |
| icu_properties | 2.2.0 | Unicode-3.0 |
| icu_properties_data | 2.2.0 | Unicode-3.0 |
| icu_provider | 2.2.0 | Unicode-3.0 |
| id-arena | 2.3.0 | MIT OR Apache-2.0 |
| ident_case | 1.0.1 | MIT OR Apache-2.0 |
| idna | 1.1.0 | MIT OR Apache-2.0 |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT |
| indexmap | 1.9.3 | Apache-2.0 OR MIT |
| indexmap | 2.14.0 | Apache-2.0 OR MIT |
| infer | 0.19.0 | MIT |
| ipnet | 2.12.0 | MIT OR Apache-2.0 |
| iri-string | 0.7.12 | MIT OR Apache-2.0 |
| is-docker | 0.2.0 | MIT |
| is-wsl | 0.4.0 | MIT |
| itoa | 1.0.18 | MIT OR Apache-2.0 |
| javascriptcore-rs | 1.1.2 | MIT |
| javascriptcore-rs-sys | 1.1.1 | MIT |
| jni | 0.21.1 | MIT OR Apache-2.0 |
| jni-sys | 0.3.1 | MIT OR Apache-2.0 |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 |
| js-sys | 0.3.97 | MIT OR Apache-2.0 |
| json-patch | 3.0.1 | MIT OR Apache-2.0 |
| jsonptr | 0.6.3 | MIT OR Apache-2.0 |
| keyboard-types | 0.7.0 | MIT OR Apache-2.0 |
| lazy_static | 1.5.0 | MIT OR Apache-2.0 |
| leb128fmt | 0.1.0 | MIT OR Apache-2.0 |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |
| libc | 0.2.186 | MIT OR Apache-2.0 |
| libdbus-sys | 0.2.7 | Apache-2.0 OR MIT |
| libloading | 0.7.4 | ISC |
| libm | 0.2.16 | MIT |
| libredox | 0.1.16 | MIT |
| libsqlite3-sys | 0.30.1 | MIT |
| linux-raw-sys | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| litemap | 0.8.2 | Unicode-3.0 |
| lock_api | 0.4.14 | MIT OR Apache-2.0 |
| log | 0.4.29 | MIT OR Apache-2.0 |
| lru-slab | 0.1.2 | MIT OR Apache-2.0 OR Zlib |
| mac-notification-sys | 0.6.15 | MIT OR Apache-2.0 |
| markup5ever | 0.38.0 | MIT OR Apache-2.0 |
| md-5 | 0.10.6 | MIT OR Apache-2.0 |
| memchr | 2.8.0 | Unlicense OR MIT |
| memoffset | 0.9.1 | MIT |
| mime | 0.3.17 | MIT OR Apache-2.0 |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 |
| mio | 1.2.0 | MIT |
| muda | 0.19.1 | Apache-2.0 OR MIT |
| ndk | 0.9.0 | MIT OR Apache-2.0 |
| ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 |
| new_debug_unreachable | 1.0.6 | MIT |
| nix | 0.31.3 | MIT |
| notify-rust | 4.18.0 | MIT OR Apache-2.0 |
| num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |
| num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |
| num-bigint-dig | 0.8.6 | MIT OR Apache-2.0 |
| num-conv | 0.2.1 | MIT OR Apache-2.0 |
| num-integer | 0.1.46 | MIT OR Apache-2.0 |
| num-iter | 0.1.45 | MIT OR Apache-2.0 |
| num-traits | 0.2.19 | MIT OR Apache-2.0 |
| objc2 | 0.6.4 | MIT |
| objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-encode | 4.1.0 | MIT |
| objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT |
| objc2-foundation | 0.3.2 | MIT |
| objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT |
| once_cell | 1.21.4 | MIT OR Apache-2.0 |
| open | 5.3.4 | MIT |
| option-ext | 0.2.0 | MPL-2.0 |
| ordered-multimap | 0.7.3 | MIT |
| ordered-stream | 0.2.0 | MIT OR Apache-2.0 |
| os_info | 3.15.0 | MIT |
| os_pipe | 1.2.3 | MIT |
| pango | 0.18.3 | MIT |
| pango-sys | 0.18.0 | MIT |
| parking | 2.2.1 | Apache-2.0 OR MIT |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 |
| pathdiff | 0.2.3 | MIT OR Apache-2.0 |
| pem-rfc7468 | 0.7.0 | Apache-2.0 OR MIT |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 |
| phf | 0.13.1 | MIT |
| phf_codegen | 0.13.1 | MIT |
| phf_generator | 0.13.1 | MIT |
| phf_macros | 0.13.1 | MIT |
| phf_shared | 0.13.1 | MIT |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |
| piper | 0.2.5 | MIT OR Apache-2.0 |
| pkcs1 | 0.7.5 | Apache-2.0 OR MIT |
| pkcs8 | 0.10.2 | Apache-2.0 OR MIT |
| pkg-config | 0.3.33 | MIT OR Apache-2.0 |
| plain | 0.2.3 | MIT OR Apache-2.0 |
| plist | 1.9.0 | MIT |
| png | 0.17.16 | MIT OR Apache-2.0 |
| png | 0.18.1 | MIT OR Apache-2.0 |
| polling | 3.11.0 | Apache-2.0 OR MIT |
| potential_utf | 0.1.5 | Unicode-3.0 |
| powerfmt | 0.2.0 | MIT OR Apache-2.0 |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 |
| precomputed-hash | 0.1.1 | MIT |
| prettyplease | 0.2.37 | MIT OR Apache-2.0 |
| proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 |
| proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 |
| proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 |
| proc-macro-error | 1.0.4 | MIT OR Apache-2.0 |
| proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 |
| proc-macro2 | 1.0.106 | MIT OR Apache-2.0 |
| ptr_meta | 0.1.4 | MIT |
| ptr_meta_derive | 0.1.4 | MIT |
| quick-xml | 0.39.2 | MIT |
| quinn | 0.11.11 | MIT OR Apache-2.0 |
| quinn-proto | 0.11.17 | MIT OR Apache-2.0 |
| quinn-udp | 0.5.15 | MIT OR Apache-2.0 |
| quote | 1.0.45 | MIT OR Apache-2.0 |
| r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| radium | 0.7.0 | MIT |
| rand | 0.10.2 | MIT OR Apache-2.0 |
| rand | 0.8.6 | MIT OR Apache-2.0 |
| rand | 0.9.5 | MIT OR Apache-2.0 |
| rand_chacha | 0.3.1 | MIT OR Apache-2.0 |
| rand_chacha | 0.9.0 | MIT OR Apache-2.0 |
| rand_core | 0.10.1 | MIT OR Apache-2.0 |
| rand_core | 0.6.4 | MIT OR Apache-2.0 |
| rand_core | 0.9.5 | MIT OR Apache-2.0 |
| rand_pcg | 0.10.2 | MIT OR Apache-2.0 |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib |
| redox_syscall | 0.5.18 | MIT |
| redox_syscall | 0.7.5 | MIT |
| redox_users | 0.5.2 | MIT |
| ref-cast | 1.0.25 | MIT OR Apache-2.0 |
| ref-cast-impl | 1.0.25 | MIT OR Apache-2.0 |
| regex | 1.12.3 | MIT OR Apache-2.0 |
| regex-automata | 0.4.14 | MIT OR Apache-2.0 |
| regex-syntax | 0.8.10 | MIT OR Apache-2.0 |
| rend | 0.4.2 | MIT |
| reqwest | 0.12.28 | MIT OR Apache-2.0 |
| reqwest | 0.13.3 | MIT OR Apache-2.0 |
| ring | 0.17.14 | Apache-2.0 AND ISC |
| rkyv | 0.7.46 | MIT |
| rkyv_derive | 0.7.46 | MIT |
| rsa | 0.9.10 | MIT OR Apache-2.0 |
| rust_decimal | 1.42.0 | MIT |
| rust-ini | 0.21.3 | MIT |
| rustc_version | 0.4.1 | MIT OR Apache-2.0 |
| rustc-hash | 2.1.2 | Apache-2.0 OR MIT |
| rustix | 1.1.4 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| rustls | 0.23.44 | Apache-2.0 OR ISC OR MIT |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 |
| rustls-webpki | 0.103.15 | ISC |
| rustversion | 1.0.22 | MIT OR Apache-2.0 |
| ryu | 1.0.23 | Apache-2.0 OR BSL-1.0 |
| same-file | 1.0.6 | Unlicense OR MIT |
| schemars | 0.8.22 | MIT |
| schemars | 0.9.0 | MIT |
| schemars | 1.2.1 | MIT |
| schemars_derive | 0.8.22 | MIT |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 |
| seahash | 4.1.0 | MIT |
| selectors | 0.36.1 | MPL-2.0 |
| semver | 1.0.28 | MIT OR Apache-2.0 |
| serde | 1.0.228 | MIT OR Apache-2.0 |
| serde_core | 1.0.228 | MIT OR Apache-2.0 |
| serde_derive | 1.0.228 | MIT OR Apache-2.0 |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 |
| serde_json | 1.0.149 | MIT OR Apache-2.0 |
| serde_repr | 0.1.20 | MIT OR Apache-2.0 |
| serde_spanned | 0.6.9 | MIT OR Apache-2.0 |
| serde_spanned | 1.1.1 | MIT OR Apache-2.0 |
| serde_urlencoded | 0.7.1 | MIT OR Apache-2.0 |
| serde_with | 3.19.0 | MIT OR Apache-2.0 |
| serde_with_macros | 3.19.0 | MIT OR Apache-2.0 |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 |
| sha1 | 0.10.6 | MIT OR Apache-2.0 |
| sha2 | 0.10.9 | MIT OR Apache-2.0 |
| shared_child | 1.1.1 | MIT |
| shlex | 1.3.0 | MIT OR Apache-2.0 |
| sigchld | 0.2.4 | MIT |
| signal-hook | 0.3.18 | Apache-2.0 OR MIT |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 |
| signature | 2.2.0 | Apache-2.0 OR MIT |
| simd-adler32 | 0.3.9 | MIT |
| simdutf8 | 0.1.5 | MIT OR Apache-2.0 |
| siphasher | 1.0.2 | MIT OR Apache-2.0 |
| slab | 0.4.12 | MIT |
| smallvec | 1.15.1 | MIT OR Apache-2.0 |
| socket2 | 0.6.3 | MIT OR Apache-2.0 |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 |
| soup3 | 0.5.0 | MIT |
| soup3-sys | 0.5.0 | MIT |
| spin | 0.9.8 | MIT |
| spki | 0.7.3 | Apache-2.0 OR MIT |
| sqlx | 0.8.6 | MIT OR Apache-2.0 |
| sqlx-core | 0.8.6 | MIT OR Apache-2.0 |
| sqlx-macros | 0.8.6 | MIT OR Apache-2.0 |
| sqlx-macros-core | 0.8.6 | MIT OR Apache-2.0 |
| sqlx-mysql | 0.8.6 | MIT OR Apache-2.0 |
| sqlx-postgres | 0.8.6 | MIT OR Apache-2.0 |
| sqlx-sqlite | 0.8.6 | MIT OR Apache-2.0 |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 |
| string_cache | 0.9.0 | MIT OR Apache-2.0 |
| string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 |
| stringprep | 0.1.5 | MIT OR Apache-2.0 |
| strsim | 0.11.1 | MIT |
| subtle | 2.6.1 | BSD-3-Clause |
| swift-rs | 1.0.7 | MIT OR Apache-2.0 |
| syn | 1.0.109 | MIT OR Apache-2.0 |
| syn | 2.0.117 | MIT OR Apache-2.0 |
| syn | 3.0.5 | MIT OR Apache-2.0 |
| sync_wrapper | 1.0.2 | Apache-2.0 |
| synstructure | 0.13.2 | MIT |
| system-deps | 6.2.2 | MIT OR Apache-2.0 |
| tao | 0.35.0 | Apache-2.0 |
| tao-macros | 0.1.3 | MIT OR Apache-2.0 |
| tap | 1.0.1 | MIT |
| target-lexicon | 0.12.16 | Apache-2.0 WITH LLVM-exception |
| tauri | 2.11.5 | Apache-2.0 OR MIT |
| tauri-build | 2.6.3 | Apache-2.0 OR MIT |
| tauri-codegen | 2.6.3 | Apache-2.0 OR MIT |
| tauri-macros | 2.6.3 | Apache-2.0 OR MIT |
| tauri-plugin | 2.6.0 | Apache-2.0 OR MIT |
| tauri-plugin-deep-link | 2.4.10 | Apache-2.0 OR MIT |
| tauri-plugin-haptics | 2.3.3 | Apache-2.0 OR MIT |
| tauri-plugin-notification | 2.4.0 | Apache-2.0 OR MIT |
| tauri-plugin-opener | 2.5.5 | Apache-2.0 OR MIT |
| tauri-plugin-shell | 2.3.5 | Apache-2.0 OR MIT |
| tauri-plugin-sql | 2.4.0 | Apache-2.0 OR MIT |
| tauri-plugin-store | 2.4.3 | Apache-2.0 OR MIT |
| tauri-runtime | 2.11.3 | Apache-2.0 OR MIT |
| tauri-runtime-wry | 2.11.4 | Apache-2.0 OR MIT |
| tauri-utils | 2.9.3 | Apache-2.0 OR MIT |
| tauri-winres | 0.3.6 | MIT |
| tauri-winrt-notification | 0.7.3 | MIT OR Apache-2.0 |
| tempfile | 3.27.0 | MIT OR Apache-2.0 |
| tendril | 0.5.0 | MIT OR Apache-2.0 |
| thiserror | 1.0.69 | MIT OR Apache-2.0 |
| thiserror | 2.0.18 | MIT OR Apache-2.0 |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 |
| thiserror-impl | 2.0.18 | MIT OR Apache-2.0 |
| time | 0.3.47 | MIT OR Apache-2.0 |
| time-core | 0.1.8 | MIT OR Apache-2.0 |
| time-macros | 0.2.27 | MIT OR Apache-2.0 |
| tiny-keccak | 2.0.2 | CC0-1.0 |
| tinystr | 0.8.3 | Unicode-3.0 |
| tinyvec | 1.11.0 | Zlib OR Apache-2.0 OR MIT |
| tinyvec_macros | 0.1.1 | MIT OR Apache-2.0 OR Zlib |
| tokio | 1.52.1 | MIT |
| tokio-macros | 2.7.0 | MIT |
| tokio-rustls | 0.26.5 | MIT OR Apache-2.0 |
| tokio-stream | 0.1.18 | MIT |
| tokio-util | 0.7.18 | MIT |
| toml | 0.8.2 | MIT OR Apache-2.0 |
| toml | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 |
| toml | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_datetime | 0.6.3 | MIT OR Apache-2.0 |
| toml_datetime | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_datetime | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_edit | 0.19.15 | MIT OR Apache-2.0 |
| toml_edit | 0.20.2 | MIT OR Apache-2.0 |
| toml_edit | 0.25.11+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_parser | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_writer | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 |
| tower | 0.5.3 | MIT |
| tower-http | 0.6.8 | MIT |
| tower-layer | 0.3.3 | MIT |
| tower-service | 0.3.3 | MIT |
| tracing | 0.1.44 | MIT |
| tracing-attributes | 0.1.31 | MIT |
| tracing-core | 0.1.36 | MIT |
| tray-icon | 0.24.2 | MIT OR Apache-2.0 |
| try-lock | 0.2.5 | MIT |
| typeid | 1.0.3 | MIT OR Apache-2.0 |
| typenum | 1.20.0 | MIT OR Apache-2.0 |
| uds_windows | 1.2.1 | MIT |
| unic-char-property | 0.9.0 | MIT OR Apache-2.0 |
| unic-char-range | 0.9.0 | MIT OR Apache-2.0 |
| unic-common | 0.9.0 | MIT OR Apache-2.0 |
| unic-ucd-ident | 0.9.0 | MIT OR Apache-2.0 |
| unic-ucd-version | 0.9.0 | MIT OR Apache-2.0 |
| unicode-bidi | 0.3.18 | MIT OR Apache-2.0 |
| unicode-ident | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| unicode-normalization | 0.1.25 | MIT OR Apache-2.0 |
| unicode-properties | 0.1.4 | MIT OR Apache-2.0 |
| unicode-segmentation | 1.13.2 | MIT OR Apache-2.0 |
| unicode-xid | 0.2.6 | MIT OR Apache-2.0 |
| untrusted | 0.9.0 | ISC |
| url | 2.5.8 | MIT OR Apache-2.0 |
| urlpattern | 0.3.0 | MIT |
| utf-8 | 0.7.6 | MIT OR Apache-2.0 |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT |
| uuid | 1.23.1 | Apache-2.0 OR MIT |
| vcpkg | 0.2.15 | MIT OR Apache-2.0 |
| version_check | 0.9.5 | MIT OR Apache-2.0 |
| version-compare | 0.2.1 | MIT |
| vswhom | 0.1.0 | MIT |
| vswhom-sys | 0.1.3 | MIT |
| walkdir | 2.5.0 | Unlicense OR MIT |
| want | 0.3.1 | MIT |
| wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasip2 | 1.0.3+wasi-0.2.9 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasip3 | 0.4.0+wasi-0.3.0-rc-2026-01-06 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasite | 0.1.0 | Apache-2.0 OR BSL-1.0 OR MIT |
| wasm-bindgen | 0.2.120 | MIT OR Apache-2.0 |
| wasm-bindgen-futures | 0.4.70 | MIT OR Apache-2.0 |
| wasm-bindgen-macro | 0.2.120 | MIT OR Apache-2.0 |
| wasm-bindgen-macro-support | 0.2.120 | MIT OR Apache-2.0 |
| wasm-bindgen-shared | 0.2.120 | MIT OR Apache-2.0 |
| wasm-encoder | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasm-metadata | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wasm-streams | 0.5.0 | MIT OR Apache-2.0 |
| wasmparser | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| web_atoms | 0.2.4 | MIT OR Apache-2.0 |
| web-sys | 0.3.97 | MIT OR Apache-2.0 |
| web-time | 1.1.0 | MIT OR Apache-2.0 |
| webkit2gtk | 2.0.2 | MIT |
| webkit2gtk-sys | 2.0.2 | MIT |
| webpki-roots | 1.0.9 | CDLA-Permissive-2.0 |
| webview2-com | 0.38.2 | MIT |
| webview2-com-macros | 0.8.1 | MIT |
| webview2-com-sys | 0.38.2 | MIT |
| whoami | 1.6.1 | Apache-2.0 OR BSL-1.0 OR MIT |
| winapi | 0.3.9 | MIT OR Apache-2.0 |
| winapi-i686-pc-windows-gnu | 0.4.0 | MIT OR Apache-2.0 |
| winapi-util | 0.1.11 | Unlicense OR MIT |
| winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT OR Apache-2.0 |
| window-vibrancy | 0.6.0 | Apache-2.0 OR MIT |
| windows | 0.61.3 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.48.5 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| windows_aarch64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.48.5 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| windows_aarch64_msvc | 0.53.1 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.48.5 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 |
| windows_i686_gnu | 0.53.1 | MIT OR Apache-2.0 |
| windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| windows_i686_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.48.5 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 |
| windows_i686_msvc | 0.53.1 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.48.5 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 |
| windows_x86_64_gnu | 0.53.1 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.48.5 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 |
| windows_x86_64_gnullvm | 0.53.1 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.48.5 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.53.1 | MIT OR Apache-2.0 |
| windows-collections | 0.2.0 | MIT OR Apache-2.0 |
| windows-core | 0.61.2 | MIT OR Apache-2.0 |
| windows-core | 0.62.2 | MIT OR Apache-2.0 |
| windows-future | 0.2.1 | MIT OR Apache-2.0 |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 |
| windows-link | 0.1.3 | MIT OR Apache-2.0 |
| windows-link | 0.2.1 | MIT OR Apache-2.0 |
| windows-numerics | 0.2.0 | MIT OR Apache-2.0 |
| windows-registry | 0.5.3 | MIT OR Apache-2.0 |
| windows-result | 0.3.4 | MIT OR Apache-2.0 |
| windows-result | 0.4.1 | MIT OR Apache-2.0 |
| windows-strings | 0.4.2 | MIT OR Apache-2.0 |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 |
| windows-sys | 0.45.0 | MIT OR Apache-2.0 |
| windows-sys | 0.48.0 | MIT OR Apache-2.0 |
| windows-sys | 0.52.0 | MIT OR Apache-2.0 |
| windows-sys | 0.59.0 | MIT OR Apache-2.0 |
| windows-sys | 0.60.2 | MIT OR Apache-2.0 |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 |
| windows-targets | 0.42.2 | MIT OR Apache-2.0 |
| windows-targets | 0.48.5 | MIT OR Apache-2.0 |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 |
| windows-targets | 0.53.5 | MIT OR Apache-2.0 |
| windows-threading | 0.1.0 | MIT OR Apache-2.0 |
| windows-version | 0.1.7 | MIT OR Apache-2.0 |
| winnow | 0.5.40 | MIT |
| winnow | 0.7.15 | MIT |
| winnow | 1.0.2 | MIT |
| winreg | 0.55.0 | MIT |
| wit-bindgen | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wit-bindgen-core | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wit-bindgen-rust | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wit-bindgen-rust-macro | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wit-component | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| wit-parser | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| writeable | 0.6.3 | Unicode-3.0 |
| wry | 0.55.0 | Apache-2.0 OR MIT |
| wyz | 0.5.1 | MIT |
| x11 | 2.21.0 | MIT |
| x11-dl | 2.21.0 | MIT |
| yoke | 0.8.2 | Unicode-3.0 |
| yoke-derive | 0.8.2 | Unicode-3.0 |
| zbus | 5.19.0 | MIT |
| zbus_macros | 5.19.0 | MIT |
| zbus_names | 4.3.4 | MIT |
| zcheapstr | 1.1.0 | MIT |
| zerocopy | 0.8.50 | BSD-2-Clause OR Apache-2.0 OR MIT |
| zerocopy-derive | 0.8.50 | BSD-2-Clause OR Apache-2.0 OR MIT |
| zerofrom | 0.1.7 | Unicode-3.0 |
| zerofrom-derive | 0.1.7 | Unicode-3.0 |
| zeroize | 1.8.2 | Apache-2.0 OR MIT |
| zerotrie | 0.2.4 | Unicode-3.0 |
| zerovec | 0.11.6 | Unicode-3.0 |
| zerovec-derive | 0.11.3 | Unicode-3.0 |
| zmij | 1.0.21 | MIT |
| zvariant | 5.15.0 | MIT |
| zvariant_derive | 5.15.0 | MIT |
| zvariant_utils | 4.2.0 | MIT |
