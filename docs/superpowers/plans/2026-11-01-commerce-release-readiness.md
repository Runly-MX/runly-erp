# Runly Commerce — expediente de preparación de liberación y piloto

Fecha: 2026-11-01. Preparado sin SSH, push ni despliegue, sin tocar bases reales ni credenciales. **Este documento no autoriza la liberación**: la decisión es de la persona responsable, según los criterios GO / NO-GO de la sección 9.

## 1. Candidato

- **SHA del candidato de software: `15a42bd4920baf58062a75300d69ee904f0bd334`** (`main`, árbol limpio al verificarlo). Es el cierre de la fase 6.
- Los documentos de esta sección, `scripts/rehearse-commerce-migrations.mjs` y este expediente se registran en un commit posterior que solo agrega documentación y una herramienta de ensayo; no cambia código de producción. Para publicar, usa el SHA que tú elijas **después de revisarlo** y verifica que `git diff 15a42bd49 <SHA> -- apps packages prisma` esté vacío.
- Diferencia respecto a la última base sin Commerce (`1fd80f5d1`): 250 archivos, **6 migraciones nuevas** (5 de Commerce y 1 ajena a Commerce, ver sección 5), el modelo de datos (`prisma/schema.prisma`) y 2 permisos nuevos (`pos.refunds.create`, `pos.discounts.apply`). No se eliminó ninguna migración, tabla, columna ni permiso existente.
- Las migraciones históricas no se modificaron.

## 2. Comprobaciones ejecutadas (esta preparación)

| Comprobación | Resultado |
|---|---|
| `eslint` sobre los 4,677 archivos JS versionados | 0 errores, 1 advertencia |
| `pnpm lint` (`eslint .`) en el árbol de trabajo | 1 error en `.e2e/bridge-fixture-code.js`: **no afecta a la liberación** (ver abajo) |
| `check:uuid-policy`, `check:supabase-schema-ownership` (los dos flujos automáticos de CI) | Correctos |
| `vite build` del escritorio | Correcto |
| `check:privacy` | 67 hallazgos de política, los mismos que en fases anteriores; 0 nuevos |
| `check:company-scope` | Sale con error en esta base **y en `1fd80f5d1`** con la misma salida (hash idéntico): preexistente y ajeno a Commerce (inventario, LMS, notas, Studio) |
| Pruebas globales `node --test` (5,609 pruebas, 690 suites, entorno sin variables de bases) | 5,585 pasan, **11 fallan**, 13 omitidas |
| Ensayo de migraciones sobre copia desechable (sección 6) | 14/14 |
| Suites de Commerce (fase 6, repetidas tras el último cambio de código) | Navegador: Tienda 83, Restaurante 143, fase 5 83; integración 41; Catálogo 90; galería 17; recorridos 34; HTTP 22 y 20; PostgreSQL 196; unitarias 123 |

**El error de lint del fixture.** `.e2e/` está en `.gitignore` (línea 111; solo un archivo suyo está versionado). `bridge-fixture-code.js` es un archivo local generado de 216,698 líneas que ESLint recorre porque la configuración no ignora `.e2e/`. Una copia limpia del candidato no lo contiene, de modo que el candidato pasa el lint (0 errores). No lo silencié ni cambié la configuración; quien quiera que `pnpm lint` también pase en su equipo puede borrar o mover ese archivo local, o decidir ignorar `.e2e/` en `eslint.config.js`. **No es un bloqueo.**

**CI real.** `.github/workflows` solo tiene tres flujos: `uuid-policy` y `supabase-schema-ownership-policy` (automáticos, ambos pasan) y `shared-packages` (publicación manual de paquetes compartidos, que exige un SHA completo contenido en `main`). **No existe un flujo automático de pruebas, lint ni build**: las compuertas de este expediente son manuales.

**Las 11 pruebas globales que fallan**, todas fuera de Commerce. **Actualización:** la sección 12 las compara contra la base anterior y las clasifica con evidencia (0 regresiones); la atribución por área de esta tabla queda como contexto:

