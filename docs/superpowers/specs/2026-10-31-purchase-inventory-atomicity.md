# Revisión puntual de bienes físicos, Inventarios y Compras

SHA inicial: `c72bc35e63a2012770d6f607343e521166868d0f`.

## Lo que ya funcionaba

`InvItem` es el registro maestro del bien identificable. Las partidas y
asignaciones de Compras son documentos y vínculos hacia ese registro; no son
una segunda ficha de activo. Los tipos son un catálogo general: no se restringen
a equipos de TI y permiten muebles, gabinetes, racks y otros bienes.

| Dato | Función existente |
|---|---|
| `id` | Identidad interna UUID del registro |
| `folio` | Identificador generado por Runly con consecutivo por empresa y prefijo |
| `assetTag` | Número de activo opcional, capturado por el usuario; no se genera como sustituto del folio |
| `serialNumber` | Serie opcional del fabricante; no es la única identidad del bien |
| Tipo y modelo | Clasificación del bien y catálogo reutilizable, no otra unidad física |
| Ubicación y responsable | Ubicación y asignación del mismo `InvItem` |
| Estado operativo y administrativo | Disponibilidad/asignación y ciclo administrativo de Inventarios |

Los buscadores y las relaciones existentes permiten asociar un bien a una OC
o factura sin darlo de alta otra vez. Se conservan una OC vigente y una factura
vigente por bien, varios bienes por documento y la historia de cancelados.

## Defecto corregido

El puente creaba y confirmaba los bienes antes de abrir la transacción de
relaciones y asignaciones. Un error posterior podía dejar altas parciales.

Ahora las validaciones, folios, altas, auditorías, eventos pendientes, relaciones
y asignaciones financieras se realizan con el mismo cliente transaccional. Se
reutiliza `createItem` mediante un adaptador transaccional; no se replican sus
reglas ni se hacen borrados compensatorios. La actividad y el aviso de Compras
se publican después del commit. Una reversión conserva intactos los registros
previos y también revierte los incrementos del contador de folios de ese lote.

El puente serializa sus operaciones por empresa y bloquea documento y partida
antes de volver a leer capacidad y estado. Esto evita exceder la capacidad de
la partida con peticiones concurrentes y crear dos bienes con la misma serie
en operaciones concurrentes de este flujo.

El cuerpo admite `idempotencyKey` opcional de 8 a 128 caracteres, de ámbito
empresa para esta operación. La clave y la huella de los datos quedan en la
auditoría existente, dentro del mismo commit. Repetir clave y datos devuelve
la misma lista y los mismos IDs, sin nuevas altas ni avisos; reutilizarla con
otros datos devuelve `409 IDEMPOTENCY_KEY_REUSED`. La UI conserva una clave por
intento y genera otra cuando cambia la captura.

Se mantiene el contrato de respuesta y la compatibilidad con clientes antiguos
sin clave. Los integradores que necesiten garantizar reintentos deben enviarla:
dos peticiones sin clave y sin identificadores pueden ser altas legítimas de
dos bienes iguales, y no se fusionan por nombre o modelo.

## Registro frente a recepción

El alta mantiene la disponibilidad operativa inicial `available` de Inventarios;
esa disponibilidad no acredita recepción física. No cambia estado de la OC,
`receivedQuantity`, recepciones ni políticas de cierre. La recepción formal
continúa pasando por su servicio existente. No se añadió un estado de recepción
al activo ni se sustituyó por el estado administrativo.

El diálogo aclara que crea bienes registrados en Inventarios y que esta alta
no registra la recepción física. No cambia el nombre del módulo ni su diseño.

## Matriz ejecutada

PostgreSQL 18 nuevo y desechable, con destino local e identidad verificados
antes de cada suite. No se usó ninguna API o base compartida.

| Caso | Resultado |
|---|---|
| 1. Una OC genera dos bienes individualizados | PASA |
| 2. Mismo modelo, folios e IDs distintos | PASA |
| 3. Alta sin serie | PASA |
| 4. Reutilización del bien existente sin duplicarlo | PASA |
| 5. Error de relaciones revierte altas, folios, auditoría, eventos y asignaciones | PASA |
| 6. Reintentos con clave y concurrencia sin duplicación | PASA |
| 7. Alta sin simular recepción | PASA |
| 8. Costos financieros y recepción formal conservados | PASA |
| 9. Modo documental: vínculos existentes sin importes ni asignaciones falsas | PASA |
| 10. Etiquetas, folios, número de activo e historial de impresión identifican el mismo registro | PASA |

La suite nueva tiene 15 pruebas: incluye fallos después de escrituras reales
en el segundo bien, relaciones, asignaciones y auditoría, además de permisos,
empresa, catálogos, factura financiera, series duplicadas y compatibilidad del
contrato anterior. Regresiones: 34 documentales, 11 de pagos, 9 de correcciones
y 547 unitarias relevantes aprobadas. La prueba de navegador del diálogo
comprueba la conservación de la clave al fallar la red y refrescar el padre.
ESLint pasa. React Doctor no reporta errores; conserva dos avisos de `await`
en bucles que mantienen la secuencia de auditoría transaccional y publicación.

## Decisiones de alcance

No se crean módulos, tablas maestras, migraciones, estados de recepción,
contabilidad de activos, almacenes por cantidad ni duplicados de Flotilla.
No se modifican valores de bienes existentes, el modo documental aprobado,
el renderizado QR ni las etiquetas. Los QR y el historial de impresión siguen
usando los mecanismos de identificación ya establecidos.

La garantía de reintento corresponde a una misma clave de operación. No se
presupone que dos bienes con igual nombre/modelo sean el mismo objeto físico.
No se realizaron push, SSH, despliegues ni migraciones en bases reales.
