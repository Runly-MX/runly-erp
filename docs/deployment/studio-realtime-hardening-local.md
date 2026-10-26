# Studio: integridad realtime, historial y snapping — validación local

Fecha: 2026-10-26. Trabajo directo en main. RC1 `32fe936c` permanece intacta.
No hubo SSH, VPS, publicaciones, despliegues ni escrituras en una base compartida.
Toda prueba SQL usa PostgreSQL/Supabase Docker desechables, identidades sintéticas
y volúmenes propios, eliminados por el runner al terminar.

## Resultado de la revisión

El modelo de `2e428110` tenía sincronización por operaciones funcional, pero no
deduplicaba en SQL, compactaba secuencias que no eran equivalentes y reintentaba
mezclando un lote incierto con cambios nuevos. Un upsert completo perdía cambios
independientes sobre el mismo objeto; undo también podía sobrescribirlos o
recrear una edición borrada remotamente. La actualización mínima de Fabric
comparaba posiciones con un Map obsoleto después de transformaciones y podía
mutar media escena antes de fallar una imagen. MCP no recibía un broadcaster.

Se corrigieron esos puntos manteniendo las operaciones como persistencia principal.
No se añadió un botón de guardado ni se sustituyó el editor por PUT completos.

| Área | Comportamiento final |
| --- | --- |
| Propiedades | `patch` y `patchPage` preservan propiedades independientes; misma propiedad usa LWW según secuencia SQL |
| Objetos | `upsert` conserva su semántica histórica; crear/cambiar tipo. `remove` gana frente a un parche posterior de objeto inexistente |
| Texto/pinturas | Texto completo, pintura, encuadre, geometría y arrays son atómicos. No hay CRDT ni mezcla de caracteres/stops |
| Capas/compactación | Se preservan slots y todas las órdenes intermedias; eliminar/reinsertar no cambia de significado al compactar |
| Idempotencia | Recibo persistente por empresa/actor/diseño/clientId/batchId; mismo contenido devuelve confirmación original, distinto contenido rechaza 409 |
| Autoría | El servidor asigna actorId al eco/ack. Copiar clientId/batchId de otro editor no puede retirar sus pendientes |
| Desconexión | Lote incierto inmutable, bandeja separada, diario en sessionStorage, consulta de recibo antes de reproducir tras refetch |
| Revocación | Autorización actual antes de leer recibos/aplicar; la cola se conserva y se suspende. No se retransmite automáticamente tras 4xx |
| Historial | Inversas condicionadas por propiedad, sin revertir valores posteriores de otro usuario; redo reproduce solo lo efectivamente deshecho |
| Renderer | Recursos preparados antes de mutar, presupuesto agregado, protección de cambios durante I/O, reintento sin dejar escena parcial |
| MCP | SDK/OAuth/aprobación existentes; `changed` se publica después del commit y se reautoriza la difusión |
| Plantillas | Esperan confirmación y capturan ese documento; copia de trabajo y diseño original siguen independientes |
| Snapping | Borde implícito invisible desactivado; centro canónico coincide con la guía sin ocultar/redondear coordenadas |

El contrato detallado y los límites están en
[`studio-editor-ui-contract.md`](../architecture/studio-editor-ui-contract.md).

## Recibos, auditoría y SQL

Se utiliza el diario existente `audit_log`: un evento por lote aceptado, con actor,
revisión, digest y resultado canónico. No se agrupan silenciosamente diez minutos
de escrituras. Las acciones de conceder/revocar acceso y referencias fotográficas
mantienen sus eventos separados. Un duplicado no crea otro evento ni otra revisión.

La migración aditiva `20261206000000_studio_operation_receipts` incorpora un índice
único parcial sobre la identidad del recibo. Se probó en bases aisladas; no se
aplicó a una instalación existente ni se modificó SQL histórico. La consulta GET
de recibos verifica acceso actual al diseño y solo busca los del actor autenticado.
El resultado completo sigue pasando `validateDocument` y autorización de Files.