| Área | Prueba | Causa observada |
|---|---|---|
| Runtime de módulos | 2 pruebas en `module-runtime-routes.test.js` y 1 en `contacts-proposal-module.test.js` | Dobles de Prisma sin `companyModule.findMany` / `runlyModule.findMany` |
| Transcripciones | `call-transcript-analysis-service` | No encuentra el cubo `runly.contacts`; el archivo cambió en los commits de transcripciones |
| Sitio web | `public-website-capture-config` | Configuración de captura pública |
| Catálogo de bibliotecas | `module-runtime-catalog` | Versiones instaladas en este equipo (19.3.0, 5.104.2, 1.56.0) distintas de las del catálogo generado (19.3.1, 5.104.4, 1.59.0): entorno local |
| Instalador | `installer-devkit-snapshot`, `runly-env-config` | Snapshot de exportaciones de `@runly/ui` desactualizado desde antes; dependencia del instalador |
| Studio (navegador) | 2 pruebas de `navigation-guard-browser` y `studio-branding-browser` | Pruebas de navegador de Studio |

Divulgación: una primera corrida global se lanzó por error con el entorno normal del shell; el shell no tenía variables de bases y la única prueba que usaría una base viva exige `RUN_CROSS_TENANT_TESTS=1` (omitida). La detuve a los pocos segundos y la repetí con el entorno vacío (`env -i`). No se tocó ninguna base real.

**Limitaciones.** Las 11 fallas deben revisarse antes de cualquier publicación general de otras líneas de trabajo; no bloquean el piloto de Commerce y, según la sección 12, fallan igual en la base anterior. No se ejecutó prueba alguna contra un servicio externo.

## 3. Riesgos conocidos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **Las migraciones no se revierten volviendo al código anterior.** El código anterior ya no puede ajustar existencias directamente (`commerce_stock_requires_ledger`, comprobado en el ensayo), por lo que un retroceso solo del código es seguro para ventas y lecturas, pero **no** para ajustes de existencias del catálogo antiguo | Alta | Procedimiento de la sección 8: ante falla, corregir hacia adelante; la restauración de respaldo es el único retroceso completo y pierde lo capturado después |
| R2 | El API aplica `prisma migrate deploy` **y** `prisma/seed.js` en cada arranque (`infra/docker/api-entrypoint.sh`); `update-local.sh` hace pull + migración + recreación sin pausa | Alta | Primera instalación con `docker-compose.no-db-init.yml` (`RUNLY_SKIP_DB_INIT=1`) y migración explícita |
| R3 | La migración 1 **aborta antes de cambiar nada** si existen sesiones de caja o turnos de mesero abiertos duplicados | Media | Preflight de solo lectura y cierre de turnos antes de la ventana |
| R4 | `pos.refunds.create` y `pos.discounts.apply` se crean sin concederse a ningún rol de empresa: tras actualizar, cajeros existentes **no podrán devolver ni descontar** hasta que un administrador los asigne | Media | Paso explícito del procedimiento; los roles de sistema (`runly.admin`, `system.admin`) los reciben solos |
| R5 | La migración 2 refleja en `catalog_stock_balance` las existencias que ya tenía cada producto, **sin asignarlas a sucursales**: hasta que alguien asigne existencias por sucursal, las sucursales no tendrán unidades vendibles de productos con control de existencias | Media | Asignar existencias por sucursal antes de abrir (Catálogo → existencias) |
| R6 | La migración de transcripciones (`20261217120000`) viaja en el mismo candidato aunque no es de Commerce | Baja | Es aditiva e idempotente (`IF NOT EXISTS`); se ensayó en el mismo orden |
| R7 | Las tablas y columnas nuevas llevan claves foráneas, índices y valores por omisión escritos en SQL que el modelo de datos no declara (27 diferencias de ese tipo) | Baja | `prisma migrate dev` generaría borrados de esos objetos: **nunca ejecutarlo sobre una instalación**; solo `migrate deploy` |
| R8 | **Tarjeta: no hay integración bancaria.** Los cobros con tarjeta requieren una terminal externa y la captura **manual** de la referencia en el campo obligatorio; el sistema no se comunica con la terminal ni confirma el cargo | Alta (operativa) | Capacitación y regla de caja: no cerrar la venta sin la referencia impresa de la terminal |
| R9 | Impresión: el sistema llega a «enviado al transporte»; no puede confirmar el papel | Media | Matriz H4/H5 |
| R10 | Sin ventas sin conexión ni cobro desde el dispositivo del mesero (alcance aprobado); sondeo de 5–10 s en lugar de tiempo real | Baja | Documentado a los operadores |
| R11 | Hardware, lector de pantalla y turno real sin validar | Alta para el piloto | Sección 10 |

