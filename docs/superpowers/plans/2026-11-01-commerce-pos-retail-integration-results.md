# Runly Commerce Recovery — cierre de integración POS Tienda

Fecha: 2026-11-01. Alcance: integración de fase 3, sobre los contratos C0–C5, C7 y C8 aprobados. No se inició fase 4.

## Repositorio y alcance

El frontend `4a5945752` y el cierre técnico `ad7c30a69` estaban presentes al comenzar, con árbol limpio. Se conservaron sus cambios, el diseño de Claude y los datos históricos. Se trabajó directamente en `main`, exclusivamente local, sin SSH, push, despliegue ni acceso a datos empresariales reales.

Commit de correcciones y regresiones: **`cdd4553e9`**. El commit documental de cierre es el que incorpora este informe, consultable con `git log -1 --format=%h -- docs/superpowers/plans/2026-11-01-commerce-pos-retail-integration-results.md`.

Durante la validación otra sesión confirmó Transcriber y su esquema en `ba97e702e` y las mejoras de llamadas en `4a26e1830`. Esos archivos no forman parte de la entrega POS y no se sobrescribieron ni incluyeron en su commit. El conjunto POS queda confirmado. El árbol global sigue activo: la comprobación de cierre detectó trabajo ajeno nuevo en `packages/sdk/src/domains/calls.js` y `apps/desktop/src/modules/runly.chat/hooks/useTranscriptionVocabulary.js`; se preserva y no se declara el repositorio global limpio.

Este cierre no modifica servicios financieros, migraciones ni contratos HTTP/SDK. Agrega recuperación en el consumidor real, protege la entrada heredada y añade pruebas del servidor existente. No agrega endpoints simulados, colas de venta sin conexión ni un motor financiero en React.

## Hallazgos y correcciones

| Hallazgo | Severidad | Resultado |
|---|---|---|
| Respuesta de creación perdida y navegación a Órdenes/Caja regeneraban la clave y podían abandonar la orden confirmada e iniciar otra | Alto | Corregido. Diario persistente del intento completo crear/agregar, con cuerpos, versión, rutas y claves originales; se recupera la misma orden y línea |
| Cerrar y reabrir Entrada de efectivo después de perder la respuesta regeneraba la clave y duplicaba el movimiento | Alto | Corregido. La misma operación conserva cuerpo y clave entre montajes. Se rechaza editar un intento sin resolver; pulsaciones concurrentes comparten la solicitud |
| `/pos/terminal` montaba el carrito antiguo con escrituras incompatibles | Alto, compatibilidad | Corregido mediante redirección mínima. Las pruebas adversas no demostraron aceptación de precios arbitrarios: el backend ya los rechazaba |
| Un resultado financiero desconocido podía dejar de verse al navegar o cambiar el estado de la sesión | Medio | Recuperación desde Caja con el intento original; bloqueo de cierre/cambio y de nuevas operaciones mientras debe resolverse. Incluye cierre ya registrado cuya sesión abierta dejó de existir |
| Estado transitorio de pantallas podía sobrevivir al cambio de empresa | Medio, preventivo | Caja y Órdenes se montan por usuario/empresa; consultas y diarios quedan delimitados. Una cadena de orden comprueba la empresa antes de cada envío |
| Cobrar queda dentro del carrito colapsado en teléfono | Medio, usabilidad | Registrado para Claude; hay acceso operativo al expandir. No se rehízo el diseño |

El diario usa almacenamiento local separado por usuario, empresa y recurso, y relaciona los intentos con sesión/terminal. Persiste antes de enviar, conserva los resultados desconocidos y permite sólo reintentos explícitos de la intención original. No guarda tokens ni decide precios, impuestos, cambio, saldo o existencias. Si no puede conservar el intento, no despacha la escritura. Ante permisos revocados después de una respuesta desconocida mantiene el intento para recuperación autorizada, sin inventar un resultado ni crear otra clave.

La recuperación no sustituye el control transaccional del servidor ni permite vender sin conexión. Borrar el almacenamiento del navegador elimina esta ayuda local: antes de repetir una intención hay que consultar Órdenes y la sesión originales. Los registros financieros persistidos siguen siendo la autoridad.

## D37, D38 y D39

