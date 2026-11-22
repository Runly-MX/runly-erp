# Website Responsive Foundation — fase 3C

La publicación y adopción ejecutadas posteriormente se documentan en el
[cierre de publicación](website-responsive-foundation-publication-close.md).
Este informe conserva el estado histórico de 3C.

Continuación de la [fase 3B](website-responsive-foundation-phase-3b.md).
Estado: **PARCIAL**. Se ejecutaron verificaciones y se corrigieron tres pendientes
de integración; la publicación nueva, adopción Hub y aceptación remota siguen
pendientes. Atlas 0.9.0 no se modificó ni se volvió a publicar.

## Implementación y revisión integrada

| Repositorio | Commit | Resultado |
| --- | --- | --- |
| ERP | `3a429da76` | Identidad adicional del catálogo Ticketing; matriz pública con Atlas instalado |
| ERP | `c23bccc35` | Pin API 0.9.0 y comprobación de las versiones realmente resueltas |
| ERP | `680be0fa0` | Contratos SDK Growth/Website actualizados y regresiones de transporte |
| Hub | `b1e6510` | Snapshot adicional preparado y comprobación de ambos catálogos 0.9.0 |

La fase 3B había actualizado desktop y Website Blocks, pero **la API ERP todavía
declaraba y resolvía Atlas 0.8.2**. Se corrigió su dependencia directa y el importer
del lockfile. La instalación frozen conserva las resoluciones de peers ajenas.
La regresión verifica declaración y resolución real de API, desktop y Website
Blocks: los tres usan 0.9.0. No se eliminan catálogos para retirar esa dependencia.

La prueba pública anterior sólo ejercitaba los nueve anchos responsive cuando
recibía un alias candidato. Ahora lo decide por la versión del renderer construido:
Atlas 0.9.0 instalado desde npm ejecuta la misma matriz sin alias al repositorio
hermano. Los resultados registran versión y anchos comprobados.

Se reprodujeron también los dos fallos SDK señalados en la entrega Ticketing.
Growth esperaba 31 métodos y ofrece 45; Website esperaba 37 y ofrece 52. Las
ampliaciones ya estaban implementadas antes de esta fase, con sus endpoints y
permisos correspondientes. Se actualizaron las listas explícitas, conservando
la comparación exacta, y se añadieron comprobaciones de autenticación, encoding,
idempotencia y separación del status público. No se modificaron servicios ni
autorizaciones para hacer pasar las pruebas.

Mientras se trabajaba, sus propietarios cerraron los commits LMS/UI `4452f30e8`
y Ticketing `6ef68a822`, `7fca8e267`, `27b691b93`. El cierre Ticketing documenta
40/40 verificaciones locales; esa cifra es evidencia de su entrega, no una nueva
ejecución nuestra. Se conservó la historia normal de main.

## Catálogos compatibles

| Versión / identidad | Bloques | Digest |
| --- | ---: | --- |
| 0.8.2 Hub, intacto | 156 | `2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318` |
| 0.8.2 ERP, intacto | 157 | `cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1` |
| 0.9.0 canónico, intacto | 157 | `f5b5d67e4ddbffeedbc8e33e934a19b2973cae42ea7892192ca7849984d5a5b2` |
| 0.9.0 ERP con Ticketing | 158 | `bf50cd9eb4aeb731c2f35e21af7603f303f9c5c8626b4542b9594ea5f9bb8da1` |

Ticketing añadió un tipo al catálogo actual del ERP. Se verificó que los otros
157 bloques coinciden exactamente con el snapshot 0.9.0 preparado en 3B.
Se congeló el catálogo ampliado desde el commit `7fca8e267`, en un archivo nuevo
`builder-catalogs/0.9.0-erp.json`; no se retiró `TicketingEventBlock`, se reemplazó
el catálogo canónico ni se retocaron digests.

ERP admite ambas identidades 0.9.0 con el selector versión/digest ya existente;
el default canónico sigue teniendo 157 bloques e incluye `BookingPortalBlock`.
Las pruebas cubren apertura, edición, validación y reapertura de las cuatro
identidades, incluido Ticketing y los valores responsive cero explícitos.