## 4. Lo que el piloto verá cambiar sin intervención

- Módulos instalados: **ninguno cambia su estado instalado/habilitado** (comprobado con una ejecución repetida del `seed` sobre una instancia con módulos instalados: el estado de todos los módulos quedó idéntico).
- El `seed` solo modifica el catálogo de permisos (`permission`) y las asignaciones de los dos roles de sistema administradores (`role_permission`); otras filas de módulos, roles y planos solo refrescan su marca de tiempo. El contenido de datos de negocio (`company`, `pos_*`, `catalog_*`, usuarios) quedó idéntico.
- Todos los datos existentes de las 267 tablas del esquema anterior conservan sus valores (comparación por huella de cada fila sobre las columnas que ya existían).

## 5. Migraciones del candidato

Aplicar en este orden; `prisma migrate deploy` las toma por nombre. Cada una de Commerce corre dentro de una transacción explícita: una falla no deja un estado a medias.

| # | Migración | Qué hace | Riesgo |
|---|---|---|---|
| 1 | `20261101120000_commerce_recovery_integrity` | Columnas de moneda, versión, devoluciones y cambio en órdenes, líneas, pagos y sesiones; tablas `pos_command`, `pos_refund` (+ líneas y pagos); RLS y retiro de permisos públicos; **aborta si hay sesiones o turnos abiertos duplicados** | Preflight obligatorio |
| 2 | `20261101180000_commerce_catalog_stock` | Saldos por sucursal y disponibilidad POS; triggers de precio y de existencias (las existencias solo cambian por movimiento auditado); refleja existencias actuales sin asignarlas | R1, R5 |
| 3 | `20261101210000_catalog_write_integrity` | Columna `revision` y trigger de revisión en productos y variantes (PATCH con versión) | Bajo |
| 4 | `20261101230000_pos_receipt_print_jobs` | Intentos de impresión, etiqueta de variante, comprobantes inmutables | Bajo |
| 5 | `20261101233000_commerce_restaurant` | `outlet_id`/versión en mesas (sin piso obligatorio), despachos, asignaciones de pago, versiones y snapshots de cocina; el único relleno toma la sucursal demostrable del piso de cada mesa | Mesa con vínculo inconsistente queda sin sucursal y requiere conciliación |
| 6 | `20261217120000_call_transcript_engine_vocabulary` | **No es Commerce.** Motor y vocabulario de transcripciones | R6 |

## 6. Ensayo de migración y recuperación

**Herramienta:** `node scripts/rehearse-commerce-migrations.mjs` (Docker local con PostgreSQL desechable; no usa el entorno de la aplicación ni se conecta a nada más; borra su contenedor al terminar).

**Resultado sintético (datos inventados sobre el esquema anterior, 267 tablas): 14/14.** Respaldo (`pg_dump -Fc`) y huella de cada tabla; preflight sin pendientes; las seis migraciones en 0.9 s cada una; las 267 tablas conservan sus filas y valores; no se eliminó ninguna tabla ni columna; las tablas nuevas empiezan vacías salvo el espejo documentado de existencias; sin faltantes respecto a `schema.prisma`; el código anterior sigue insertando órdenes, líneas y pagos; el `seed` solo toca el catálogo de permisos; **restaurar el respaldo devuelve cada tabla a su huella previa y sin objetos de Commerce**.

**Ensayo sobre la copia del piloto: PENDIENTE.** No se proporcionó una copia. Procedimiento, a cargo del usuario:

1. En el servidor del piloto, respaldo lógico y de archivos (sección 8, paso 2); **copiar el archivo a un equipo local de ensayo** (nunca restaurarlo sobre la base viva).
2. En ese equipo, con Docker y la imagen `postgres:18-alpine` presente: `node scripts/rehearse-commerce-migrations.mjs --dump <archivo.dump>` (formato personalizado o SQL plano). La copia debe estar en el nivel de esquema que corre el piloto; si le faltan migraciones anteriores a Commerce, aplicar primero `prisma migrate deploy` con la versión que el piloto ya ejecuta.
3. Aprobar solo si todas las comprobaciones salen en PASS. Una falla del preflight (sesiones o turnos duplicados) es un hallazgo de datos que se concilia en el piloto, no un defecto del ensayo.
4. Adjuntar la salida al registro de liberación. Hasta entonces, el ensayo sobre datos reales **no se ha ejecutado**.

