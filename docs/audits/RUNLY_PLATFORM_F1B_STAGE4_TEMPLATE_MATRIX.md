# F1B Stage 4: matriz de compatibilidad de las seis plantillas del Builder

Generada por `scripts/security/verify-template-matrix.mjs` (evidencia: `docs/audits/evidence/f1b-stage4-template-matrix.json`). Cada plantilla se publicó con el runtime actual, se convirtió en seco, se activó de forma explícita (paquete aprobado y capacidades concedidas) y se ejecutó contra su tabla existente, en una pila PostgreSQL desechable con dos empresas y con los módulos **fuera de la raíz del proyecto** (`RUNLY_MODULES_DIR`).

Resultado: **6 de 6 sin fallos** en instalación, ejecución, paridad con el runtime actual, aislamiento y reversión. Solo `simple-crud` es `FULLY_DECLARATIVE`; las otras cinco quedan en `DECLARATIVE_WITH_REVIEW` por diferencias reales que se listan abajo, no se fuerzan.

## Resultado por plantilla

| Plantilla | Clasificación | Preservado | Transformado | Instalación | Ejecución | Paridad con el runtime actual | Aislamiento multiempresa | Reversión |
|---|---|---|---|---|---|---|---|---|
| visitas | Con revisión | 14 | 0 | OK | OK | OK | OK | OK |
| prestamo-herramientas | Con revisión | 14 | 0 | OK | OK | OK | OK | OK |
| mantenimiento | Con revisión | 14 | 1 | OK | OK | OK | OK | OK |
| solicitudes | Con revisión | 12 | 1 | OK | OK | OK | OK | OK |
| inventory-lite | Con revisión | 13 | 1 | OK | OK | OK | OK | OK |
| simple-crud | Totalmente declarativa | 11 | 0 | OK | OK | OK | OK | OK |

- **Ejecución:** crear, leer, actualizar con versión, listar, baja lógica y restauración por el runtime declarativo.
- **Paridad:** el runtime actual ve el mismo registro, no ve el eliminado y lo ve de nuevo al restaurarlo (misma tabla, mismo ID).
- **Aislamiento:** la empresa B no lista, no lee ni elimina registros de la empresa A.
- **Reversión:** al quitar el paquete declarativo la respuesta es `MODULE_NOT_AVAILABLE` y el runtime actual conserva todas las filas.

## Capacidades preservadas (todas)

Clave del módulo, entidades, campos con tipo, obligatoriedad, opciones y valores por defecto; permisos con las **mismas claves** (incluido `delete`, que ahora tiene operación); navegación; tabla de origen; relaciones con Contactos, RR.HH. e Inventario por el contrato de relaciones; configuración por empresa (`company_module` no cambia).

## Diferencias y puntos de revisión

| Plantilla | Elemento | Tipo | Diferencia semántica |
|---|---|---|---|
| mantenimiento | Campo decimal | Transformado | Pasa a número: revisar la precisión requerida |
| inventory-lite | Campo decimal | Transformado | Igual |
| solicitudes | Campo markdown | Transformado | Se muestra como texto largo: el formato no se renderiza |
| Las cinco con vistas | Kanban de la entidad | Revisar | La vista personalizada no se convierte; sigue en el runtime actual |
| Las cinco con vistas | Dashboard | Revisar | Igual |
| prestamo-herramientas | Conexión `prestamo_herramienta` | Revisar | Las conexiones no tienen equivalente declarativo |
| simple-crud | — | — | Sin diferencias |

Ninguna plantilla incluye automatizaciones del Builder. Para módulos que sí las tengan, el convertidor las clasifica como `review` («sigue en el runtime actual»): una escritura por el gateway **no** dispara las automatizaciones del Builder, y eso es una diferencia semántica que se informa, no se oculta.

## Qué no cubre esta matriz

- Datos del módulo con adjuntos: `files.attach` responde 409 sobre tablas RME3; los adjuntos siguen con las rutas de archivos actuales.
- Módulos del Builder con automatizaciones, enlaces públicos, tipos de documento o widgets: se clasifican `review` y no se ejercitaron (ninguna plantilla los usa).
- No se probó el renderizado en un navegador contra la fachada REST (ver el documento de resultados).
