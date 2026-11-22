# Website Responsive Foundation — fase 3

Fecha de verificación: 22 de noviembre de 2026. **Cierre parcial verificable**:
Atlas 0.9.0 se publicó y verificó. No se adoptó en ERP/Hub ni se desplegó a staging
o producción. Las cadenas dependientes se detuvieron al fallar sus requisitos.
Continúa la [segunda entrega](website-responsive-foundation-delivery-2.md).

## Commits y sincronización

| Repositorio | Revisión de código / evidencia | Estado remoto |
| --- | --- | --- |
| Atlas | Publicación `c65d7192576886e64351be8a181327b110b75e99`; evidencia `fa834daf3c2e7a0295b70f653f26e52bce9de516` | main remoto en `fa834da`; tag v0.9.0 apunta a `c65d719` |
| ERP | Privacidad `0519b2269`; este informe y enlace histórico, en su commit documental | Se envió sólo `0519b2269` por SHA a main; informe local pendiente |
| Developer Hub | Integración `9efeda470a6be65f4eae17fbf358b1c7b85c4894`; cierre `6a0c32776e765128fac54bacc31b379d05a8569c` | main local/remoto en `6a0c327` |

El informe ERP se commitea sobre el main compartido, que incluye el commit ajeno
Bookings `15e140347`. No se envía ese descendiente para evitar publicar trabajo de
otra sesión. No se crean ramas, worktrees, cherry-picks ni reescrituras de historia.

## Estado por componente

| Componente | Estado | Evidencia / límite |
| --- | --- | --- |
| Atlas responsive | IMPLEMENTADO LOCALMENTE y PUBLICADO | 0.9.0, fuente/tag y bytes verificados |
| Website Blocks responsive | IMPLEMENTADO LOCALMENTE; publicación PENDIENTE | Fuente ERP `0abc9d5de`; release compartido rechazó árbol sucio |
| Dependencias ERP | Adopción PENDIENTE | Pins 0.8.2 conservados |
| Dependencias Hub | Adopción PENDIENTE | Atlas 0.8.2 y paquetes compartidos de `aad51d79` conservados |
| Catálogo candidato | IMPLEMENTADO LOCALMENTE; registro PENDIENTE | Coincide con Atlas publicado, pero no incluye el nuevo bloque nativo de Bookings |
| Integración local | Recuperada; aceptación global PENDIENTE | Auth funciona y flujo Website dirigido pasa; suite global contiene fallos |
| Staging | PENDIENTE | Configuración de operación no disponible; rollback no ensayado |
| Producción | PENDIENTE | No se ejecutó despliegue |
| SENDA | PENDIENTE de aceptación visual | Sólo lectura de metadatos; revisión 21 intacta |

## Atlas: publicación real

Fuente publicada: `c65d7192576886e64351be8a181327b110b75e99`, sobre los dos commits
responsive anteriores. Tag anotado `v0.9.0`; main y tag enviados al remoto
`raulbellosom/Atlas-Web-Builder` sin force. Los cambios posteriores de esta fase
son evidencia documental; no se volvió a publicar ni sobrescribir 0.9.0.