## 7. Compatibilidad con módulos ya instalados

Cubierto en las secciones 4 y 6: sin cambios de datos en tablas preexistentes, sin estado de módulos alterado, sin permisos concedidos automáticamente, sin eliminaciones. El `seed` es idempotente (segunda ejecución sin diferencias de contenido). Lo que **sí** cambia el comportamiento: las existencias de productos con control ahora se modifican solo mediante movimientos (R1, R5) y devoluciones/descuentos exigen los permisos nuevos (R4).

## 8. Procedimiento de despliegue controlado (a ejecutar por ti)

**A. Antes (días previos)**
1. Ensayo sobre copia del piloto aprobado (sección 6).
2. Elegir ventana sin operación y avisar al personal. Pedir cierre de todas las cajas y turnos de mesero.
3. `pnpm docker:release:check` (simulacro) y revisar qué se publicaría; decidir el SHA exacto (sección 1).
4. Preparar el rollback: versión actual de las imágenes anotada, respaldo verificado (`docs/deployment/backup-recovery.md`, `verify-backup.sh`), y archivo `pg_dump -Fc` reciente fuera del servidor.

**B. Ventana**
1. Anotar conteos de control en el servidor (solo lectura): órdenes, pagos, productos, usuarios, y `SELECT status, count(*) FROM pos_session GROUP BY 1`.
2. Preflight en la copia más fresca: sin duplicados.
3. **Respaldo final** inmediatamente antes (`pg_dump -Fc`) y copia fuera del servidor; registrar tamaño y hash.
4. Publicar **siguiendo la sección 14** (copia limpia del SHA, imágenes explícitas, digest anotados); no usar `pnpm docker:release` en modo automático desde un árbol de trabajo con otros cambios. **No** se hizo aquí.
5. Primera instalación **sin migrar al arrancar**: `docker-compose.no-db-init.yml` junto al compose normal (`RUNLY_SKIP_DB_INIT=1`). Si usas `update-local.sh`, hazlo así para la primera vez y fija `RUNLY_INSTALLER_REF` al SHA (sin esa variable descarga el instalador de la punta de `main`).
6. Migrar de forma explícita con un contenedor de un solo uso de la imagen **nueva** del API, en la red de la instancia: `pnpm exec prisma migrate deploy`. Esperado: las seis migraciones aplicadas, sin errores.
7. Ejecutar `node prisma/seed.js` en el mismo contenedor (crea los dos permisos).
8. Recrear API, worker y web con el compose normal (sin omitir la inicialización) y esperar `GET /health`.

**C. Después (antes de reabrir)**
1. `prisma migrate status`: sin pendientes. Conteos del paso B1 iguales o mayores.
2. Un administrador asigna `pos.refunds.create` y `pos.discounts.apply` a los roles que correspondan (R4) y asigna existencias por sucursal (R5).
3. Humo con datos de prueba, no con clientes: abrir caja, vender un artículo, pagar efectivo con cambio, devolverlo, cerrar caja; una cuenta de mesa con envío a Cocina y cobro; revisar que el corte cuadre.
4. Recorrer la lista de la sección 10. Solo entonces reabrir a los operadores.

**D. Recuperación**
| Situación | Acción |
|---|---|
| Falla antes del paso B6 | No hay cambios de datos: detener y conservar la versión anterior |
| Falla la migración | Cada archivo de Commerce es atómico; revisar el error, no reintentar a ciegas; si hay duda, restaurar el respaldo del paso B3 en una base nueva y comparar |
| Migrada pero con defecto grave en las primeras horas | **Corregir hacia adelante** con una nueva versión. Evitar volver al código anterior: no puede ajustar existencias directamente (R1) |
| Retroceso completo imprescindible | Detener API y worker; restaurar el respaldo B3 sobre la base (pierde todo lo capturado después; conciliar manualmente con los comprobantes impresos); arrancar las imágenes anteriores con `RUNLY_SKIP_DB_INIT=1` |

## 9. Criterios GO / NO-GO

