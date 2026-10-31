# Compras: motor de Control documental — entrega técnica

Fecha de verificación: 2026-10-30. Base local y `origin/main` al iniciar:
`7b5a5a50e504586cf5b10a9b8eb8b04d6d8a521d`. Árbol inicialmente limpio.
Trabajo sobre `main`, sin cambios visuales, push, despliegue, SSH ni conexiones
a bases compartidas. El SHA final se entrega con el commit local, fuera de este
archivo para evitar una referencia circular al propio commit.

## Arquitectura y compatibilidad

Hay un único módulo `runly.purchases`. La modalidad económica es independiente
del preset de flujo: `FINANCIAL` es el valor implícito de toda empresa existente.
`InstanceConfig`, clave `purchases.economicMode.<companyId>`, persiste la elección;
la actualización de modalidad y workflow comparte transacción y auditoría.

`DOCUMENTARY` aplica el perfil acotado Control documental: órdenes, facturas y
relaciones con Inventario; sin solicitudes, cotizaciones, aprobaciones,
recepciones formales, pagos ni políticas. Las etapas son opcionales. No se
reinterpretan los documentos previos al cambiar esta configuración.

Decisión conservadora: tabla complementaria `purchase_documentary_reference`
para modalidad de creación, referencia externa, descripción e idempotencia,
y ampliación de nulabilidad de columnas **ya existentes** de OC, factura y
partidas. No se añadieron columnas escalares a esos modelos. Cambiar un campo
Prisma de obligatorio a opcional conserva la lista de columnas de SELECT; el
cliente nuevo lee la base antigua sin necesitar columnas nuevas. Una sonda
`to_regclass`, fuera de transacciones financieras, anuncia la disponibilidad.
Sin migración, activar o crear referencias responde `409 DOCUMENTARY_UNAVAILABLE`;
las operaciones financieras siguen funcionando. Una respuesta negativa se
revisa después de un segundo; una positiva se conserva durante 60 segundos.

La base guarda `NULL` auténticos en subtotal, impuesto, total y pagado
documentales, así como en la fecha de emisión desconocida. No hay ceros técnicos
ni fechas de relleno. Los defaults financieros existentes se conservan; solo
la creación documental, habilitada tras migrar, inserta NULL explícitamente.
Las partidas documentales admiten cantidad desconocida y tienen importes y
tasas NULL. No se calcula una cantidad pendiente para ellas.

Los CHECK de OC/factura reservan `total IS NULL` para registros documentales
`REGISTERED | CANCELLED`, con el resto de importes NULL; los financieros siguen
exigiendo datos económicos y fecha de emisión. Un trigger prohíbe cambiar entre
total conocido y desconocido: esa señal de modalidad es inmutable, incluso por
SQL. El identificador y consecutivo internos siguen sujetos a las restricciones
anteriores. La referencia externa no es única: dos proveedores o referencias
sin proveedor pueden compartir el mismo texto.

Los registros documentales no ingresan a los estados de deuda `PENDING`,
`PARTIALLY_PAID` o `PAID`. No admiten pagos, recepción desde líneas ni transiciones
financieras, aun después de volver a FINANCIAL. La conversión formal queda
bloqueada y fuera de alcance. Los expedientes internos permanecen abiertos;
no se cierran automáticamente para simular que el documento está completo.

## Contratos HTTP y SDK

### Configuración

`GET /purchases/settings`, permiso `purchases.settings.read`, añade:

```json
{
  "data": {
    "economicMode": "FINANCIAL",
    "economicCaptureEnabled": true,
    "documentaryAvailable": true,
    "profiles": {
      "DOCUMENTARY": {
        "label": "Control documental",
        "preset": "BASIC",
        "economicMode": "DOCUMENTARY"
      }
    }
  }
}
```

El perfil real incluye también capabilities, stages y policies. El workflow y
`GET /purchases/capabilities` devuelven modalidad y captura económica explícitas.
`PUT /purchases/settings`, permiso `purchases.settings.manage`:

```json
{ "profile": "DOCUMENTARY" }
```

También acepta `{ "economicMode": "DOCUMENTARY" }`. En este alcance esa modalidad
siempre impone las capacidades documentales; no acepta activar pagos enviando
una combinación CUSTOM. Para volver al perfil financiero habitual:

```json
{ "economicMode": "FINANCIAL", "preset": "BASIC" }
```

SIMPLE, BASIC, INVENTORY, COMPLETE y CUSTOM conservan sus contratos financieros.

### Crear un documento mínimo

`POST /purchases/orders` o `/purchases/invoices`; permisos de creación existentes:

```json
{ "reference": "OC-2485" }
```

Fragmento de respuesta:

```json
{
  "data": {
    "number": "OC-2026-0001",
    "reference": "OC-2485",
    "economicMode": "DOCUMENTARY",
    "economicCaptureEnabled": false,
    "status": "REGISTERED",
    "statusLabel": "Referencia registrada",
    "supplierId": null,
    "issueDate": null,
    "subtotal": null,
    "tax": null,
    "total": null,
    "paidAmount": null,
    "balance": null,
    "currency": null,
    "dueDate": null,
    "conversionAllowed": false,
    "historicalDataPreserved": true
  }
}
```

El número mostrado es ilustrativo; se genera según la numeración de la empresa.
`id`, `caseId`, `sequence`, `createdAt` y `updatedAt` siguen siendo metadatos del
sistema. `createdAt` nunca sustituye a `issueDate`.

Opcionales: supplierId, issueDate, expectedDate (OC), fiscalUuid (factura), notes,
description, lines, orderIds (máximo una OC por factura), inventoryIds e
inheritItems. Una partida solo admite description, quantity, unit, itemKind y
categoryId. `number` es interno; no se usa como caja de referencia documental.
Se rechazan campos económicos, monedas, vencimiento financiero, pagos y
sobrescrituras de modalidad con `422 DOCUMENTARY_FIELD_NOT_ALLOWED`.

### Creación rápida desde Inventarios

`POST /purchases/{orders|invoices}/references` usa la misma creación transaccional:

```json
{
  "reference": "FAC-1234",
  "idempotencyKey": "inventory-reference-operation-001",
  "inventoryIds": ["019a0000-0000-7000-8000-000000000001"]
}
```

La clave es obligatoria en este endpoint, es de ámbito empresa y se conserva
durante la vida del registro. La misma clave y cuerpo devuelven el mismo id
(`data.replayed: true`); reutilizarla con otro cuerpo o tipo produce
`409 IDEMPOTENCY_KEY_REUSED`. El cliente debe conservar la clave al reintentar.
El hash normaliza el orden de claves JSON; el orden de las listas forma parte
del cuerpo. Tanto la primera creación como el replay responden 201.

Permisos: crear y leer el tipo de documento; para inventoryIds, además
`purchases.relation.manage` e `inventory.item.read`. El servidor valida empresa,
activos habilitados y acceso de escritura al área de cada activo, también al
reintentar. Se permiten varios activos, pero ninguna relación es obligatoria.
Conflictos de vínculo revierten documento, expediente, referencia, relaciones
y auditoría de la operación. No hay documentos huérfanos por compensar.

La respuesta añade `duplicateCandidates: [{ id, reference, economicMode }]` y
`automaticMerge: false`. Son sugerencias por coincidencia parcial del texto,
no OCR, comparación fiscal ni búsqueda difusa avanzada. Nunca fusiona registros.

Para reutilizar un registro, buscar primero con
`GET /purchases/documents/search?type=order&search=OC-2485`, respetando los
permisos de búsqueda existentes; relacionarlo con los endpoints de relaciones
actuales. Las listas y el buscador global también encuentran la referencia.
SDK nuevo: `client.purchases.createReference(kind, body, token)`; se reutilizan
`searchDocuments`, `createRelation` y `bulkRelate` existentes.

### Completar y corregir

`POST /purchases/invoices/:id/corrections`, permiso `purchases.invoice.correct`
(para OC, `purchases.order.correct`):

```json
{
  "expectedVersion": 1,
  "reason": "Se recibió información del documento original",
  "changes": {
    "reference": "Factura F-008721",
    "supplierId": "019a0000-0000-7000-8000-000000000002",
    "issueDate": "2026-10-12",
    "description": "Adaptadores de red",
    "notes": "Documento asociado posteriormente"
  }
}
```

