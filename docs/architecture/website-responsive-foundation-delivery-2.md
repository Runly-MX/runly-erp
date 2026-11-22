# Website Responsive Foundation — segunda entrega local

La publicación y los bloqueadores comprobados posteriormente se documentan en la
[fase 3](website-responsive-foundation-phase-3.md). Este informe conserva el estado
histórico del cierre local de la segunda entrega.

Continúa la [primera entrega](website-responsive-foundation.md). Estado: candidato
local verificable; **no aprobado para producción**. No se publicaron paquetes, no
se hizo push ni despliegue y no se modificó SENDA. Se conservaron los cambios de
otras sesiones, incluidos los cambios de LMS pendientes en ERP.

## Revisiones y alcance

| Repositorio | Commit local en main | Resultado |
| --- | --- | --- |
| Atlas Web Builder | `1bd206b4cfd3aefd012598de10f844c090189371` | Contenedores, fondos, visibilidad, Inspector y diagnóstico |
| Runly ERP | `0abc9d5de287142a64f81304b26b5348a4191440` | Bloques por ancho del canvas, inventario y regresiones |
| Developer Hub | `95fe5088b969ea9f36f09cba724ec1b1e0c94ae5` | Candidato embebido, catálogo separado y salida del validador |

Este informe se registra en un commit documental posterior. Los pins publicados
0.8.2 continúan vigentes. No se tocaron esquemas de datos ni se introdujeron
migraciones de documentos o dependencias silenciosas.

## A. Atlas e Inspector

Se completaron los presets full width, XL (1280), 2XL (1536) y límite personalizado;
full-bleed permite fondo exterior y contenido interior centrado. Se añadieron
imagen de fondo, tamaño y posición por dispositivo, con vaciado explícito del
fondo y validación de URL. Permanecen editables object-fit/object-position,
dimensiones, mínimos/máximos, proporción, espaciados, flex, wrap, orden,
distribución, grid y overflow del motor anterior.

La herencia desktop → tablet → mobile distingue la ausencia de override de cero,
false y cadena vacía válida. El reset móvil también contempla el valor histórico
de columnas de Box: un indicador interno permite heredar sin reintroducir ese
default. Copiar, reset, undo/redo y roundtrip tienen regresiones.

Visibilidad distingue `visible`, `hidden` (conserva espacio, semántica histórica)
y `collapsed` (display none). Los últimos dos estados retiran el contenido de la
navegación y exposición ordinarias del navegador. Se verificaron geometría y
paridad del renderer; queda pendiente aceptación manual con tecnologías de
asistencia y contenido real.

El diagnóstico informa elemento, padre, propiedad probable, ancho disponible,
ancho real, exceso y dispositivo, compensando el zoom. Ignora recortes y scrolls
intencionales. La selección abre el Inspector y la reparación de max-width exige
un valor y una aplicación explícita, reversible con undo. Es una heurística sobre
elementos inspeccionables, no una atribución infalible de cualquier desbordamiento.
El Hub ofrece el diagnóstico en preview cuando el candidato exporta esa API.

## B. Bloques especializados

El [inventario generado](website-blocks-responsive-inventory.json) enumera los
129 bloques registrados en los cuatro grupos, sus campos personalizables,
señales de dimensiones fijas, posición absoluta, viewport, hover, controles,
ARIA y alt, y cobertura por navegador. Se genera con
`node scripts/audit-website-responsive.mjs` después de la matriz de navegador.

Las señales estáticas incluyen helpers compartidos: no son defectos confirmados
por bloque. Cada bloque tiene 18 verificaciones geométricas con sus valores
predeterminados. Esto no certifica todos sus datos posibles, accesibilidad,
acciones comerciales o integraciones externas. Carruseles, zoom de imágenes,
estados con datos y navegación asistida requieren aceptación específica adicional.