**GO** (todos): (1) SHA revisado, `git diff` contra el candidato sin cambios de código; (2) ensayo sobre la copia del piloto en PASS; (3) respaldo final verificado y fuera del servidor; (4) preflight limpio; (5) matriz de la sección 10 completa con **cero RECHAZA** en las filas bloqueantes (B); (6) administrador de la empresa piloto revisó roles y asignó los permisos nuevos; (7) personal capacitado y consciente de R8; (8) una persona responsable decide la ventana y el retroceso.

**NO-GO** (cualquiera): ensayo fallido o sin ejecutar; preflight con duplicados sin conciliar; respaldo sin verificar; una fila bloqueante RECHAZA; diferencias en conteos tras migrar; permisos de caja sin revisar; si se espera cobro con tarjeta sin que el personal entienda que es manual.

## 10. Matriz de piloto

Estado de todas las filas: **PENDIENTE**. «B» = bloquea el GO si RECHAZA. Detalle de pasos, equipo y evidencia en [`2026-11-01-commerce-phase6-manual-validation.md`](2026-11-01-commerce-phase6-manual-validation.md) (H1–H9, tareas T1–T5 de lector de pantalla, O1–O4).

| Área | Qué se comprueba | Referencia | B |
|---|---|---|---|
| Apertura de caja | Abrir con fondo; bloquea si ya hay una abierta | Humo C3 | B |
| Venta de mostrador | Buscar, variante, cantidades, descuento autorizado, cobro y comprobante | T1, O1 | B |
| Escáner físico | 10 códigos seguidos; inexistente y ambiguo | H3 | B |
| Impresión de tickets | Térmica y, si aplica, Bluetooth; importes iguales a pantalla | H4, H5 | B si se imprime |
| Tarjeta | Referencia obligatoria capturada de la terminal externa; **sin integración bancaria** | H6 | B |
| Comandas y Cocina | Mesero sin caja envía; Cocina avanza y deshace; extras identificados | T2, T3, H7 | B |
| División y cobro de cuentas | Por comensal, partidas e importe; cambio; mesa liberada | T4, O1 | B |
| Devoluciones | Mostrador y restaurante; caja de la misma sucursal; existencias | O1 | B |
| Tableta táctil y teléfono | Controles ≥44 px; «Cobrar» y «Enviar» alcanzables | H1, H2 | B |
| Lector de pantalla | NVDA, VoiceOver, TalkBack en T1–T5 | A | B si hay usuarios con asistencia |
| Varios dispositivos | 3 pantallas de Cocina y 2 meseros a la vez; sin duplicados | H7 | B |
| Red | Corte de 30 s durante envío y cobro; sin pérdidas ni duplicados | H9 | B |
| Conciliación y fin de turno | Efectivo esperado = conteo; cierre de caja; corte de meseros si se usa | O1 | B |
| Permisos | Cada rol ve solo lo suyo; permisos nuevos asignados | O4 | B |
| Respaldo y restauración | Restaurar el respaldo en una copia y vender sobre ella | O3 | B |

## 11. Acciones que debes realizar personalmente

1. Decidir si el candidato es `15a42bd49` o un commit posterior solo de documentación, y revisar este expediente.
2. Proporcionar o generar la **copia aislada de la base piloto** y ejecutar el ensayo de la sección 6 en un equipo local; enviar la salida.
3. Revisar las 11 fallas globales (sección 2) con su responsable si pretendes publicar también esas líneas de trabajo.
4. Decidir sobre el error de lint del fixture local (borrarlo, moverlo o ignorar `.e2e/`).
5. Hacer el respaldo final, el push y el despliegue por el flujo habitual, siguiendo la sección 8 (aquí no se ejecuta nada de eso).
6. Asignar a los roles de la empresa los permisos `pos.refunds.create` y `pos.discounts.apply`, y asignar existencias por sucursal.
7. Ejecutar la matriz con dispositivos reales (sección 10), con tecnología de asistencia incluida, y registrar APRUEBA/RECHAZA con evidencia.
8. Capacitar al personal en que **la tarjeta se cobra en una terminal externa y la referencia se captura a mano**.
9. Dar tú el GO o NO-GO.


---

# Actualización: preflight local final

Fecha: 2026-11-01. Solo verificaciones locales. Esta actualización **sustituye** lo que contradiga a las secciones anteriores (en particular la tabla de las 11 fallas de la sección 2, y los pasos B4–B5 de la sección 8). Sin SSH, push, despliegue, restauraciones ni operaciones sobre bases reales.