| Discrepancia | Validación y estado |
|---|---|
| D37 — operador | Resuelta la comprobación de identidad: con dos usuarios reales del fixture, la barra mostró al operador actual, el pago guardó su `createdById` y la sesión conservó al usuario original en `openedById`. No se atribuye el pago a quien abrió. Mostrar el nombre del abridor sin otra consulta es mejora contractual baja, no bloqueo |
| D38 — devolución desde Órdenes | Validada con UI/API/SQL: otra sucursal bloquea; otra caja autorizada de la misma sucursal recibe la devolución en su propia sesión abierta; caja cerrada bloquea. Empresa y permisos siguen comprobados por el servidor. No se relajó ninguna validación |
| D39 — impresoras | C7 distingue comprobante generado, intento enviado y resultado físico. El navegador registró `SUBMITTED` con `confirmedPrintCount=0`, sin afirmar «Impreso». Fallo/reimpresión no genera otra venta. Selección persistente de impresora Bluetooth y certificación física: diferidas por hardware |

Procedimiento D38: salir del diálogo bloqueado → entrar en Caja → elegir la sucursal original y una terminal autorizada → abrir su sesión → volver a Órdenes y preparar la devolución con vista previa del servidor. No es necesario ni válido registrar dinero en una caja de otra sucursal. La devolución validada por $50 quedó asociada a la sesión de Caja 2, al movimiento `REFUND_OUT` de esa sesión y al actor autenticado.

## Entradas heredadas y compatibilidad

- `/pos` mantiene su entrada actual a Caja.
- `/pos/terminal` redirige con reemplazo a `/pos/caja`; un `?order=<UUID>` válido abre `/pos/orders?order=<UUID>` y consulta el detalle autorizado real. Un identificador inválido no provoca escrituras.
- El detalle histórico sigue consultable. Cancelar/devolver desde el consumidor Tienda exige experiencia `RETAIL`; no introduce operaciones de Restaurante sobre enlaces históricos.
- `/pos/caja/historial` conserva el historial de sesiones. Administración, mesas, pedidos y cocina mantienen sus rutas y código; Restaurante sigue pendiente de fase 4.
- No se borró `PosTerminalScreen`, módulos, órdenes, sesiones, productos, pagos ni recibos históricos.

El nuevo test PostgreSQL llama también a las rutas antiguas de API: precio extra → 400; intento de fijar `PAID` con PATCH → 409; restaurante en sucursal retail → 409; sesión ajena → 404; lector sin permiso de cobro → 403; reimpresión antigua incompatible → 409. Terminal deshabilitada con sesión todavía abierta: captura moderna y antigua rechazadas. Después hay cero pagos, orden OPEN y existencias intactas.

## Contratos disponibles para Claude

| Contrato | Consumo comprobado |
|---|---|
| C0 | Contexto de empresa/sucursal/terminal, capacidades, sesión actual y selección explícita; terminal revocada no se sustituye silenciosamente |
| C1 | Oferta comercial real, búsqueda por nombre/SKU, código de barras y variantes; disponibilidad comercial y existencias del servidor |
| C2 | Crear/consultar/versionar orden y líneas; persistencia y recuperación de la misma intención; lectura histórica y detalle por enlace |
| C3 | Pago aplicado, efectivo recibido y cambio separados; reintento con la misma clave; sin precio arbitrario en el cuerpo |
| C4 | Cancelación protegida con pagos, devolución auditada y vista previa; sesión autorizada de la sucursal original |
| C5 | Libro comercial, salida al vender y reposición por devolución exactamente una vez; sin cálculo autoritativo local |
| C7 | Snapshot de comprobante, copias e intentos de impresión con estados honestos |
| C8 | Apertura, movimientos, conteo ciego, diferencia y cierre del servidor; recuperación de intentos sin confirmar |

Se mantienen las firmas de SDK y las pruebas anteriores. No se concede administración a Caja y no se agrega capacidad contractual de Restaurante/Cocina.

## Evidencia ejecutada

Las pruebas de navegador usan el stack local desechable existente: PostgreSQL/Supabase, migraciones, autenticación real de usuarios sintéticos, roles, API HTTP y web compilada desde el árbol. La pérdida de respuesta se introduce después de ejecutar la solicitud real; no se sustituye el servicio por un endpoint falso.