| Problema reproducido | Causa y corrección reutilizable | Regresión |
| --- | --- | --- |
| Canvas angosto dentro de viewport grande | Reglas width evaluaban viewport; `responsiveCss` las convierte al contenedor `atlas-page` | 129 bloques × nueve anchos × dos motores |
| Texto y grids demasiado anchos | Unidades vw y mínimos rígidos; tamaños cqw y mínimos limitados al ancho disponible | Misma matriz y verificación de overflow |
| AgencyVoices móvil | Spans históricos generaban columnas implícitas | Figuras ocupan la fila móvil; captura a 320 |
| MercadoHeader a 320 | Grid, buscador y acciones excedían el ancho | Grid de dos columnas, min-width y border-box; cuenta/favoritos disponibles en drawer |
| Maya portrait | Insignias decorativas sobresalían de la columna | Espacio reservado para las insignias sin ocultar el desbordamiento |
| CartPage y botones | Tracks, cantidad y resumen con mínimos inflexibles | minmax(0,1fr), wrap y límite de ancho de botones |
| Newsletter sin vincular | Marcador de plantilla tratado como formulario disponible | Instrucción de configuración en editor y estado no disponible en público; no se envía solicitud |

Las consultas físicas de hover/pointer y reduced-motion no se convierten en
consultas de contenedor. Las condiciones mixtas conservan su semántica y requieren
revisión cuando se añadan nuevos diseños. StoreNavbar conserva su implementación
anterior de container queries y fallback.

Navbar conserva carrito con menú cerrado, identificadores por instancia, apertura,
cierre, Escape y retorno de foco. Se probaron varias instancias dentro de un
iframe real, interacción táctil y renderer público.

Los formularios mantienen campos obligatorios, honeypot y protección configurada;
se probaron carga, error, éxito y prevención de envíos simultáneos. Las pruebas de
servicio cubren creación/reutilización de `@newsletter`, ownership, campo email,
vinculación en la transacción suministrada y propagación de errores. Usan una
transacción simulada: **no demuestran commit/rollback contra una base de datos**.

## C. Hub, compatibilidad y validador

El catálogo nuevo está en
`packages/contracts/website-builder-candidates/0.9.0.json` del Hub, acompañado de
manifest. Contiene 156 tipos y referencia la revisión exacta de Atlas indicada
arriba. Estado `unpublished-candidate`, `productionRegistered: false`.

Digest nuevo:
`f76c43490dec511a23fa1a27b9f0dce1b477457e27397d95d19a1507c85d5e67`.

Digest histórico 0.8.2 conservado:
`2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318`.

El loader de producción no registra este snapshot. Se construye sobre los bloques
especializados de 0.8.2, conserva los snapshots anteriores y no cambia sus digests.
El adaptador no permite escribir el nuevo indicador interno de herencia mediante
un catálogo histórico que no lo admite; explica la necesidad de actualización.

Se verificaron lectura histórica, preservación de campos, escritura candidata,
exportación/importación ZIP e imágenes empaquetadas. El Frame real del Hub usa
iframe sandbox con MessageChannel. Los navegadores verificaron edición móvil sin
alterar tablet/desktop, imagen, fondo vacío, modos de visibilidad, full-bleed,
preview y diagnóstico. El renderer público real se probó también con SSR e
hidratación, además de su ruta cliente histórica.

**Integración persistida bloqueada:** el test autenticado no llegó a Website:
la creación/login de cuenta de prueba devolvió HTTP 500 porque Auth local rechazó
la conexión. El stack local requerido no estaba disponible y Compose exige
`RUNLY_PACKAGES_NPMRC`, ausente en esa configuración. No se inventaron secretos,
iniciaron servicios con configuración incompleta ni alteraron datos. Guardado de
revisiones y reapertura autenticados, preview privado desplegado y transacción
real quedan pendientes de un entorno de integración operativo. No se ejecutó la
suite completa de integración sin ese prerrequisito.

El validador ahora permite medir bytes, tiempo, código/señal y pico RSS sin incluir
stacks ni contenido privado. Website write puede omitir la segunda copia base64
de los assets en la respuesta del hijo; el servicio reconstruye esa parte con
assets de entrada cuyo SHA coincide. Un SHA desconocido se rechaza. La API por
defecto y el ZIP conservan su contenido; se comprobó igualdad exacta del ZIP.

Medición local con una fotografía real convertida a dos PNG y un WebP:

| Operación | Entrada bytes | Salida bytes | Tiempo ms | Pico RSS bytes | Código/señal |
| --- | ---: | ---: | ---: | ---: | --- |
| Escritura con duplicación anterior | 10,547,532 | 21,102,479 | 1061 | 205,467,648 | 0 / ninguna |
| Escritura compacta | 10,547,532 | 10,555,727 | 1016 | 214,945,792 | 0 / ninguna |
| Reapertura ZIP | 7,913,853 | 10,550,558 | 808 | 156,237,824 | 0 / ninguna |
| Límite de salida de prueba 1024 B | 10,547,532 | 65,536 observados | 1007 | no disponible | SIGKILL |

La salida se reduce aproximadamente a la mitad, pero esta muestra **no muestra
reducción de memoria**. El límite se detecta al recibir un chunk, por eso los
bytes observados pueden exceder el umbral. El último caso informa
`VALIDATOR_OUTPUT_TOO_LARGE`. Se conservan las pruebas de clasificación de
`WEBSITE_INVALID`, `VALIDATOR_CRASHED`, `VALIDATOR_INTERNAL_ERROR` y
`VALIDATOR_MEMORY_LIMIT`. No se afirma haber resuelto todos los casos operativos
de crash/OOM por clasificar sus errores o por compactar una respuesta.

## D. Pruebas y evidencias

| Alcance | Resultado |
| --- | --- |
| Atlas, suite completa | 250/250; lint y build aprobados |
| ERP, helpers responsive y servicio de formularios | 7/7; lint dirigido aprobado |
| Bloques con defaults | 2322 casos, cero errores y overflow horizontal en Chromium/WebKit |
| Baseline comparativo Chromium | 387 casos; 21 casos con overflow antes de corregir |
| Laboratorio editor/preview/público | 38 casos aprobados, más aserciones de navbar/formulario/Inspector |
| Capturas de tres correcciones a 320/820/1440 | 18 casos aprobados |
| Frame Hub real | Chromium y WebKit aprobados, ZIP y comprobaciones a 390/820/1440 |
| Rutas públicas reales | SSR/hidratación, teclado/touch, nueve anchos, ambos motores aprobados |
| Hub, suite unitaria completa | 787 casos: 785 aprobados, cero fallidos, dos omitidos |
| Hub, lint y build normal con pins publicados | Aprobados; advertencia de tamaño de chunk |

Anchos: 320, 360, 390, 768, 820, 1024, 1280, 1440 y 1920. También se verificó
viewport 1920 con canvas 390. No se ejecutó la suite global completa del ERP;
se ejecutaron las pruebas dirigidas y los navegadores pertinentes a esta entrega.
Se corrigió la expectativa de aislamiento del Hub para permitir únicamente el
clasificador `website-failure.js` añadido en la primera entrega; la suite completa
se volvió a ejecutar después y terminó sin fallos.

React Doctor: Atlas 86/100 (dos avisos de exportaciones mixtas); Hub 89/100 sin
hallazgos; ERP 68/100 con 57 advertencias de patrones de exportación ya presentes,
complejidad del formulario y componentes Bookings/LMS. No se hizo una limpieza
general ajena al objetivo ni se desactivaron comprobaciones.

Evidencias locales ignoradas, no distribuidas como assets del producto:

- ERP `.artifacts/website-responsive-foundation/`: `blocks-results.json`,
  `blocks-baseline.json`, `blocks-captures.json`, `results.json`, capturas de
  AgencyVoices/MercadoHeader/CartPage y del editor/navbars en iframe.
- ERP `.artifacts/website-touch/`: renderer público real, SSR e hidratación.
- Hub `.artifacts/website-elements/`: capturas responsive de Chromium/WebKit.
- Hub `.artifacts/website-responsive-foundation/`: métricas fotográficas,
  logs de build y `hub-unit-final.tap`.

Las imágenes de la matriz general se interceptan como placeholders; la prueba del
Hub y la medición del validador verifican assets empaquetados. Las capturas se
inspeccionaron, pero ninguna fixture sustituye la aceptación final de SENDA.