## 12. Las 11 pruebas globales fallidas: clasificación con evidencia comparativa

**Método.** Referencia anterior a Commerce: `bb1a9c704`, padre del primer commit de Commerce (`580b1331b`). Es también casi el estado publicado: la última publicación de imágenes registrada en la máquina de construcción es `1c0fda679`, a 4 commits de `bb1a9c704` y sin migraciones entre ambos. Se creó un worktree independiente de esa referencia y otro de una copia limpia del candidato. `package.json` y `pnpm-lock.yaml` son idénticos entre las dos revisiones, de modo que ambos usan las mismas dependencias instaladas; los paquetes del monorepo (`@runly/*`) se enlazaron a las fuentes de cada worktree (se comprobó que `@runly/core` y `@runly/ui` resolvían a su propio árbol). Cada archivo de prueba se ejecutó en ambos con el mismo entorno vacío (`env -i`), reportero TAP, y se compararon los resultados de cada prueba.

**Resultado.** Las 14 líneas `not ok` (11 pruebas hoja y 3 contenedores) son **idénticas en la base anterior y en el candidato**. La única diferencia es una prueba nueva de transcripciones que pasa en el candidato. **Regresiones introducidas por el candidato: 0.** No fue necesario corregir código.

| # | Prueba | Clasificación |
|---|---|---|
| 1–2 | Runtime de módulos: invocación declarada / administración de eventos (`module-runtime-routes`) | Preexistente demostrado |
| 3–4 | Propuestas de contactos: disponible / deshabilitada por empresa (`contacts-proposal-module`) | Preexistente demostrado |
| 5 | Análisis de transcripciones: propuestas del módulo `runly.contacts` | Preexistente demostrado |
| 6 | Configuración pública de captura del sitio web | Preexistente demostrado |
| 7 | Catálogo de bibliotecas de runtime vs versiones instaladas | Preexistente demostrado y **dependiente del entorno** (las versiones instaladas en este equipo no coinciden con el catálogo generado) |
| 8 | Snapshot del kit de desarrollo del instalador | Preexistente demostrado |
| 9 | Distribución de la dependencia de configuración de entorno del instalador | Preexistente demostrado |
| 10–11 | Studio en navegador: guardia de navegación y tarjeta de marca | Preexistente demostrado; causa de fondo no investigada (pruebas de navegador) |

Límites de la comparación: misma máquina y mismas dependencias en ambos lados (por eso las dependientes del entorno fallan en los dos); el cliente de Prisma generado es el del candidato en ambos, lo que no afecta a pruebas con dobles de Prisma. Que sean preexistentes no las hace correctas: siguen siendo deuda de las otras líneas de trabajo.

## 13. Verificación del candidato exacto

- **SHA completo:** `15a42bd4920baf58062a75300d69ee904f0bd334`. Se creó la etiqueta **local** anotada `commerce-pilot-candidate` sobre ese SHA (no empujada).
- **Seis migraciones**, en el orden de su nombre, sin saltar ninguna (Prisma las aplica en ese orden). Dependencias: la 2 usa columnas añadidas por la 1; la 3 actúa sobre objetos del catálogo que la 2 prepara; la 5 modifica `pos_print_job`, que crea la 4; la 6 es independiente.
- **Migración de Transcripciones (`20261217120000`).** Aditiva e idempotente (`IF NOT EXISTS`): dos columnas con valor por omisión constante (`'LOCAL'`, sin reescritura de la tabla), una columna nullable y dos tablas nuevas. Con el valor por omisión **no cambia el comportamiento** ni envía audio a servicios externos: el motor alojado exige consentimiento registrado de un administrador. El código del API de este candidato **requiere** esas columnas para las transcripciones: no se puede publicar el API del candidato sin esta migración. Riesgo para el piloto: **bajo**; si el piloto no usa transcripciones no necesita la imagen del transcriptor (solo `--api --web --worker`).
- **Contenido ajeno a Commerce en el candidato** (34 commits desde `bb1a9c704`: 23 de Commerce, 6 de transcripciones/instalador y 5 del sitio web): transcripciones (hosted Whisper, glosario, correcciones; incluye `apps/transcriber`, `requirements.txt` y variables de instalador), sitio web (vista previa de plantillas, tema, contraste del héroe) e instalador (variables de transcripción, `installer-release.json`). Un piloto de Commerce recibirá todo eso. Si se quiere un candidato **solo** de Commerce habría que reconstruirlo seleccionando commits (no se hizo: es un cambio de alcance y exigiría repetir toda la validación).
- **Publicación fijada o no.** Hallazgos reales:
  1. Las imágenes se publican como `raulbellosom/runlyerp:<servicio>-latest` (**etiquetas mutables**, sin SHA ni versión), y `build-push.mjs` construye con el **árbol de trabajo de la máquina** donde se ejecuta (incluye cambios sin commit). No hay forma de "publicar el SHA X" salvo construir desde una copia limpia de ese SHA.
  2. `update-local.sh` descarga el instalador de la rama `main` del repositorio remoto **salvo que se defina `RUNLY_INSTALLER_REF`** con un SHA de 40 caracteres; sin esa variable toma la punta actual de `main`. Los compose descargan `-latest`.
  3. El comando `pnpm docker:release:check` (simulacro, ya ejecutado) pasa la comprobación de integridad del instalador y propone publicar API, Worker, Web y Transcriber (TTS y Backup sin cambios).