Hub conserva **activo 0.8.2**, incluido el soporte de ambas identidades históricas
implementado en 3B. Tiene preparados ambos snapshots 0.9.0, sin registrarlos ni
actualizar dependencias antes de una publicación compartida verificable. El
servicio remoto consultado sigue anunciando 0.8.2/156 y su digest histórico;
su inventario todavía no ofrece el parámetro nuevo `catalogDigest`.

## Operaciones y pruebas ejecutadas

| Comprobación | Resultado de esta fase |
| --- | --- |
| Catálogos y preparación, efectos, SEO, branding, formularios | 26/26 |
| Interchange completo | 25/25 |
| Core | 19/19 |
| Module Engine | 155 aprobadas, cero fallidas, una omitida |
| Compilador: archive/contracts/static inspection/entity list | 45/45 |
| SDK completo después de corregir las expectativas | 89/89 |
| Mecanismo de publicación compartida | 5/5 |
| Matriz de bloques actual | 130 especializados × nueve anchos × dos motores: 2340, cero incidencias |
| Renderer público real, SSR/hidratación | 2/2; Chromium/WebKit, navegación touch y teclado, nueve anchos responsive |
| Hub: identidades, Studio output y fallos del validador | 7/7 |
| Hub: codificación | 3/3 |
| Lint dirigido y whitespace | Aprobados |
| Privacidad global | Cero hallazgos |

La matriz de bloques usa el laboratorio de defaults y el build Atlas hermano
0.9.0; la prueba pública separada usa el paquete npm instalado. Ninguna sustituye
SENDA ni acredita un despliegue. Los nueve anchos son 320, 360, 390, 768, 820,
1024, 1280, 1440 y 1920; el laboratorio de bloques usa viewport 1920 con canvas
del ancho correspondiente.

Las suites completas Hub aprobadas en 3B siguen siendo la última certificación:
789 unitarias aprobadas/dos omitidas y 262 de integración aprobadas/cinco omitidas,
sin fallos. **No se presentan como ejecutadas otra vez en 3C**. No cambió el
runtime Hub ni se adoptaron dependencias; se verificaron sus snapshots y pruebas
afectadas. La suite completa, lint/build y los flujos autenticados deben repetirse
después de la adopción real. No se ejecutó la suite E2E global, ni se certificaron
dispositivos físicos o SMTP remoto.

## Registry: publicación anterior comprobada, publicación nueva bloqueada