## Pruebas y reproducción

- `node scripts/verify-studio-local.mjs --tests-only`: **1.379 pruebas,
  1.378 aprobadas, 0 fallos, 1 skip previo**, 148 suites. Studio, operaciones,
  sincronización, historial, SQL real, SDK, Auth/Files y regresión Canvas/Notes/POS
  más los paquetes compartidos del runner.
  Esta ejecución usa el árbol local, incluidos los cambios concurrentes presentes;
  la foto E2E de producto se fija por separado al commit indicado más abajo.
- Seguimiento posterior a la foto E2E: tres pruebas de `draft-storage` aprobadas
  verifican también la guarda de recuperación de objetos eliminados. Si no se
  puede aplicar el parche, no se limpia el snapshot; recuperar una copia válida
  conserva objetos añadidos por otra persona. No se suma esta ejecución solapada
  al total de la suite completa.
- `node scripts/verify-studio-browser.mjs`: Chrome y Fabric reales; v6, fuentes,
  fotos, máscaras, gradientes, grupos, portapapeles, undo y PNG/JPG. Se añade fallo
  remoto de imagen con escena intacta, carga posterior y undo selectivo.
- Snapping: reproducido **539.5 frente a guía 540** con el trazo implícito de 1 px.
  Corregido con `strokeWidth:0` para primitivas sin borde. Casos de página 1080,
  anchuras 300/301, zoom 0.5/1/2, pan y giros 0/30/−20: centro canónico 540 con
  tolerancia 1e−6. La prueba anterior quedó registrada como fallo reproducible.
- En la ejecución de renderer registrada: 500 objetos abren en unos 22 ms,
  PNG en unos 140 ms; 1.000 consultas de snapping con 500 referencias, unos 5 ms.
  Oracle interior de gradientes/miniaturas: error observado 0 por canal, tolerancia 2.
  Son mediciones locales, no garantías universales.
- `node scripts/test-runly-mcp.mjs`: **207 pruebas, 188 aprobadas, 17 fallos
  conocidos y 2 skips**. No se ocultaron fallos ni se modificó su clasificación.
  Sus causas anteriores están en
  [`runly-studio-geometry-local.md`](runly-studio-geometry-local.md).
- ESLint de los archivos propios: aprobado. Build web y comprobación de lazy
  loading: registrados por el runner aislado; Fabric continúa fuera del arranque.
- React Doctor: **79/100, 13 advertencias y 0 errores**. Sus advertencias
  incluyen efectos existentes de caché, código concurrente de otros módulos y
  cargas secuenciales/guardas después de await necesarias para presupuestos y
  sesiones cerradas. No se silenciaron reglas para obtener un score.
- Privacidad global: 65 hallazgos previos. Revisión explícita de archivos propios
  sin hallazgos; no se versionan tokens, direcciones privadas ni logs de producción.

La ejecución E2E definitiva usa:

```sh
node scripts/verify-studio-supabase.mjs --api-image=runly-studio-dev:94e8149b-api --source-ref=94e8149b --operations-only
```

La imagen API se obtiene de `git archive` del commit indicado, se construye con
`buildx --load` y conserva la etiqueta de revisión. No se sobrescriben imágenes
RC1 ni se hace push. El frontend se verifica desde ese commit, aun cuando otra
sesión tenga cambios de UI sin confirmar en el mismo directorio.

**Resultado definitivo: 26 grupos E2E aprobados, 0 fallidos, 0 omitidos.**
Operaciones multiusuario 13, degradados/exportación 4, fotografía 4 y rellenos
fotográficos 5. Cuatro identidades reales (propietario A, editor B, lector C,
usuario D de otra empresa); A/B/C tienen sesiones de navegador independientes.
Los 13 grupos de endurecimiento verifican:

1. Compartición, lectura, canal privado, negativa de D y broadcasts falsificados
   que no llegan a receptores ni cambian SQL. Un ACK de transporte no se interpreta
   como autorización.
