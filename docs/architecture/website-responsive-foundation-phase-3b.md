# Website Responsive Foundation — fase 3B

La ejecución posterior y los bloqueadores vigentes se documentan en la
[fase 3C](website-responsive-foundation-phase-3c.md). Este informe conserva el
estado histórico de la fase 3B.

Continuación de la [fase 3](website-responsive-foundation-phase-3.md).
**Cierre parcial: compatibilidad e integración implementadas; publicación
compartida, adopción del Hub y staging pendientes.** Atlas 0.9.0 no se modificó
ni se volvió a publicar. Producción permanece detenida.

## Cambios y revisiones

| Repositorio | Commit de implementación | Alcance |
| --- | --- | --- |
| ERP | `a3367cfd16e1ed348e1cef76337133f556e410f5` | Identidades históricas, catálogo final 0.9.0, pin exacto, lockfile y renderer público |
| Hub | `23919900937fd55c28111d5253fd9d80e5647805` | Contrato de salida Studio y reparación de las regresiones de integración |
| Hub | `718f3904a49272b1ea487a0be439d14129ac67e3` | Selección por versión/digest, preservación en edición incremental y pruebas MCP/lector aislado |

Los commits documentales posteriores registran el cierre. Se trabajó en main,
sin ramas, worktrees, stash, resets ni force push. Los archivos ajenos de
LMS/UI/Ticketing/Prisma/Website permanecen fuera de nuestros commits.

## Identidades de catálogo

| Identidad | Tipos | Digest | Tratamiento |
| --- | ---: | --- | --- |
| 0.8.2 del Hub | 156 | `2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318` | Snapshot original intacto; default histórico del Hub |
| 0.8.2 del ERP | 157 | `cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1` | Snapshot separado e inmutable; default histórico del ERP |
| 0.9.0 final | 157 | `f5b5d67e4ddbffeedbc8e33e934a19b2973cae42ea7892192ca7849984d5a5b2` | Atlas npm 0.9.0 y los bloques especializados actuales, incluido BookingPortalBlock |

La diferencia original fue la incorporación de `BookingPortalBlock` al catálogo
actual del ERP por `381cd859f`, conservando la misma versión de builder. Los otros
156 tipos coinciden. Ya no se utiliza el catálogo actual mutable como snapshot
ERP 0.8.2: apunta a `builder-catalogs/0.8.2-erp.json`. El snapshot de Hub también
se conserva en ERP como `0.8.2-hub.json`.

El lector compartido recibe `builderCatalogIdentities`, indexado primero por
versión y después por digest. Selecciona exclusivamente una identidad registrada
y recalcula su digest completo. Versiones o digests desconocidos fallan cerrados;
no se eliminan campos ni se prueban esquemas cada vez más permisivos.

El Hub mantiene su default 0.8.2 original y registra la variante ERP por separado.
El contrato MCP acepta `builderVersion` más `catalogDigest` opcional y anuncia
`availableCatalogs`. Abrir devuelve el catálogo de la identidad del documento.
Guardar y editar conservan esa identidad. Se corrigió un defecto adicional:
enviar la misma versión en `blocks_update` reemplazaba el digest por el default;
ahora sólo un cambio explícito de versión elige un nuevo default.

Los lectores publicados anteriores ya comprobaban el manifiesto antes de informar
`catalog_digest_mismatch`. Para ellos el proceso aislado sólo reintenta con el
snapshot registrado cuyo digest coincide exactamente con ese manifiesto. El resto
de límites, checksums, campos, licencias y validaciones siguen ejecutándose. No
hay selección por similitud ni fallback ante una identidad desconocida. El lector
nuevo resuelve la identidad directamente. Las pruebas también usan deliberadamente
el lector publicado de `aad51d79` para conservar esta compatibilidad.

El validatorId de Website incorpora las identidades adicionales: los informes
anteriores no se reescriben y pueden requerir revalidación. Los identificadores
Studio/Automation conservan su cálculo previo.

### Documentos reales e históricos

Se consultaron páginas, versiones y releases del ERP mediante una transacción
READ ONLY con timeout. Sus documentos Atlas no conservan `catalogDigest`; tampoco
se encontró `BookingPortalBlock` en los registros consultados. No se les atribuye
una identidad que no almacenan ni se migran por inferencia.