Requiere motivo y `expectedVersion` o `expectedUpdatedAt`. Bloquea la fila,
comprueba concurrencia, actualiza datos y metadata, incrementa versión, inserta
revisión inmutable y auditoría en una transacción. Devuelve el contrato anterior
`{ data: { document, version, revision } }`. Un conflicto produce
`409 STALE_DOCUMENT`; no reintentar automáticamente. El PATCH de borradores
contesta `DOCUMENTARY_CORRECTION_REQUIRED` para documentos documentales.

Campos documentales corregibles: referencia, descripción, proveedor, emisión,
notas, expectedDate (OC) y fiscalUuid (factura). Cancelados: solamente notas.
No se afirma validación fiscal por capturar un UUID o una referencia. Las
restricciones financieras de corrección de fases 1–4 permanecen intactas.
Las partidas se capturan opcionalmente al crear; esta entrega no incorpora
edición posterior de partidas de referencias registradas.

`GET` detalle añade `companyEconomicMode`, `economicMode`,
`economicCaptureEnabled`, `editableFields`, `unknownFields`, `allowedActions`,
`historicalDataPreserved` y `conversionAllowed`. `allowedActions` describe
posibilidades de negocio; la UI las cruza con permisos y capabilityEnabled.
Las acciones se autorizan nuevamente en servidor. El detalle devuelve relaciones,
órdenes/facturas asociadas y líneas sin importes. No exige OC para factura ni
factura para OC. Las reglas de una factura por activo, una OC por activo y una
OC por factura conservan bloqueos, herencia, propagación y vínculos cancelados
como historia. La vinculación concurrente de factura a dos OC produce un único
ganador. Las cancelaciones requieren motivo y preservan relaciones.

## Integraciones e Inventarios

- Listas, relaciones hidratadas, expediente, revisiones, proveedor, dashboard,
  MirAI, búsquedas globales, tarjetas de chat y exportación de la OC conservan
  NULL económicos. El dashboard declara `economicAggregatesInclude:
  FINANCIAL_ONLY`; las estadísticas de gasto excluyen documentos con total NULL.
  Los movimientos históricos de pagos no se reescriben.
- Eventos de documentos incorporan `economicMode`; las correcciones documentales
  llevan total NULL. El catálogo de eventos documenta esta modalidad. No se emite
  un evento de factura pagada por registrar una referencia.
- El MCP conserva sus herramientas. Sus lecturas reutilizan las proyecciones;
  la importación financiera se deshabilita en DOCUMENTARY, también entre prepare
  y execute para evitar escrituras de proveedores antes de rechazarla.
- Inventarios proyecta purchasePrice NULL y añade `purchaseEconomicContext` con
  modalidad, exposición económica desactivada, preservación histórica y archivos
  originales sin cambios. Se aplica a listas, detalle y respuestas de escritura.
  El dashboard de Inventarios devuelve purchaseValue y pricedCount NULL.
  Los enlaces del detalle incluyen reference además del número interno. Las
  columnas del listado añaden purchaseOrderReference y purchaseInvoiceReference
  sin reemplazar los campos históricos purchaseOrderNumber/purchaseInvoiceNumber.
- Los campos personalizados de tipo currency/money, marcados con
  `options.economic: true` o con clave/etiqueta de precio, importe, monto, costo,
  impuesto o saldo se suprimen en la vista operativa y catálogo de exportación.
  Los numéricos ordinarios (capacidad, potencia y cantidades) permanecen visibles;
  `numericCustomFieldsSuppressed` es false. Los identificadores económicos se
  reconocen por palabras completas, incluidos snake_case y camelCase. Un campo textual ambiguo debe identificarse
  con options.economic; no es posible inferir el significado de cualquier texto.
  Las sugerencias de valores tampoco devuelven los importes suprimidos.
- CSV/XLSX de Inventarios excluyen columnas económicas; pedirlas expresamente
  produce 422. El resumen de compras del activo suprime importes de asignaciones
  y documentos relacionados en modalidad de empresa documental. Un documento
  financiero histórico sigue consultable por su endpoint con permisos propios.