## Privacidad y bloqueadores

El analizador de privacidad del ERP no encontró hallazgos en los archivos de esta
entrega: Atlas 9, ERP 57 y Hub 16 antes del informe; el informe se comprueba en su
commit. `pnpm check:privacy` global mantiene 23 hallazgos de archivos ajenos
(Growth, fixtures de dominios y correo). No se corrigieron ni eximieron. Ese gate
bloquea compartir/publicar la revisión completa hasta resolverlo con sus dueños.

También bloquean la aceptación: Auth/configuración local para integración real,
validación en staging, accesibilidad manual con contenido real y aceptación SENDA.
El release compartido exige un árbol limpio; los cambios ajenos pendientes deben
cerrarse con sus propietarios antes de preparar una revisión publicable.

## E. Orden de adopción y rollback — preparado, no ejecutado

1. Resolver los bloqueadores y fijar las revisiones revisadas. En Atlas repetir
   `pnpm test`, `pnpm lint`, `pnpm build`; preparar
   `pnpm pack --pack-destination .artifacts/responsive-0.9.0`, probar el tarball
   como consumidor y sólo entonces publicar 0.9.0 mediante el flujo autorizado.
2. Regenerar y revisar el catálogo nuevo contra ese paquete publicado. Registrar
   versión/digest 0.9.0 como entrada nueva en ERP y Hub. Antes de reemplazar el
   catálogo actual del ERP, copiar 0.8.2 a un snapshot histórico y cambiar su mapa
   a ese archivo: hoy 0.8.2 apunta al catálogo actual. No sobrescribir su identidad
   al actualizarlo ni eliminar snapshots anteriores. Verificar todos los digests.
3. Actualizar el pin de Atlas en Website Blocks, asignar la versión compartida y
   actualizar coherentemente dependencia de desktop/ERP y lockfile. Ejecutar
   pruebas, privacidad, build, SSR/hidratación y tarball como consumidor.
4. Con revisión completa y árbol limpio preparar
   `pnpm release:shared --revision <full-sha>`. El manifest queda en
   `.artifacts/shared-release/<full-sha>/manifest.json`. La publicación compartida
   se efectúa mediante `.github/workflows/shared-packages.yml`, con `revision`
   exacta y `publish: true`, entorno protegido `shared-packages`; su valor por
   defecto es false. No eludir la exigencia de árbol limpio ni privacidad.
5. En Hub consumir el manifest ya publicado con
   `pnpm shared:adopt --manifest <published-manifest>`. El script verifica registry
   y build limpio antes de alterar manifests. Actualizar también el pin directo
   de Atlas, overrides y lockfile coherentemente; registrar el catálogo sólo cuando
   su paquete exista. Ejecutar lint, unitarias, build e integración autenticada.
6. Desplegar primero a staging con los mecanismos existentes. Verificar documentos
   históricos, campos nuevos, revisión guardada/reabierta, PNG/WebP, newsletter
   transaccional, iframe, preview privado, público, SSR e hidratación. Registrar
   imágenes de runtime, hashes, manifests y revisión anterior antes del cambio.
7. Ensayar rollback en staging y comprobar el renderer público después de volver.
   Hub dispone de `pnpm prod:rollback --to <previous-full-sha>` en el host de
   operación, con su confirmación y lock; rechaza migraciones desconocidas por la
   revisión anterior. ERP debe volver a la revisión/runtime anterior mediante su
   mecanismo de release vigente. No restaurar bases ni borrar documentos.
8. Ejecutar aceptación visual y funcional de SENDA en modo de lectura. No crear
   páginas ni corregir componentes globales con reglas específicas de ese sitio.
   Aprobar producción sólo después de documentar esa aceptación.

Para revertir la adopción de código/dependencias, crear commits de reversión
normales de los cambios de adopción y recuperar los pins/manifests anteriores;
no reset/force ni eliminación de snapshots. Los documentos con overrides nuevos
deben conservarse íntegros aunque el runtime anterior no los interprete. Verificar
esa conservación antes del rollback. Esta entrega no autoriza ejecutar ninguna
publicación ni operación de producción de esta lista.