En el Hub se consultaron metadatos de SENDA y tres paquetes históricos distintos
(antiguo, intermedio y reciente): los tres declaran 0.8.2 y el digest del Hub.
La revisión actual continúa en **21**. Los hashes privados del muestreo quedan
sólo en la evidencia local ignorada. No hubo escrituras sobre SENDA.

La identidad ERP ampliada se acredita por el catálogo histórico y su commit de
origen; no se afirma haber encontrado un documento real que declare ese digest.
Se conserva igualmente para no romper ZIPs históricos externos o no inventariados.

### Catálogo 0.9.0 final

Se generó desde la dependencia npm 0.9.0 instalada y los bloques actuales, sin
modificar Atlas ni retocar el digest. Tiene 28 tipos base y 129 especializados.
La generación usa el mismo patrón de compilación en memoria del auditor para
evitar depender de un servidor Vite SSR.

ERP registra el snapshot nuevo y conserva todos los anteriores. Hub tiene el
archivo final en `packages/contracts/website-builder-catalogs/0.9.0.json`, pero
**no lo registra en el loader activo** antes de adoptar la publicación compartida.
El candidato anterior `f76c4349…` se conserva sin sobrescribir: no es el catálogo
final porque se basaba en los 156 tipos del Hub y otra metadata de generación.

## Tratamiento de los 20 fallos

Se reprodujo el baseline completo: 266 casos, 241 aprobados, 20 fallidos y cinco
omitidos. TAP cuenta tanto casos padres como hijos fallidos; se agrupan aquí sin
presentarlos como veinte defectos independientes.

| Grupo (fallos TAP) | Causa comprobada | Resolución y control conservado |
| --- | --- | --- |
| Procedencia API/worker/artifact (1) | El compilador normaliza `action` a `steps`; la expectativa conservaba el formato de entrada | Comparar la representación compilada canónica; se mantienen identidad de toolchain, SHA y revisión original inmutable |
| MCP H3 (3) | Inventario ampliado más el defecto Studio descrito abajo | Verificar presencia de las seis operaciones requeridas y ausencia de moderación/firma/publicación; no fijar el inventario completo al número antiguo |
| Marketplace/moderación (2) | El control de autoridad ahora devuelve PLATFORM_AUTHORITY_REQUIRED | Actualizar el código esperado; el actor sigue rechazado y se conservan los casos de conflicto de interés |
| Consentimiento/scopes (2) | La lista canónica tiene 20 scopes; el test fijaba 16 | Usar la lista canónica, comprobar unicidad y conservar rechazos SQL/API de desconocidos, duplicados, NULL y grants insuficientes |
| Media activation (1) | Studio persistía y luego su salida fallaba; además la reapertura Website ahora es resumida por defecto | Reparar el DTO y pedir explícitamente documento; hashes PNG, permisos y roundtrip permanecen comprobados |
| Autoridad/plataforma (3) | El DTO de áreas añadió `resources` | Esperar el área correspondiente al rol; no modificar grants ni aceptar escalada de administrador de tenant |
| S7A SQL (1) | Expectativa anterior a la política D1, que permite advisory con auditoría y gates por release | Probar el evento auditado y el rechazo de degradar required mientras publication está habilitado; no cambiar la política existente |
| Studio package v2 (5) | Fallo inicial de salida Studio causaba errores posteriores de file/id/recurso | Corregir el DTO, no fabricar resultados para los pasos dependientes; v8, imagen, validación, revisión y publicación local-test vuelven a comprobarse |
| Fixture de scopes Studio (1) | Reaplicaba sólo una migración antigua y perdía scopes posteriores en su transacción | Reproducir las declaraciones posteriores de la función y verificar el conjunto actual; rollback al terminar |
| Website RC (1) | Feature flag y root de validador ausentes, ZIP externo inexistente, vistas resumidas y ruta de tarballs legacy | Configurar la fixture local, generar un ZIP v2 reproducible, usar vistas explícitas y verificar el registry instalado; se mantienen checks de derechos, revisión, scopes e integridad |

