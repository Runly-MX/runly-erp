# Cierre: número de activo desde Compras

SHA inicial: `4b3abd0b5dec2598b3d6e171a9e99d9d2431d6f2`.

Compras captura un número de activo opcional por unidad y permite corregirlo
desde la sección Inventario de órdenes y facturas. `InvItem.assetTag` continúa
siendo la única fuente de verdad: las relaciones consultan el registro actual,
sin guardar otra copia en documentos ni partidas. Folio Runly y serie siguen
siendo identificadores distintos; la serie permanece opcional.

Se conserva la transacción e idempotencia existentes. La huella incorpora los
números capturados; los duplicados identifican el campo y revierten todo el lote.
La edición reutiliza la API de Inventarios, su auditoría y los permisos por
empresa y área. Una precondición opcional `expectedUpdatedAt` evita sobrescrituras
concurrentes en este editor sin romper los clientes existentes. El borrador se
conserva ante conflicto y requiere recargar antes de guardar de nuevo.

La prueba real de acceso por área descubrió una respuesta denegada que se perdía
entre middlewares y terminaba en HTTP 500. Se corrigió la propagación de esa
respuesta y se añadió una regresión con el comportamiento real del middleware.

## Aceptación

Ejecutada con navegador y API reales sobre un stack completamente desechable,
validando el destino antes de las suites. Sin pruebas contra APIs compartidas.

| Caso | Resultado |
| --- | --- |
| 1. Dos bienes con números distintos | Aprobado; IDs y folios distintos |
| 2. Alta sin número de activo ni serie | Aprobado |
| 3. Número duplicado | Aprobado; conflicto de campo y ninguna alta parcial |
| 4. Reintento de creación | Aprobado; mismos IDs y números; contenido distinto con la misma clave rechazada |
| 5. Edición desde Compras | Aprobado desde OC y factura financieras |
| 6. Actualización visible en Inventarios | Aprobado en API y ficha real |
| 7. Ausencia de segunda copia en Compras | Aprobado; hidratación muestra el valor vigente |
| 8. Permisos | Aprobado; solo lectura y denegación por área, incluso con permiso global de actualización |
| 9. Preservación financiera | Aprobado; comparación íntegra de documentos, relaciones, asignaciones y recepción existente |
| 10. Documental y QR | Aprobado; OC y factura documentales comparten el registro sin importes; QR estable y reimpresión con número actual |

También se verificaron dos sesiones concurrentes: la segunda recibe conflicto,
conserva su captura y no sobrescribe silenciosamente el cambio de la primera.

## Comprobaciones

- Integración en base desechable: 71 pruebas aprobadas (17 del puente,
  34 documentales, 11 de pagos y 9 de correcciones).
- Selección de pruebas unitarias de Compras e Inventarios: 547 aprobadas.
- Aislamiento de Inventarios tras corregir el middleware: 21 aprobadas.
- Navegador del diálogo con errores de red y reintentos: aprobado.
- Aceptación integral en navegador: diez casos aprobados.
- ESLint de los archivos afectados: aprobado. React Doctor: sin incidencias.
- Privacidad global: 67 hallazgos preexistentes; los archivos de este cambio no
  contienen hallazgos. No se corrigen problemas ajenos a este alcance.

Sin problemas funcionales pendientes demostrados dentro del alcance. No se
modificaron generador de etiquetas, formato QR, esquema ni migraciones. Las
etiquetas físicas impresas conservan su texto y pueden reimprimirse mediante la
función existente. La creación del registro no representa recepción física.

Cambios concurrentes de otras sesiones preservados. Cierre funcional aprobado;
el commit es local y no autoriza publicación ni despliegue. Sin push, SSH,
despliegue ni migraciones sobre bases reales.
