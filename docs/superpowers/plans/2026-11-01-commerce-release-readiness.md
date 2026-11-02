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

**Las 11 pruebas globales que fallan**, todas fuera de Commerce (no se ejecutaron en la base anterior; la atribución se hizo por área y por archivos tocados, no por una corrida comparativa):

| Área | Prueba | Causa observada |
|---|---|---|
| Runtime de módulos | 2 pruebas en `module-runtime-routes.test.js` y 1 en `contacts-proposal-module.test.js` | Dobles de Prisma sin `companyModule.findMany` / `runlyModule.findMany` |
| Transcripciones | `call-transcript-analysis-service` | No encuentra el cubo `runly.contacts`; el archivo cambió en los commits de transcripciones |
| Sitio web | `public-website-capture-config` | Configuración de captura pública |
| Catálogo de bibliotecas | `module-runtime-catalog` | Versiones instaladas en este equipo (19.3.0, 5.104.2, 1.56.0) distintas de las del catálogo generado (19.3.1, 5.104.4, 1.59.0): entorno local |
| Instalador | `installer-devkit-snapshot`, `runly-env-config` | Snapshot de exportaciones de `@runly/ui` desactualizado desde antes; dependencia del instalador |
| Studio (navegador) | 2 pruebas de `navigation-guard-browser` y `studio-branding-browser` | Pruebas de navegador de Studio |

Divulgación: una primera corrida global se lanzó por error con el entorno normal del shell; el shell no tenía variables de bases y la única prueba que usaría una base viva exige `RUN_CROSS_TENANT_TESTS=1` (omitida). La detuve a los pocos segundos y la repetí con el entorno vacío (`env -i`). No se tocó ninguna base real.

**Limitaciones.** Las 11 fallas deben revisarse antes de cualquier publicación general de otras líneas de trabajo; no bloquean el piloto de Commerce porque no ejercen ninguna ruta de Commerce, pero **no las he demostrado preexistentes ejecutándolas en la base anterior**. No se ejecutó prueba alguna contra un servicio externo.

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
4. Publicar con el flujo habitual (`pnpm docker:release`; **no** se hizo aquí).
5. Primera instalación **sin migrar al arrancar**: `docker-compose.no-db-init.yml` junto al compose normal (`RUNLY_SKIP_DB_INIT=1`). Si usas `update-local.sh`, hazlo así para la primera vez; recuerda que ese script descarga el instalador de la rama `main` del repositorio remoto.
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