- **Cómo evitar una publicación accidental de otra revisión:** (a) construir las imágenes **solo** desde una copia limpia del SHA (sección 14); (b) fijar el instalador con `RUNLY_INSTALLER_REF=<SHA>`; (c) registrar los *digest* de las imágenes recién publicadas y fijar el compose del piloto a esos digest para que un `-latest` posterior de otra persona no lo altere; (d) no mezclar un push posterior a `main` antes de la ventana sin repetir esta revisión.
- **Rama o etiqueta de liberación.** Bastan una etiqueta anotada sobre el SHA (ya creada localmente) y una rama opcional `release/commerce-pilot` para correcciones que se apliquen **solo** al piloto. No se creó ni empujó ninguna rama. Empujar la etiqueta es decisión tuya.

## 14. Procedimiento de publicación fijado a un commit (sustituye B4–B5)

1. Copia limpia del candidato, no tu árbol de trabajo: `git worktree add ../runly-release commerce-pilot-candidate` (o clonar y hacer `git checkout 15a42bd4920baf58062a75300d69ee904f0bd334`). Verificar `git status` vacío y `git rev-parse HEAD` igual al SHA.
2. Instalar con el lockfile: `pnpm install --frozen-lockfile`. Ejecutar en esa copia las compuertas de la sección 15.
3. Antes de publicar, **anotar los digest actuales** de `api-latest`, `worker-latest`, `web-latest` (y `transcriber-latest` si se publicará) para poder volver a ellos: `docker buildx imagetools inspect raulbellosom/runlyerp:api-latest` (lectura del registro; requiere iniciar sesión).
4. Publicar solo lo necesario, explícito y desde esa copia: `node infra/docker/build-push.mjs --api --worker --web` (agregar `--transcriber` solo si el piloto usará transcripciones). No usar `--all` ni el modo automático (que decide por archivos cambiados desde el último release registrado en esa máquina).
5. Anotar los digest nuevos y registrar cuál compose los usa; en el piloto fijar `image: raulbellosom/runlyerp@sha256:<digest>` en un archivo de override en lugar de `-latest`.
6. Instalador: publicar de forma independiente el instalador committeado con sus archivos (los Docker no lo publican), y al actualizar el piloto ejecutar `RUNLY_INSTALLER_REF=15a42bd4920baf58062a75300d69ee904f0bd334 ./update-local.sh` (u otro SHA revisado que contenga el mismo instalador). Para la **primera** vez usar `docker-compose.no-db-init.yml` y migrar de forma explícita (sección 8, B5–B8).
7. El SHA debe existir en el remoto para que el instalador pueda descargarse con esa referencia; hacer el push es tuyo.

## 15. Compuertas desde una copia limpia

Ejecutado en un worktree limpio del SHA exacto, con las dependencias del equipo enlazadas:

| Compuerta | Resultado |
|---|---|
| `eslint .` raíz (sin cambiar configuración ni ignorar nada) | **Exit 0, sin errores** |
| `enforce-uuid-policy`, `enforce-supabase-schema-ownership-policy` | Correctos |
| `generate-installer-release --check` | Correcto |
| `vite build` del escritorio | Correcto |
| `check:privacy` | 67 hallazgos de política, los mismos; 0 nuevos |