2. B edita, A/C reciben; edición concurrente en objetos distintos y Ctrl+Z/Y sin
   revertir el cambio de B.
3. Crear plantilla desde UI espera confirmación y captura su revisión coherente.
4. Guardar la copia de trabajo espera confirmación, conserva su contenido actual
   y mantiene independiente el diseño original.
5. Cola real en sessionStorage tras desconexión/recarga, confirmada una sola vez.
6. Dos POST iguales concurrentes: un cambio, un recibo y una revisión. Reutilizar
   identidad con contenido diferente rechaza 409; el índice SQL está instalado.
7. Otro editor copia clientId/batchId: su actor real impide retirar el pendiente
   del propietario, y sobreviven ambas propiedades autorizadas.
8. Respuesta perdida después de commit real: reintento idéntico y cambios nuevos
   separados; no se repite la revisión.
9. Propiedades independientes del mismo objeto se conservan; misma propiedad y
   texto completo respetan LWW, sin inventar mezcla de caracteres.
10. Mensajes Realtime reales reordenados/duplicados, huecos, capas concurrentes y
    eliminación frente a edición tardía convergen.
11. SDK MCP oficial, OAuth/PKCE y aprobación web reales: actualización difundida
    después de commit, propuesta idempotente y pendiente local conservado.
12. Dos sesiones del mismo actor no colisionan; Files/Storage reales rechazan una
    referencia de archivo perteneciente a la empresa ajena.
13. Revocar a B activo y desconectado: no publica su cola ni al recargar, no obtiene
    otra firma/copia fotográfica, el socket anterior no recibe operaciones nuevas
    y un intento de entrar al canal nuevo también es denegado. Su borrador persiste.

No hubo errores de ejecución del navegador en ese recorrido. Fabric permanece
diferido; Studio: 316.349 bytes (gzip 94.700), según el bundle de esta foto.
La implementación de exportación `87c1b26b`, posterior a esta foto, se conserva
en main y no se presenta como parte de estos E2E. Igual criterio para los cambios
concurrentes de Notes/UI: no se revirtieron ni se incluyeron en commits propios.

Los artefactos quedan ignorados bajo `.artifacts/studio/`: resultado JSON, logs,
capturas y PNG/JPG. Los fallos iniciales de selectores y aislamiento entre fixtures
se corrigieron sin eliminar sus negativos de permisos.

## Límites y trabajo posterior

- Colisiones de texto, pintura o encuadre siguen siendo LWW atómico; se conserva
  una copia local para revisar, pero no se promete fusión sin pérdida. Un parche
  de objeto borrado no lo recrea automáticamente. Los borradores antiguos sin
  operaciones conservan su restauración explícita de snapshot.
- Una sesión suspendida por autorización requiere recuperar permisos y reabrir;
  el botón de reconexión no publica una cola rechazada. Ediciones locales que
  lleguen antes de bloquearse la UI también se conservan sin publicarse.
- Los recibos deben retenerse: purgar esos eventos elimina la garantía para
  reintentos históricos. Auditoría por lote aumenta almacenamiento; antes de
  una publicación amplia conviene medir volumen y definir retención segura.
- Una URL de Storage ya emitida mantiene su TTL de hasta 60 s. Revocar impide
  nuevas capacidades, operaciones y copias, sin prometer borrar bytes ya recibidos.
- El preview remoto transitorio durante arrastre sigue pendiente (opcional).
  No se añadió una vía de broadcasts cliente ni SQL por cada movimiento.
- Clientes anteriores a `patch/patchPage` no entienden el protocolo; API/clientes
  deben actualizarse coordinadamente. Nada de esta validación autoriza publicar
  ni sustituir RC1.

Commits propios de implementación: `2038a10d`, `0bd37e23`, `81fc5581`,
`4fc835f9` y `94e8149b`. Se preservaron los commits y cambios concurrentes de UI.
