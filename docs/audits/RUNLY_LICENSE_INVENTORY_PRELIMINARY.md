# Inventario preliminar de licencias (insumo técnico para F4)

Estado: **preliminar. No es una revisión jurídica ni una declaración de compatibilidad.** Genera evidencia para el frente legal; la licencia de Runly no se cambia ni se publican avisos.

SHA: `d6ff0fca5` (worktree limpio con `pnpm install --frozen-lockfile`, como hace la imagen). Fecha: 2026-11-24.

## 1. Qué se midió

`pnpm licenses list --prod --json` sobre el lockfile: **1153 paquetes npm de producción (1330 versiones)** con la licencia **declarada en su metadatos**. Lista completa: `docs/audits/evidence/licenses-npm-prod.csv`.

| Licencia declarada | Versiones |
|---|---|
| MIT | 1066 |
| ISC | 103 |
| Apache-2.0 | 83 |
| BSD-3-Clause / BSD-2-Clause | 33 / 11 |
| Dobles y variantes (MIT OR Apache-2.0, 0BSD, MIT-0, MIT AND ISC, ...) | 23 |
| Unlicense / CC0 / Python-2.0 / Zlib | 3 / 1 / 1 / 3 |
| MPL-2.0 (sola o doble) | 4 |
| GPL / LGPL (sola, o con alternativa permisiva) | 5 |
| Sin licencia declarada | 2 |

## 2. Paquetes que requieren decisión o verificación

La columna «Dónde llega» es lo que se verificó en el código; no sustituye la lectura de los textos de licencia.

| Paquete | Licencia declarada | Dónde llega | Nota para el frente legal |
|---|---|---|---|
| `country-state-city` 3.2.1 | **GPL-3.0** | Dependencia de `apps/desktop` y `packages/ui`; se carga en el navegador (formularios de dirección, ~2.1 MB) | **Candidato a sustitución.** Es código GPL-3.0 entregado al cliente en un producto propietario; además pesa 2.1 MB. No invertir en optimizarlo antes de decidir |
| `@ffmpeg/core` 0.12.10 | **GPL-2.0-or-later** (según el paquete) | Se copia a `public/ffmpeg/` en `postinstall` y se carga bajo demanda (WebAssembly) | Distribuido como archivo aparte. Verificar la configuración con la que se compiló el WASM y las obligaciones de entrega de fuente |
| `jszip` 3.10.1, `pizzip` 3.3.0 | MIT **OR** GPL-3.0 | Sitios/ofimática | Doble licencia; se usa bajo MIT. Anotar la elección |
| `@img/sharp-win32-x64` | Apache-2.0 AND **LGPL-3.0-or-later** (libvips) | Solo herramienta/API en Windows | Binario nativo; comprobar si llega a una imagen distribuida |
| `dompurify` 3.4.16 | MPL-2.0 OR Apache-2.0 | Sanitización en el navegador | Doble licencia; sin acción probable |
| `web-push` 3.6.7 | MPL-2.0 | API (servidor) | Copyleft de archivo; sin modificaciones locales conocidas |
| `lightningcss` 1.32.0 | MPL-2.0 | Herramienta de build | No se distribuye |
| `buffers` 0.1.1, `khroma` 2.1.0 | Sin licencia declarada | Transitivas (Mermaid/otros) | Falta metadato; revisar el repositorio de origen |
| `argparse` 2.0.1 | Python-2.0 | Transitiva | Licencia permisiva de tipo PSF |
| `pako` (3 versiones) | MIT AND Zlib | Transitiva | Permisiva |

## 3. No cubierto todavía (pendiente)

- **SBOM Rust** (`apps/desktop/src-tauri/Cargo.lock` existe; sin analizar).
- **SBOM de contenedores** (imágenes base `node:22-alpine`, `nginx:alpine`, Postgres, LiveKit, Collabora `collabora/code:26.04.2.4.1`, Piper, LibreDWG/`runly-dwg`, transcriptor, Ollama opcional) y paquetes del sistema dentro de cada imagen.
- **Textos completos de licencia** y archivos `NOTICE` (hace falta para `THIRD_PARTY_NOTICES`, que **no** se ha generado).
- **Fuentes** (Google Fonts desde CDN en `index.html`, `studio-fonts/`, Plus Jakarta Sans, Playfair, Space Grotesk, Sora), **iconos** (Lucide, biblioteca local de Studio), **imágenes y sonidos** de `public/`, y proveedores de catálogo de Studio (Pixabay, Wikimedia): procedencia y licencia por activo.
- **Excalidraw** 0.18.1 (MIT declarado) y su distribución de producción; **Atlas Web Builder** (paquete privado).
- **Dependencias de las aplicaciones nativas** (Tauri, Android, iOS) y plugins nativos.
- Solo `--prod`: las dependencias de desarrollo que acaban en artefactos publicados no se evaluaron.

## 4. Riesgos de interpretación

La licencia declarada en `package.json` puede no coincidir con el texto real ni con el binario que se distribuye; varios paquetes combinan código con licencias distintas. Este inventario sirve para ordenar la revisión, no para decidir compatibilidad.