**Cobertura real de CI.** Solo hay 3 flujos en `.github/workflows` (dos políticas automáticas y la publicación manual de paquetes compartidos). Lint, pruebas y compilación **no se ejecutan automáticamente**: son una compuerta manual que debe correrse en la copia limpia antes de publicar. `pnpm lint` en tu equipo seguirá fallando por el fixture ignorado hasta que lo muevas o lo ignores.

**Aislamiento del ensayo de migraciones.** El script se endureció: los procesos hijos reciben un entorno mínimo sin variables del operador, `DOTENV_CONFIG_PATH` apuntando a un archivo inexistente (porque `prisma.config.ts` y `prisma/seed.js` cargan `dotenv`) y una comprobación de que toda URL de base es `127.0.0.1`. Prueba de aislamiento: se ejecutó con `DATABASE_URL`, `DIRECT_URL` y la URL del preflight apuntando a una dirección no enrutable (`203.0.113.1`) en el entorno del operador, y el ensayo pasó **15/15**, es decir, no usó esas variables. El contenedor escucha solo en `127.0.0.1` y se elimina al terminar; si se interrumpe, quedan contenedores con la etiqueta `runly.commerce-rehearsal=true` (así quedaron tres de corridas interrumpidas durante esta preparación, que ya se eliminaron): `docker ps -a --filter label=runly.commerce-rehearsal=true`. El ensayo con una copia real **sigue sin ejecutarse**.

**Instalación nueva (alternativa de piloto aislado).** Una instalación nueva aplica todas las migraciones desde cero. Eso lo ejercitan las pilas desechables de Supabase en Docker de todos los E2E (decenas de corridas con las seis migraciones y el `seed`). Un intento de aplicarlas sobre un PostgreSQL desnudo se detuvo en la migración 41 porque requiere objetos de Supabase (`supabase_realtime`, `auth.uid()`); es una dependencia conocida de la imagen de base de datos, no un defecto de Commerce.

## 16. Bloqueos reales para un piloto aislado

1. **Ensayo sobre la copia de la base piloto**, si el piloto reutiliza datos existentes (pendiente de que proporciones la copia). Un piloto con **base nueva** no lo necesita.
2. **Validación física** (hardware y lector de pantalla), sección 10 y matriz manual.
3. **Publicación**: nadie ha construido todavía las imágenes desde una copia limpia ni anotado digest; sin eso, el piloto no es reproducible ni reversible por imagen.
4. Decisión sobre incluir contenido ajeno (transcripciones, sitio web, instalador) o preparar un candidato solo de Commerce.
5. Asignación de los permisos `pos.refunds.create` y `pos.discounts.apply` y de existencias por sucursal (R4, R5).
6. Un respaldo restaurable probado antes de migrar una base con datos.

**No son bloqueos:** las 11 fallas globales (preexistentes y ajenas), el error de lint del fixture local, la deuda de las otras líneas de trabajo.

## 17. Acciones humanas actualizadas

1. Elegir entre **piloto con base nueva** (más simple, no migra datos) o **piloto sobre datos existentes** (exige la copia y el ensayo).
2. Si hay datos: copia aislada + `node scripts/rehearse-commerce-migrations.mjs --dump <archivo>` en un equipo local; enviar la salida.
3. Construir las imágenes desde la copia limpia con los pasos de la sección 14; anotar digests (antes y después); empujar la etiqueta si quieres conservarla.
4. Mover o ignorar el fixture de lint a tu criterio.
5. Resto de las acciones de la sección 11 (permisos, existencias, matriz física, capacitación en tarjeta manual, GO/NO-GO).

## 18. Veredicto

**APTO PARA PREPARAR EL PILOTO.** Las 11 fallas globales están clasificadas con evidencia comparativa (0 regresiones del candidato), el candidato exacto y sus seis migraciones están verificados, el lint raíz y las demás compuertas pasan desde una copia limpia, y el ensayo de migraciones está endurecido y probado como aislado. Esto **no** es una autorización de liberación: sigue pendiente el ensayo con una copia real (si hay datos), la publicación fijada y anotada, y la validación física. Tarjeta: terminal externa y referencia capturada a mano; sin integración bancaria.