- No se altera precio heredado, campos migrados, SINABE, archivos ni auditoría
  en almacenamiento. Las proyecciones no anonimizan texto libre ni el contenido
  de PDF/imágenes/documentos originales.

## Migración y operación

`prisma/migrations/20261216120000_purchase_documentary/migration.sql`:
nulabilidad expansiva, tabla complementaria, índices, CHECK de forma económica,
trigger de modalidad inmutable, RLS y revocación de acceso PUBLIC/anon/authenticated.
La transacción publica la disponibilidad solo después de completar la migración.
El backend usa el propietario de tablas o un rol de servidor autorizado; no se
exponen estos metadatos directamente a los roles del Data API.

`scripts/purchases/documentary-rollback.sql` revierte antes de usar la función.
Si hay configuración o documentos documentales, aborta sin borrar datos. No se
rellenan NULL con ceros/fechas para hacer posible un rollback. Tras crear datos
documentales, la versión anterior de Prisma con campos no anulables ya no es
una versión segura de rollback del código.

Requisito de integración: distribuir el cliente Prisma regenerado a los procesos
que lean estas tablas y aplicar la migración antes de activar el perfil. El
backend nuevo puede instalarse antes de migrar; no debe activarse DOCUMENTARY
con procesos antiguos que interpreten importes y fechas como obligatorios.
No se ejecutó esta migración en ninguna instalación compartida o real.

## Matriz de aceptación ejecutada

Suite `purchase-documentary.integration.test.js`, PostgreSQL 18 desechable,
Prisma 7.8 y rutas Hono reales con middleware de permisos controlado por pruebas.
Se genera el esquema, se simula la nulabilidad antigua, se crean datos financieros,
se aplica la migración, se revierte antes de uso y se aplica de nuevo. No se usó
un stack Supabase completo ni se ejecutaron pruebas visuales: no cambió la UI.

| Caso pedido | Resultado | Evidencia |
|---|---|---|
| 1 OC solo referencia | PASA | prueba 01 |
| 2 Factura solo referencia | PASA | 02 |
| 3 Sin proveedor/fecha/partidas/importes/archivos | PASA | 03 |
| 4 Lectura sin cero ni fecha inventada | PASA | 04 |
| 5 Inventario solo con OC | PASA | 05 |
| 6 Inventario solo con factura | PASA | 06 |
| 7 Varios inventarios por OC | PASA | 07 |
| 8 Asociar OC y factura posteriormente | PASA | 08 |
| 9 Historia de cancelados | PASA | 09 |
| 10 Reintentos sin duplicados | PASA | 10 y 25 |
| 11 Completar proveedor y fecha | PASA | 11 |
| 12 Corregir referencia con revisión y motivo | PASA | 12 |
| 13 Conflicto entre sesiones | PASA | 13 |
| 14 Permisos de lectura/creación/corrección/relaciones | PASA | 14 y 27 |
| 15 Importes enviados directamente a API | PASA | 15 |
| 16 Bloquear pagos documentales | PASA | 16 |
| 17 Aislamiento de empresa | PASA | 17 |
| 18 Búsquedas/proyecciones/integraciones sin importes falsos | PASA | 18 y 29 |
| 19 Perfiles financieros conservados | PASA | 19: SIMPLE/BASIC/INVENTORY/COMPLETE/CUSTOM |
| 20 Pago/reverso/recepción/corrección/aprobación financieros | PASA | 20 y suites fases 3–4 |
| 21 Historia antes/después de migrar | PASA | hook inicial y 21; comparación del registro financiero |
| 22 Base migrada/no migrada | PASA | hook inicial y 22; rollback previo al uso |
| 23 Cambiar modalidad sin reinterpretar | PASA | 23 y 30 |
| 24 Inventario y compras heredadas sin borrado | PASA | 24: lectura, lista, CSV y almacenamiento |

Adicionales: partidas desconocidas y descripción corregible (26); cardinalidad
concurrente (28); sugerencias sin fusión (31); rechazo de rollback destructivo
(32); roles anon/authenticated sin acceso incluso con default grants (33);
una referencia documental no satisface una etapa financiera en un expediente
mixto (34).

## Verificación y límites de integración

