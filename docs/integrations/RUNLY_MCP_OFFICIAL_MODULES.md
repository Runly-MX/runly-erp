# MCP de módulos oficiales

El registro de `apps/api/src/mcp/registry.js` declara herramientas, esquemas Zod,
scopes, políticas de aprobación y operaciones por dominio. `adapters/` construye
adaptadores a servicios y capacidades compartidas con HTTP/MirAI. El transporte
en `server.js` consume el registro; no conoce la lógica de cada módulo.
Inventario conserva contratos, nombres, propuestas y resultados anteriores.

El [catálogo generado](RUNLY_MCP_CATALOG.md) detalla herramientas, operaciones y
permisos. Los dominios nuevos publican tres herramientas semánticas por módulo:
`runly_<dominio>_query`, `runly_<dominio>_prepare`, `runly_<dominio>_commit`.
Las dos primeras reciben `companyId` y `request: { operation, input }`; el commit
recibe `companyId` y `proposalId`. `runly_module_schema` proporciona los esquemas
de operaciones que la persona puede ejecutar. `runly_modules_list` devuelve un
resumen sin repetir esquemas completos. Los resultados de los dominios nuevos
usan `{ data: { operation, result } }`.

## Consentimiento y seguridad

Cada dominio tiene scopes `<dominio>:read` y `<dominio>:write`. `runly:read` no
concede acceso a datos de otro dominio. Los tokens anteriores conservan sus
scopes y las doce herramientas base. Refresh no permite ampliar scopes.
Para habilitar nuevos dominios, reconectar ChatGPT/Inspector y aprobar un nuevo
consentimiento. Si el cliente conserva un registro DCR limitado a los scopes
anteriores, borrar ese registro para esta conexión y registrar de nuevo.

El módulo debe estar instalado, habilitado para la empresa y accesible por el
permiso de su manifest, además de los permisos de la operación. Se admiten claves
legacy `atlas.*` equivalentes sin migrarlas. Cada servicio conserva sus reglas
de propiedad, acceso compartido y relaciones. Los recursos privados no pasan
a ser públicos por pertenecer a la empresa.

Las propuestas duran diez minutos y fijan módulo, empresa, usuario, conexión,
operación, datos, relaciones resueltas y efectos. El motor revalida el recurso,
la propuesta y los permisos al revisar, aprobar y ejecutar. Un rechazo es
terminal. Cambiar recursos o relaciones obliga a preparar y aprobar de nuevo.
Se bloquean autorización y propuesta; el commit usa transacción serializable.
Solo se reintentan conflictos de serialización cuya transacción fue revertida.
No se reintentan fallos arbitrarios. Altas financieras, presupuestos y cambios
explícitos de cuenta vinculada requieren una confirmación adicional en la web.
Repetir prepare con los mismos datos y versión devuelve la misma propuesta;
repetir commit devuelve el mismo resultado y no duplica escrituras ni auditoría.

## Límites de dominio

- RH acepta `userProfileId` explícito y muestra cuenta, ID y correo al aprobar.
  Busca duplicados de empleado y valida empresa, elegibilidad, jerarquía y
  relaciones mediante `hr-service`. No resuelve identidades ambiguas por nombre.
- Flota permite vehículos y pólizas mediante sus servicios. El contrato actual
  no modela kilometraje editable ni un plan general de mantenimiento: no se
  inventan campos u operaciones. Las consultas reflejan estados y seguros reales.
- Notas permite búsqueda/contenido, carpetas/etiquetas, creación y cambio de
  título/carpeta. No expone reemplazo ni append de contenido existente: el
  servicio Yjs fusiona updates binarios, pero falta un contrato semántico que
  convierta texto en una edición ProseMirror y sincronice sus espejos HTML/texto.
  No se descartan estados colaborativos para simular esa función.
- PFM separa carteras accesibles y presupuestos propios. No permite usar carteras
  que reflejan cuentas Ledger para registrar movimientos nativos. Presupuestos
  exigen categoría propia y una cartera accesible, si se especifica.
- Ledger usa acceso de lectura/escritura de cada cuenta, categorías y servicios
  de movimientos. No expone importación con IA, pagos ni transferencias externas.
- Proyectos conserva roles individuales de proyecto y validación de asignados;
  no basta con un permiso empresarial. La creación/edición de proyectos y tareas
  pasa por sus servicios y efectos internos existentes.
- Calendario permite agenda interna, creación y reprogramación con comprobación
  de propietario/EDITOR/MANAGER. Los calendarios con source Google y los eventos
  vinculados a otro módulo no se modifican mediante MCP.

No hay nuevas tablas, variables, migraciones, SQL arbitrario, borrado genérico ni
acciones externas. Las pruebas utilizan PostgreSQL temporal y datos sintéticos,
incluyendo funciones de acceso y tablas de Notas de las migraciones existentes;
no aplican DDL a la base configurada en `.env`.

La ampliación de módulos adicionales, verificación completa y procedimiento de
actualización se documentan en este mismo informe al cerrar la implementación.