El defecto real de Studio estaba en `OUTPUT_SCHEMAS`: save añadía `validation`,
pero el esquema strict sólo admitía `file` y `draftRevision`. Se añadió una forma
explícita y opcional para resultado/errores, incluida la posibilidad de ausencia
de evidencia. Campos como stack/privateBytes y resultados desconocidos siguen
rechazados. No se convirtió el esquema en passthrough ni se ocultó una escritura
ya persistida detrás de un error interno de serialización.

Las pruebas unitarias detectaron después una regresión de selección de catálogo:
el resumen podía ignorar el catálogo restringido del llamador. Se corrigió para
preservarlo cuando no se pide un digest explícito. También se rechazan digests
vacíos, NULL, no hexadecimales y claves heredadas como `__proto__`.

## Verificación

| Alcance | Resultado |
| --- | --- |
| Interchange compartido | 25/25 |
| Catálogos ERP y roundtrip histórico | 5/5 |
| Preparación Website y catálogos | 7/7 |
| Mecanismo de release compartido | 5/5 |
| Matriz Website Blocks | 2322 casos Chromium/WebKit, cero incidencias |
| Renderer público real con Atlas npm 0.9.0 | SSR/hidratación, teclado/táctil y nueve anchos aprobados |
| Build desktop ERP | Aprobado; artefacto local, sin publicación de instalador |
| Hub: lectores aislados/contratos/guardado/validador | 33/33 dirigidos |
| Hub: MCP real de ambas identidades | Aprobado; edición incremental y rechazo de digest desconocido sin incrementar revisión |
| Hub: Frame responsive candidato | Chromium y WebKit aprobados; no certifica una adopción ni staging |
| Hub: unitarias completas | 791 casos: 789 aprobados, cero fallidos, dos omitidos |
| Hub: integración completa ampliada | 267 casos: 262 aprobados, cero fallidos, cinco omitidos |
| Hub: lint/build | Aprobados; advertencia conocida de tamaño de chunk |
| Privacidad ERP | Cero hallazgos |
| React Doctor ERP | 90/100, sin errores reportados en el alcance revisado |

Se ejecutó de nuevo la suite completa tras los cambios de catálogo y los ajustes
finales. Los cinco skips son laboratorios Docker/coordinador que exigen activación
explícita; no se contabilizan como aceptación de un host staging. No se ejecutó
la matriz E2E global completa ni una aceptación física iOS/Android. No se repitieron
los 250 unitarios de Atlas: su repositorio/paquete no cambió en esta fase.

## Publicación y adopción: bloqueo conservado

La revisión propia ERP `a3367cfd1` está preparada, pero existen cambios activos
de otras sesiones en LMS, UI compartida, Ticketing/Prisma y Website, entre ellos
`EvaluationInfo.jsx`, `FileUploader.jsx`, `block-catalog.json` y el export de
Website Blocks. No se añadieron a nuestros commits ni se
revirtieron. El inventario exacto es el status del workspace en el momento de
continuar; puede seguir cambiando mientras esas sesiones trabajan.

Los resultados y el catálogo final de este informe corresponden a nuestra
revisión comprometida, no certifican las modificaciones ajenas posteriores.
La integración de nuevos bloques requiere volver a generar y revisar su catálogo
antes de publicar; el snapshot histórico y sus referencias deben preservarse.

El preflight real `pnpm release:shared --revision a3367cfd16e1ed348e1cef76337133f556e410f5`
rechazó el árbol con `SHARED_RELEASE_REQUIRES_CLEAN_TREE` antes de empaquetar.
No se utilizó otro checkout para eludirlo, ni stash, ni se disparó el workflow
con publish=true. El entorno GitHub `shared-packages` existe y tiene política
de ramas; no se consumió una aprobación ni se alteró su protección.

No hay un manifest nuevo publicado, hashes de paquetes nuevos ni versiones que
puedan adoptarse. Por ello no se ejecutó `shared:adopt` ni se hizo una adopción
parcial del Hub.