- Paquete: `@raulbellosom/atlas-web-builder@0.9.0`.
- Registry: `https://registry.npmjs.org`.
- [Tarball publicado](https://registry.npmjs.org/@raulbellosom/atlas-web-builder/-/atlas-web-builder-0.9.0.tgz).
- SHA-256: `37be733063a502497d020b2c13a5dd8532d9db322e42101ff6022f8e97a8de69`.
- Integridad: `sha512-qqN0xoSaS+8m2O4i3LC2otA1lI+hgx0kY8IniLzx753p/WZy1eFiQj0bc1YtelGls9cmhvSW4VpDKtmnSN2x7Q==`.

npm aceptó primero el upload mientras procesaba su disponibilidad. Se esperó la
propagación: la descarga final coincide byte por byte con el tarball probado y
una instalación por nombre/versión exactos, con caché nueva, resolvió 0.9.0 y sus
158 exports. No se sustituyó permanentemente ninguna dependencia por una carpeta
o un tarball local.

La metadata npm no incluye `gitHead`. No se afirma una atestación npm: la
procedencia se verificó comparando las 144 fuentes del sourcemap con Git,
guardando el SHA/integridad y fijando el tag al commit. La evidencia pública
está en `docs/releases/0.9.0-publication.json` de Atlas.

Atlas pasó 250/250 pruebas, lint y build. Se añadió una comprobación reproducible:
`node scripts/verify-responsive-release.mjs <tarball>`. Instala consumidores npm
independientes React 18.3.1 y 19.3.0, sin aliases a Atlas hermano, comprueba
ESM/CJS, exports anteriores, campos históricos y roundtrip. Ejecuta 12 casos
SSR/hidratación en Chromium/WebKit a 390/820/1440 con viewport 1920. Comprueba
tipografía, herencia, cero explícito, hidden/collapsed y errores de hidratación.
Los 16 archivos empaquetados pasaron el escáner de privacidad.

## Privacidad: cierre de los 23 hallazgos

Baseline ERP: `6731c171bd876ba3cf446ac4343be9ad60e23840`. Las líneas de esta tabla
se refieren a ese commit; cada repetición indicada cuenta un resultado separado.
Responsable designa el componente mantenedor, no una persona cuya asignación no
está documentada por CODEOWNERS.

| Archivo | Líneas / resultados | Responsable técnico | Tratamiento |
| --- | --- | --- | --- |
| `apps/api/src/routes/growth/__tests__/growth-property-service.test.js` | 119, 121, 126 (3) | Growth / propiedades | Dominio reservado, conserva la prueba de cambio de origen |
| `apps/api/src/services/__tests__/email-templates.test.js` | 93 (1) | Growth / correo | URL de ejemplo y aserción coherente |
| `apps/api/src/services/__tests__/growth-monitor.test.js` | 11, 15, 23, 135 (dos), 197 (dos), 198 (dos), 201, 279, 291 (dos), 292 (14) | Growth / monitores y seguridad de red | Ejemplos reservados/loopback; excepciones exactas para centinelas públicos de stubs |
| `apps/api/src/services/__tests__/website-custom-domain.test.js` | 54 (1) | Website / dominios | IP reservada; mantiene rechazo de hostname-IP |
| `apps/desktop/src/modules/runly.growth/components/MonitorDialog.jsx` | 163 (1) | Growth / interfaz | Placeholder DNS reservado |
| `infra/installer/__tests__/website-domains-nginx.test.js` | 6, 7, 14 (3) | Instalador / dominios Website | Dominio e IP reservados; mantiene aserciones nginx/certificado |

Se sustituyeron 16 resultados. Los otros siete corresponden a tres direcciones
públicas ya utilizadas en stubs sin conexiones reales: se conservaron mediante
excepciones exactas de archivo y dirección, como las fixtures SSRF existentes.
La primera sustitución por RFC 5737 hizo fallar las comprobaciones porque
`isPublicAddress` rechaza correctamente esos rangos; no se cambió ese filtro ni
se activó allowPrivate para hacer pasar las pruebas. Las regresiones comprueban
que destinos distintos y credenciales siguen siendo hallazgos en ese archivo.

Commit: `0519b2269`. Resultado: 60/60 pruebas de los componentes afectados y del
escáner, lint dirigido aprobado y `pnpm check:privacy` global con cero hallazgos.
React Doctor se ejecutó sobre el workspace y terminó con 86/100 sin errores
reportados; el workspace también contiene cambios ajenos activos. No se ejecutó
Gitleaks ni se presenta el escáner de patrones como un análisis de secretos completo.

## Auth e integración local

Se reutilizó el npmrc existente del operador como ruta de secreto BuildKit,
mediante variable de entorno del proceso; no se creó, imprimió ni incorporó un
token. Se comprobó que el destino de migración era loopback y el puerto local
documentado antes de arrancar el stack del Hub. No se utilizó el ERP ni un
destino de producción como base de pruebas.

Los seis servicios locales quedaron healthy. Se ejecutó `pnpm migrate` y se
compiló la imagen local de worker con paquetes registry existentes. La imagen
de prueba dirty no es un artefacto publicable ni evidencia de procedencia de
producción. No se eliminaron volúmenes, restauraron bases ni reinicializaron claves.

La prueba dirigida autenticada Website pasó. Antes de ello se corrigieron
peticiones obsoletas del test: el contrato ahora requiere versión/detail explícitos
para obtener un catálogo completo; get requiere `view=document` para obtener bytes
estructurados, y save devuelve resumen por defecto. Se conserva el documento de
entrada para la siguiente edición. No se debilitó el API para acomodar el test.
Commit Hub: `9efeda470a6be65f4eae17fbf358b1c7b85c4894`, enviado a main remoto.

El caso crea recursos sintéticos, guarda revisiones, reabre una revisión anterior,
conserva campos/PNG, verifica conflictos y enlaces inseguros y comprueba aislamiento
de permisos. No guarda en SENDA. Hub también pasó lint, build y 787 pruebas
unitarias: 785 aprobadas, cero fallidas y dos omitidas.

La suite global de integración terminó en 506 segundos: **266 casos, 241
aprobados, 20 fallidos, cinco omitidos**. No es una certificación aprobada.
Los fallos incluyen casos padres e hijos; se agrupan por flujo:

| Flujo | Fallo observado | Responsable técnico |
| --- | --- | --- |
| Procedencia API/worker/artifact | Contrato generado difiere de la expectativa | Toolchain / procedencia |
| Marketplace MCP H3 | Inventario de tools y guardado Studio con INTERNAL_ERROR | MCP / Studio |
| Marketplace validation H3 | Estado de decisión de revisión no coincide | Marketplace / moderación |
| Consentimiento MCP | Allowlist SQL devuelve 20 scopes frente a 16 esperados | Auth / scopes |
| Media activation | Guardado Studio devuelve INTERNAL_ERROR | Medios / Studio |
| Platform control plane | Grants de bootstrap/reviewer difieren de expectativas | Autoridad de plataforma |
| S7A SQL | Falta el rechazo esperado en aislamiento | Staging / seguridad SQL |
| Studio package v2 | Guardado falla; posteriores file/id/recurso no existen | Studio / publicación |
| Preparación Studio | Comprobación de scopes false frente a true | Studio / migraciones de scopes |
| Website RC | Inventario MCP espera cuatro tools y recibe cero en listTools | Website / contrato MCP |

Website RC conserva expectativas del inventario anterior y no alcanza sus
comprobaciones de contenido. El flujo Website dirigido sí pasó; **no sustituye
Website RC ni los controles de seguridad globales**. No se atribuye cada fallo
al entorno o a una fixture antigua sin investigarlo. Sus causas requieren cierre
y regresiones antes de adoptar/desplegar. No se usaron retries para declarar la
suite verde. Sus fallos bloquean la aceptación global.
No se amplió una matriz para compensarlos ni se cambió lógica de procedencia,
moderación, scopes o medios ajena al alcance para conseguir un resultado verde.

## Validador fotográfico

Se volvió a ejecutar `node scripts/measure-website-validator.mjs` con dos PNG y un
WebP derivados de la fotografía real local. ZIP idéntico antes/después de compactar
salida y reapertura exacta aprobados. No hay redistribución de la fotografía.

| Operación | Entrada B | Salida B | ms | Pico RSS B | Código/señal |
| --- | ---: | ---: | ---: | ---: | --- |
| Escritura con duplicación | 10,547,532 | 21,102,479 | 1230 | 225,828,864 | 0 / ninguna |
| Escritura compacta | 10,547,532 | 10,555,727 | 1184 | 217,473,024 | 0 / ninguna |
| Reapertura | 7,913,853 | 10,550,558 | 1193 | 151,629,824 | 0 / ninguna |
| Límite de salida de prueba 1024 B | 10,547,532 | 65,536 observados | 1259 | no disponible | SIGKILL |

El último caso devolvió `VALIDATOR_OUTPUT_TOO_LARGE`. La salida está acotada por
chunks, no por un corte exacto en 1024 B. Una muestra de RSS algo menor no demuestra
que los OOM estén resueltos. No se publicaron stacks, stderr ni datos fotográficos.

## Catálogos: incompatibilidad detectada antes de adoptar

El candidato del Hub, contrastado con una instalación del paquete final desde npm,
conserva 156 tipos y digest
`f76c43490dec511a23fa1a27b9f0dce1b477457e27397d95d19a1507c85d5e67`.
Su snapshot histórico 0.8.2 conserva
`2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318`.

El catálogo actual del ERP tiene **157 tipos** y digest
`cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1`.
El commit previo `381cd859f` añadió `BookingPortalBlock`; los otros 156 tipos
coinciden con el histórico. El mapeo ERP 0.8.2 continúa apuntando a ese catálogo
actual. Copiarlo como histórico con la identidad del Hub habría sido incorrecto:
la comprobación de digest lo rechazó antes de escribir el snapshot.

No se sustituyó el mapeo, borró el bloque de Bookings ni registró un catálogo nuevo.
Antes de adoptar hay que conservar ambas evidencias históricas y determinar qué
documentos ERP identifican 0.8.2 con el digest ampliado. La resolución por versión
y digest debe mantener esos documentos y los del Hub, con pruebas explícitas;
el catálogo final nuevo también debe incluir/soportar el bloque nativo cuando
corresponda. No etiquetar el catálogo ampliado con el digest anterior ni descartar
campos para forzar coincidencia. El candidato por sí solo no resuelve esa transición.

## Publicación compartida y dependencias

ERP recibió después de la segunda entrega el commit LMS `6731c171b`, ya presente
en remoto, y durante esta sesión otro propietario creó `15e140347` de Bookings.
Además hay trabajo activo no commiteado de LMS/Bookings/Prisma de otras
sesiones; no se añadió a nuestros commits ni se alteró para limpiar el árbol.

Se ejecutó el preflight `pnpm release:shared --revision <HEAD>` y falló con
`SHARED_RELEASE_REQUIRES_CLEAN_TREE` antes de preparar un manifest. No se disparó
`publish: true` ni se intentó sortear el guard usando otro checkout o stash.
La aprobación del entorno protegido `shared-packages` no se solicitó ni consumió.

El Hub sigue usando el manifest registry de
`aad51d79693d4f88376579c3aab8f36a84527b8c` y alias exactos
`0.1.0-source.aad51d79693d4f88376579c3aab8f36a84527b8c`.
Se consultó la versión real de `@runly-mx/website-blocks` en GitHub Packages:
integridad `sha512-PhR4lIsdJ49DqJeH+NtzrOJd7QkqH8HTi8X6HVHnrRm0no+M5hhwEdYPrrV2GFe3pq6OZc/gyzmZJUyTEntc7A==`.
Build de Hub verificó los bytes instalados mediante su verificador compartido.
No existe un manifest nuevo publicado para esta entrega, por lo que no se ejecutó
`shared:adopt`. Manifests, overrides y lockfiles de consumidores permanecen iguales.

## Staging, producción, SENDA y plugin

El preflight staging devolvió `STAGING_PRODUCTION_CONFIG_REQUIRED`. El status de
producción informó que este host no tiene una instalación Hub ni un env operativo
seleccionado. No hay destino SSH ni archivos staging/producción configurados en
los entornos locales consultados. Se pidió la ubicación del acceso autorizado,
sin solicitar tokens o contraseñas. No se inventó un destino a partir de ejemplos.
Las revisiones e imágenes realmente activas de ERP/Hub y sus configuraciones de
rollback de servidor no están verificadas.

El conector remoto anunció Atlas **0.8.2**, digest histórico del Hub y servidor
9.0.0; no anunció 0.9.0. El plugin actual expone 69 herramientas, incluidas las
17 Website anunciadas, con get, contrato y operaciones de edición incremental.
El conector legacy alternativo disponible en la sesión no expone herramientas
Website. Una futura adopción del servidor no actualiza automáticamente ese
inventario: actualizar/rescanear la conexión y consultar otra vez el contrato;
si faltan tools, reconectar desde Configuración de la app conservando los scopes.
Esto no se considera un rescaneo ya ejecutado ni una adopción comprobada.

Se leyó `website.senda-work-anywhere`: revisión **21**, una página con 116 bloques,
Atlas 0.8.2 y 16 assets. No se llamó ninguna herramienta de escritura sobre el
recurso. No hay capturas de SENDA en staging ni comparación con diseño aprobado:
la aceptación de navbar, hero, categorías, producto, historias, beneficios, footer,
newsletter e imágenes queda pendiente. No se presenta una fixture como aceptación.

## Rollback y continuación

El tag/source y los hashes anteriores de Atlas permanecen disponibles; volver el
pin del host a 0.8.2 no requiere despublicar 0.9.0. El tag npm latest no controla
consumidores con versiones exactas. No se cambió ningún runtime activo del ERP/Hub.

El mecanismo documentado del Hub sigue siendo
`pnpm prod:rollback --to <previous-full-sha>` bajo lock/confirmación del operador
y rechazando migraciones desconocidas por la revisión anterior. No se ensayó sin
un staging configurado. Tampoco se verificó un rollback de ERP ni conservación de
documentos 0.9.0 tras rollback de servidor. Nada de esto se reporta como probado.

Para continuar: cerrar el trabajo ajeno con sus propietarios, reconciliar los dos
digests históricos sin pérdida, resolver los fallos de integración, preparar y
publicar los ocho paquetes por el workflow protegido desde revisión limpia,
verificar su manifest y adoptar los pins exactos. Después ejecutar staging, E2E
en nueve anchos y dos motores, aceptación de SENDA y ensayo de rollback. Sólo si
esos gates pasan corresponde ejecutar producción. La fase completa sigue pendiente.

Evidencia local ignorada: ERP `.artifacts/website-responsive-foundation/` contiene
baseline de privacidad, pruebas y rechazo del release compartido; Atlas
`.artifacts/responsive-0.9.0/` contiene tarball probado/publicado, integridad,
verificación e instalación registry; Hub `.artifacts/website-responsive-foundation/`
contiene logs de stack, migración, worker, unitarias, integración y métricas.