- Documental: **34 aprobadas, 0 fallidas** en PostgreSQL desechable.
- Compras, Inventarios-compras y MirAI: **93 aprobadas, 0 fallidas**;
  suites de integración omitidas en esa invocación y ejecutadas por separado.
- Verificación final ampliada de Inventarios + Compras + MirAI:
  **380 aprobadas, 0 fallidas** (incluye las 93 anteriores; no sumar dos veces).
- Correcciones/reversos fase 4: **9 aprobadas, 0 fallidas** en PostgreSQL desechable.
- Pagos fase 3: **11 aprobadas, 0 fallidas** en PostgreSQL desechable.
- API completa: **3325 pruebas: 3314 aprobadas, 7 fallidas, 4 omitidas**.
  Los mismos siete fallos se reprodujeron con una copia de las fuentes iniciales
  de HEAD y las dependencias instaladas, sin sustituir los archivos de trabajo:
  module-runtime-routes (2), public-website-capture-config (1), análisis de
  transcripciones (1), disponibilidad de propuestas de contactos (2), catálogo
  de versiones runtime frente a node_modules (1). No se corrigieron aquí.
- ESLint de todos los JavaScript cambiados: correcto. Prisma Client regenerado.
- `pnpm check:privacy`: **67 hallazgos preexistentes**. Comparación con HEAD:
  los mismos 67; **0 en archivos de esta entrega**. La comprobación global sigue
  roja; no se presenta como aprobada ni se modifica su allowlist.
- Las pruebas no demuestran una instalación real de Supabase, carga productiva,
  el contenido de PDFs ni la futura interfaz. No se hicieron escrituras en bases
  reales. La privacidad global y las siete pruebas preexistentes deben resolverse
  o aceptarse por su propio proceso antes de declarar todo el repositorio verde.

## Handoff de UI documental

La tarea pendiente es exclusivamente conectar la experiencia visual B1–B4 a
estos contratos, sin otra decisión de arquitectura:

1. Configuración: mostrar Control documental a partir de profiles y
   documentaryAvailable; enviar profile. Conservar los selectores financieros.
2. Captura: una sola caja obligatoria reference; esconder captura económica y
   deuda según economicCaptureEnabled. Proveedor, emisión, descripción, notas,
   partidas y adjuntos opcionales. Diferenciar folio interno y referencia.
3. Detalle: usar economicMode **del documento**, no inferirlo del modo actual de
   la empresa. Desconocido = sin capturar; no convertir NULL a cero ni usar la
   creación como emisión. REGISTERED = referencia registrada, no CFDI validado.
4. Correcciones: generar los campos desde correction/ editableFields, conservar
   reason y expectedVersion; manejar STALE_DOCUMENT mostrando recarga y texto
   capturado. No editar importes históricos ni convertir modalidad.
5. Inventarios: buscar/reutilizar primero; crear con createReference y una clave
   estable por intento. Mostrar duplicateCandidates sin fusionar. No exigir
   factura para vincular OC, ni OC para factura. Mantener vista previa al quitar
   relaciones y preservar cancelados como historia.
6. Aplicar purchaseEconomicContext en Inventarios y sus exportaciones. Conservar
   los campos numéricos técnicos y suprimir solo los económicos; clasificar
   campos textuales heredados de significado económico antes de mostrarlos.
7. Usar los adjuntos existentes dentro del módulo. La presencia de una referencia
   no asegura un archivo ni validación fiscal. El archivo original puede contener
   importes; nunca afirmar que el modo documental los elimina del PDF.
8. Aplicar permisos y capabilityEnabled además de allowedActions. No crear un
   flujo de pagos, validaciones fiscales, recepciones o aprobaciones documentales.

Archivos principales: `purchase-economic-mode.js`, `purchase-documents-service.js`,
`purchase-corrections-service.js`, `purchases-service.js`, servicios de relaciones,
listados/pagos/expediente, `inventory-economic-projection.js`, Inventarios y
exportaciones, consumidores MirAI/MCP/búsqueda/chat, catálogo de eventos,
SDK y el esquema/migración. No se modificaron componentes React, estilos,
navegación, formularios ni fuentes en `modules/custom`.