| Consumidor | Estado real |
| --- | --- |
| ERP workspace | Atlas exacto 0.9.0, lockfile actualizado y catálogo nuevo; compartidos del workspace |
| Hub | Atlas 0.8.2 y ocho paquetes registry de `0.1.0-source.aad51d79693d4f88376579c3aab8f36a84527b8c` |
| Website Blocks nuevo | Fuente implementada/compilada; publicación y adopción registry pendientes |
| Atlas npm | 0.9.0 publicado previamente; intacto |

Para continuar, los propietarios deben cerrar su trabajo por el flujo normal.
Después: revisar main integrado, repetir privacidad/checks de la revisión limpia,
preparar release:shared, comprobar los ocho paquetes y sus hashes y publicar sólo
esa revisión por el workflow protegido. Verificar el manifest publicado antes de
adoptarlo en Hub. La adopción debe actualizar conjuntamente Atlas, overrides,
lockfile, Website Blocks, validador/worker y registro del catálogo 0.9.0 final.

## Staging y rollback

No se localizó configuración autorizada de staging de estas aplicaciones en los
entornos/artefactos operativos inspeccionados ni un environment de despliegue del
Hub en GitHub. La documentación S7A/S7B encontrada corresponde al staging de
módulos y mantiene el host dedicado diferido; excluye el servidor compartido.
No se utilizó como permiso para desplegar la aplicación en otro destino.

Plan de ejecución una vez disponibles las dependencias y la configuración:

1. Capturar desde el entorno autorizado las revisiones/imágenes activas, manifests,
   hashes de runtime, configuración y catálogos; conservar la revisión anterior.
   No usar valores de ejemplo como destinos ni introducir secretos en Git.
2. Desplegar a staging por su mecanismo operativo documentado, con los manifests
   publicados exactos. Verificar dependencias, toolchain y bytes antes de activar
   el tráfico. Reconstruir worker y comprobar health de API/editor/renderer.
3. Ejecutar los flujos autenticados: ambos catálogos 0.8.2, creación 0.9.0,
   guardado/reapertura, revisión anterior, PNG/WebP y licencias, newsletter real,
   iframe, preview privado y público con SSR/hidratación. Comprobar los nueve anchos
   y Chromium/WebKit, incluido viewport 1920 con canvas 390.
4. Consultar el contrato desplegado: 0.9.0 con digest final y ambas identidades
   0.8.2. Rescanear/reconectar el plugin si no anuncia `catalogDigest` y verificar
   después el inventario; un push del backend no actualiza su catálogo por sí solo.
5. Confirmar primero el mecanismo/layout aislado de rollback del host staging.
   El comando documentado de Hub es `pnpm prod:rollback --to <previous-full-sha>`:
   usarlo allí sólo si se verificó que su configuración/lock/confirmación apuntan
   exclusivamente a esa instalación, nunca al servidor compartido. ERP usa su
   mecanismo de release vigente. No restaurar bases ni borrar documentos.
   Comparar SHA/revisiones de documentos 0.9.0 antes/después y verificar que el
   runtime anterior los preserve aunque no pueda editarlos.
6. Inspeccionar SENDA revisión 21 en modo de lectura y guardar capturas reales de
   navbar, hero, categorías, producto, historias, beneficios, footer/newsletter e
   imágenes. Distinguir plantilla/editor/renderer. No crear páginas ni revisiones.

Ese plan **no se ejecutó**: publicación compartida y configuración de staging
siguen pendientes. No hay rollback de servidor ensayado ni aceptación visual
SENDA. Producción permanece detenida. La fase 3B no se declara completa.

Evidencias locales ignoradas en `.artifacts/website-responsive-foundation/` de
ERP/Hub: `catalog-identities-phase-3b.tap`, `identities-mcp-phase-3b.tap`,
`identities-isolated-phase-3b.tap`, `catalog-verified-phase-3b.tap`,
`hub-integration-phase-3b-baseline.tap`, `hub-integration-verified-phase-3b.tap`,
`unit-release-check-phase-3b.tap`, `frame-candidate-phase-3b.tap`,
`shared-preflight-phase-3b.log`, `privacy-release-check-phase-3b.log` y
`senda-history-phase-3b.json`. El último contiene el muestreo privado de sólo lectura.