Se descargaron el manifiesto publicado y los ocho tarballs del
[workflow 44461972877](https://github.com/Runly-MX/runly-erp/actions/runs/44461972877).
La distribución sigue siendo
`0.1.0-source.aad51d79693d4f88376579c3aab8f36a84527b8c` para los ocho paquetes:
core, module-engine, module-compiler, ui, sdk, preview-runtime, studio-interchange
y website-blocks, bajo `@runly-mx`.

SHA-256 del manifiesto descargado:
`507caed9b6e11c43e65a69307dab9705ebb5e49fcb7500d30d4a8af30c8b75b4`.
Coincide íntegramente con el
[manifiesto adoptado por Hub](https://github.com/Runly-MX/runly-developer-hub/blob/b1e6510/shared-packages.lock.json),
que contiene SHA-256 e integridades SHA-512 de los ocho paquetes. Se recalcularon
ambos hashes de cada tarball y se contrastó cada integridad con GitHub Packages.
Se comprobaron las ocho versiones instaladas y el verificador de toolchain.
El primer intento de probe falló porque `pnpm exec` no proporcionaba
`npm_execpath`; la invocación corregida pasó sin cambiar credenciales.

Atlas npm 0.9.0 se descargó nuevamente; su SHA-256 sigue siendo
`37be733063a502497d020b2c13a5dd8532d9db322e42101ff6022f8e97a8de69`,
con integridad
`sha512-qqN0xoSaS+8m2O4i3LC2otA1lI+hgx0kY8IniLzx753p/WZy1eFiQj0bc1YtelGls9cmhvSW4VpDKtmnSN2x7Q==`.

El entorno protegido `shared-packages` existe, permite main y tiene habilitada
la publicación. No se cambió ninguna protección. El preflight oficial volvió
a rechazar el árbol con `SHARED_RELEASE_REQUIRES_CLEAN_TREE`, antes de empaquetar.
El nuevo trabajo LMS pendiente incluye exactamente estos archivos al cierre:

- `apps/api/src/routes/lms/lms-assessment-results-service.js`
- `apps/desktop/src/modules/runly.lms/components/results/ResultsPanel.jsx`
- `apps/api/src/routes/lms/__tests__/lms-clone-core.test.js`
- `apps/api/src/routes/lms/lms-clone-core.js`
- `scripts/lms-clone-course-to-assessment.mjs`

Deben ser cerrados y verificados por su propietario mediante commits normales;
no se integraron como completos ni se descartaron. El inventario puede cambiar
mientras trabaja esa sesión. No se usó una revisión anterior, stash, checkout
alternativo ni cherry-pick para sortear el gate.

**No existe manifiesto nuevo ni integridades nuevas publicadas para responsive.**
No se disparó `publish: true` ni se ejecutó `shared:adopt`. Hub continúa con Atlas
0.8.2 y los ocho paquetes anteriores: no hay adopción parcial presentada como
terminada. Cuando main esté limpio, revisar la revisión integrada, preparar
`pnpm release:shared --revision <full-sha>`, revisar los ocho paquetes, publicar
esa revisión por el workflow protegido y contrastar el manifiesto publicado.
Después adoptar conjuntamente los pins/overrides/locks de Hub, registrar el
catálogo canónico 157 y su variante 158, y ejecutar la certificación completa.

## Operación remota, SENDA y rollback

El usuario confirmó que **no existe esa configuración automatizada de staging**
y que realizará personalmente la subida y bajada de cambios en el entorno remoto.
No se inventó un destino ni se intentó desplegar a producción como sustituto.

`prod:status` confirmó que este host no tiene una instalación Hub seleccionada.
No hay `HUB_ENV_FILE` configurado ni environments de despliegue del Hub en GitHub.
El error `STAGING_PRODUCTION_CONFIG_REQUIRED` se reprodujo, pero corresponde al
coordinador de módulos S7B, cuyo host dedicado está diferido; **no constituye un
preflight del staging de la aplicación Website**. No se reactivó S7B.

La entrega operativa queda a cargo del usuario después de publicar/adoptar:
capturar revisión anterior y configuración, actualizar los componentes de la
revisión aprobada, reconstruir API/worker/editor/renderer y comprobar las
versiones efectivamente instaladas, el contrato MCP y los catálogos. No hay aún
una revisión certificada lista para aprobación de producción.

En el entorno remoto se deben verificar los nueve anchos en ambos motores,
iframe/Inspector/overflow, persistencia de overrides, preview y renderer público,
PNG/WebP y newsletter sobre recursos de prueba. SENDA debe usarse sólo para
lectura y capturas de navbar, hero, categorías, producto, historias, beneficios,
footer e imágenes. La consulta remota de esta fase confirmó revisión **21**, una
página con 116 bloques; no hubo escrituras ni aceptación visual.

El rollback documentado del Hub es `pnpm prod:rollback --to <previous-full-sha>`,
bajo confirmación/lock y rechazo de migraciones desconocidas. Su uso exige que
el operador compruebe primero el destino y la revisión anterior; no se ejecutó
desde este host. El ensayo debe comprobar conservación de documentos, props,
catálogos y assets sin restaurar bases ni borrar datos. Producción sigue detenida
para esta fase hasta completar publicación, adopción y aceptación operativa.

Evidencia local ignorada: `.artifacts/website-responsive-foundation/phase-3c/`
en ERP y Hub. Incluye TAP, matriz responsive, descarga/verificación de paquetes,
versiones instaladas, privacidad y rechazos del preflight.