| Verificación | Resultado |
|---|---|
| `.e2e/pos-retail-ui.mjs` | **83/83**, recorrido original conservado; venta, escaneo, variantes, cambio, pagos, devolución, cancelación, caja, permisos, empresa, terminal revocada y estados. Claro/oscuro a 390/768/1024/1440 px; contraste y sin desbordamiento; Cobrar visible en 1024/1440 |
| Prueba dirigida de pérdida de respuesta/navegación | **23/23**. Antes de corregir: **19/21**, con orden adicional y dos entradas de efectivo. Después: una orden recuperada, una entrada, cierre bloqueado aun con carrito vacío y cierre perdido recuperado sin abrir otra sesión |
| Contexto D37/D38, enlaces heredados y teléfono | **27/27**, con dos operadores, devolución a otra caja de la misma sucursal, bloqueos por sucursal/cierre y acceso al cobro expandiendo el carrito del teléfono |
| Prueba directa SQL de la venta UI | **21/21**: orden, línea/producto/cantidad/precio/total, aplicado/recibido/cambio, una captura, una salida de dos unidades, sesión original y un comprobante |
| `node scripts/test-commerce-postgres.mjs` | **172/172**, 30 suites, cero fallos/skips. Incluye migraciones/RLS/históricos, transacciones, concurrencia por última unidad, replay de pagos/devoluciones, rollback, aislamiento y rechazo de escrituras antiguas/revocadas |
| Unitarias POS/Catálogo/SDK/`@runly/ui` y brandTheme | **293/293**, 21 suites, cero fallos/skips; incluye cinco pruebas nuevas de recuperación durable |
| Galería `.e2e/commerce-gallery-phase3.mjs` | **17/17**; carga múltiple, portada, reordenación/persistencia, controles 44×44 y regresión del SortableList vertical |
| Build web de los stacks y ESLint de retail/ModuleOutlet | Correctos |
| React Doctor | **88/100**, sin errores; quedan advertencias sobre estructura/estado de componentes y refs de impresión, sin refactor visual fuera del alcance |
| UUID policy | Correcto |
| RBAC | 349 permisos, cero faltantes/sobrantes |
| `git diff --check` del conjunto POS | Correcto |
| Privacidad global | Exit 1: los mismos **67 hallazgos preexistentes**. Los 16 archivos de implementación propios pasan individualmente con cero hallazgos; informe revisado aparte |
| Company-scope global | Exit 1: once archivos preexistentes fuera de POS, sin cambios de esta entrega. No se presenta como control global aprobado |

Las copias dirigidas `.e2e/pos-retail-integrity-targeted.mjs`, `.e2e/pos-retail-context-validation.mjs` y `.e2e/pos-retail-sql-proof.mjs` son procedimientos locales ignorados; las regresiones unitarias y PostgreSQL sí quedan versionadas. Las pasadas intermedias con selectores ambiguos, temporización del cambio de viewport o una referencia incorrecta al producto del fixture SQL no se contabilizan como aprobadas; se corrigió el procedimiento y se repitió contra el servicio real.

Aceptación financiera central: deuda **$100**, aplicado **$100**, recibido **$200**, cambio **$100**. La venta UI persiste una orden pagada, una línea de dos unidades al precio comercial $50, un pago, una salida comercial de dos unidades, su sesión y un comprobante; sin duplicados. La devolución recupera una unidad una sola vez. Los cobros repetidos y la competencia por existencias se contrastan además con transacciones PostgreSQL reales, no sólo con un modelo en memoria.

## Pendientes concretos y veredicto

**APTO para POS Tienda en el alcance técnico local validado**, sin defectos críticos o altos pendientes de esta integración. Esto no certifica una publicación: siguen pendientes los controles globales preexistentes y las validaciones físicas.

Para Claude: en `retail/RetailCajaScreen.jsx`, hacer explícita la acción del handle de PeekSheet en teléfono, por ejemplo «Ver carrito y cobrar», manteniendo cantidad/total y acceso por teclado. El estado colapsado hoy muestra cantidad, total y chevrón; el cobro funciona al expandir, pero la intención no es evidente. Severidad media de usabilidad; no bloquea el recorrido disponible. Conservar visibles total/Cobrar en tablet horizontal y escritorio; no agregar un segundo motor o diálogo de cobro.

D37: nombre del abridor en el contexto, si se desea mostrarlo, es una mejora baja y separada de la identidad actual y del actor financiero. D39: persistir impresora Bluetooth por contexto/dispositivo cuando exista selección soportada, sin convertir `SUBMITTED` en confirmación física.

Antes de certificar hardware: probar impresora real (desconexión, reconexión, permisos, papel, caracteres y copia), confirmar qué transporte puede demostrar salida física y verificar el dispositivo táctil real y sus objetivos. El envío al diálogo de impresión del navegador no demuestra papel. No se probaron impresora física, Bluetooth físico, terminal bancaria ni dispositivo táctil real; no se simularon esos resultados.

**Puede iniciarse la fase 4 técnica de POS Restaurante mediante una autorización posterior**, conservando estos contratos y los datos históricos. Este cierre no la inicia y no agrega mesas, cuentas de restaurante, estaciones ni cocina.
