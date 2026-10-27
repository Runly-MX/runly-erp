# Studio v7 — implementación y verificación local

Plan validado con el spec homónimo y las dependencias actuales; autorizado para
implementar por la solicitud. No requiere publicación ni acceso a instalación real.

1. Contrato compartido: normalizar v1–v6, validar colección cabeza/cola e IDs y
   presupuestos agregados; operaciones deterministas de página, diff/compactación.
2. Protocolo 3 y guard aditivo SQL; ampliar límites HTTP de documentos y mantener
   digest/recibos. Traversal global de Files, créditos, templates y resúmenes.
3. Historial selectivo y sync con objetivos pageId; preservar colas/copia cuando
   una página desaparece. API/SDK/MCP/MirAI reconocen versión y operaciones nuevas.
4. Wrapper multipágina del Fabric actual: una escena activa, flush al cambiar,
   restauración de selección/viewport y render auxiliar secuencial. Desselección
   por clic intencional fuera del papel sin capturar otros controles.
5. Caché de miniaturas acotada e invalidación localizada, permisos y liberación.
6. Jobs PDF efímeros secuenciales, rangos, revisión/autorización y abortos. Mantener
   PNG/JPG de escena activa y explicar el número de páginas sin crear otra UI.
7. Pruebas unitarias/SQL y browser reales, Supabase desechable y actores sintéticos;
   cinco páginas, colaboración/plantillas/Files/MCP y PDF inspeccionado/rasterizado.
8. Actualizar contrato para integración UI, reportar límites y riesgos reales,
   lint/React Doctor/privacidad y commits propios en main. Mantener intactas las
   referencias RC1/RC2 y los cambios ajenos de Calls/Chat presentes al empezar.

Los criterios no se cierran por cantidad de código: una prueba fallida exige
corrección o bloqueo explícito. No introducir purgas de recibos ni migraciones
de datos históricos. No iniciar evolución gráfica adicional de documento v8.

## Cierre verificado

Implementado y validado localmente en el corte de producto
`342d24ea5d5d0434f7317d8c906105ad383d8a9a`: 76 grupos E2E en una sola
ejecución con API/Web/Worker del mismo SHA y Supabase desechable.
Regresión: 1.420 aprobadas, una omisión existente, cero fallos.
El clic fuera del papel también se comprobó en la Web real.

Resultados, reproducción, límites y pendientes de integración visual:
[validación v7](../../deployment/STUDIO_V7_LOCAL_VALIDATION.md).
