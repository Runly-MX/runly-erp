# Eliminación de empresas con recuperación durante 72 horas

Estado: implementado el ciclo de suspensión de 72 horas, recuperación, purga y bloqueo de usuarios sin empresas. Este archivo conserva el diagnóstico y diseño originales; el comportamiento entregado, límites de propiedad y operación se describen en [COMPANY_DELETION.md](../../COMPANY_DELETION.md). No se consultaron ni modificaron datos de producción.

## Diagnóstico comprobado

- `apps/api/src/routes/company-routes.js` permite crear empresas y administrar perfil, dirección, marca y miembros; no contiene un flujo de eliminación/recuperación de empresa.
- `prisma/schema.prisma`: `Company` tiene `enabled`, pero no estado de eliminación, fecha límite ni solicitud persistente. `Membership` vincula perfiles globales a varias empresas.
- `docs/TASKS.md`, sección de conexiones, reconoce expresamente que falta la eliminación definitiva de empresas.
- `services/connections/connection-lifecycle.js` ya ofrece `onCompanyRemoved`, pero solo limpia `connection_record`; no es una eliminación integral.
- Hay cascadas parciales. Muchas tablas tienen `companyId` sin relación con `Company`; `CalendarCalendar` usa `SetNull`. No basta con ejecutar `company.delete`.
- `FileAsset` no tiene `companyId` dedicado. El servicio habitual de archivos usa `entityId = companyId` y guarda la entidad de origen en metadata. Se deben inventariar también productores alternativos y datos antiguos. `FileAssetVersion` guarda objetos adicionales y restringe borrar el archivo padre.
- `files-service.js` conserva mediante desactivación los documentos Office o con revisiones. En otros casos registra un error de Storage y continúa borrando metadata. Este comportamiento no sirve como garantía de purga integral.
- `RunlyModule` es un catálogo global de la instancia; `CompanyModule` representa habilitación por empresa. La ausencia de una fila de deshabilitación puede significar que el módulo está disponible. La desinstalación actual modifica permisos y estado globales, y un modo elimina tablas enteras: no debe invocarse como borrado de una empresa.
- El generador SQL RME3 añade `company_id` para modelos con `companyScoped`; no añade automáticamente una FK hacia empresa. También permite modelos globales (`companyScoped: false`).
- Existe papelera de registros con retención predeterminada de 90 días y workers de limpieza. No equivale a una papelera de empresas: sus proveedores filtran módulos instalados/habilitados y pueden omitir registros.
- `module-backup-service.js` copia tablas completas a `runly_backup` durante 14 días. Restaurar reemplaza tablas completas. Es necesario impedir que esos respaldos reintroduzcan datos eliminados.

## Comportamiento propuesto

1. El administrador de la empresa solicita su eliminación desde una zona de peligro. Confirma el nombre de la empresa y realiza una autenticación reciente. Mostrar alcance y fecha/hora exacta antes de confirmar.
2. Se registra una solicitud persistente y la empresa pasa a `PENDING_DELETION`. El plazo es de **72 horas exactas**, calculadas por el servidor en UTC y presentadas en la zona horaria del usuario.
3. La empresa queda suspendida: se bloquean operaciones normales, acceso público, cargas, integraciones, automatizaciones y tareas que puedan escribir o destruir datos. Sus datos permanecen recuperables. Se avisa a todos sus administradores.
4. Un administrador autorizado puede cancelar antes del vencimiento. Una pantalla de recuperación debe funcionar aunque la empresa no forme parte de las membresías activas habituales. No se desactivan/destruyen las membresías como mecanismo de suspensión.
5. Cancelar restaura el estado previo, invalida cachés y registra la cancelación. Las operaciones pendientes se reanudan según una política explícita para evitar envíos duplicados. Las conexiones externas que requieran nueva autorización se muestran al administrador.
6. Al vencer, se cierra la recuperación y un worker reclama atómicamente la solicitud. Pasa a `PURGING`; cancelar y reclamar usan el mismo bloqueo/transición para resolver carreras. Dos solicitudes repetidas no reinician el plazo.
7. El worker borra por etapas y reintenta lo pendiente. Solo informa `COMPLETED` tras verificar ausencia de residuos. Si falla, la empresa sigue bloqueada y aparece un estado operativo con posibilidad de reintento.

El vencimiento es el inicio de la eliminación definitiva; su duración depende del volumen y de servicios externos. No prometer que todos los bytes desaparecen exactamente a las 72 horas.

## Alcance de la eliminación

| Recurso | Tratamiento propuesto |
|---|---|
| Registros de negocio, activos y desactivados | Borrar todos los datos de la empresa y sus hijos, sin depender del estado del módulo ni de la papelera. |
| Archivos e imágenes | Borrar objetos originales, revisiones, miniaturas, adjuntos, evidencias, grabaciones y exportaciones atribuibles a la empresa; después retirar sus metadatos. |
| Miembros y permisos | Borrar membresías, roles propios, permisos otorgados y configuraciones de esa empresa. Conservar roles globales utilizados por otras empresas. |
| Cuentas de usuario | Una cuenta compartida conserva su acceso a las demás empresas. Para cuentas exclusivamente empresariales, la purga de Auth/perfil requiere demostrar propiedad y ausencia de recursos personales o globales; no basta con contar membresías activas. Política pendiente de definir. |
| Módulos custom | Borrar registros de la empresa, proyectos/revisiones Builder propios, configuración y conexiones. Eliminar paquetes, bundles o tablas solo si se demuestra propiedad exclusiva y ausencia de consumidores/dependencias; el catálogo actual no representa esa propiedad de forma suficiente. |
| Links, kioscos e integraciones | Bloquear acceso durante el plazo; al purgar eliminar tokens/configuraciones propios y cancelar entregas, webhooks y eventos en cola. Conservar conexiones personales compartidas. |
| Auditoría y actividad | Borrar contenidos empresariales, incluidos JSON que contengan datos. Conservar, si se acuerda, únicamente un comprobante mínimo de eliminación sin nombres, correos ni contenido del negocio, con retención definida. |
| Respaldos y cachés | Limpiar copias administradas por Runly y bloquear restauraciones que resuciten datos; definir tratamiento de respaldos de infraestructura y clientes desconectados. |

Las URLs ya emitidas y los archivos públicos requieren una estrategia propia de acceso/caché; cambiar `enabled` no retira por sí solo un objeto que sigue accesible directamente. Tampoco es posible retirar copias ya descargadas por una persona.

## Diseño técnico y orden de implementación

### 1. Inventario y propiedad: requisito previo

- Construir una matriz de cada tabla core, tablas RME3 registradas (incluidos módulos desinstalados), tablas históricas y respaldos: propiedad directa, vía padre o global; identificadores de objetos externos; orden por FK; comprobación final.
- Comparar ese inventario con el catálogo real de una base de prueba para detectar tablas sin clasificar. La lista no puede depender solo de `Company` y sus relaciones Prisma.
- Inventariar todos los escritores de Storage y almacenamiento local, no solo `files-service`. Resolver objetos heredados con evidencia; no atribuirlos únicamente por quién los subió.
- Establecer propiedad explícita de archivos y paquetes donde el esquema actual sea ambiguo. Los recursos sin clasificación impiden declarar la purga completa.
- Definir un contrato de limpieza por empresa para módulos con recursos externos o modelos globales. No ejecutar hooks globales de desinstalación para esta tarea.

### 2. Ciclo de vida y barrera de acceso

- Separar el ciclo de eliminación del indicador `enabled`; guardar estado, solicitante, fechas y estado previo.
- Persistir un trabajo de eliminación con etapas, intentos, errores depurados, bloqueo con vencimiento y progreso. Su registro debe sobrevivir al borrado de `Company` y eliminarse/minimizarse según retención acordada.
- Añadir solicitar, consultar estado y cancelar. Resolver autorización contra la empresa concreta desde servidor; no reutilizar la empresa activa implícita para recuperar una empresa suspendida.
- Aplicar la barrera a API autenticada, rutas públicas, sesiones de invitados, WebSocket, SDK, WOPI/Office, kioscos, cron/workers e integraciones. Esperar/drenar escrituras en curso antes de congelar el inventario final.
- Mantener funcionales el cambio a otras empresas y la pantalla sin empresas. Revisar el singleton legado `instance_config.company_id` y los mecanismos de setup para que la última eliminación no reabra un alta administrativa insegura.
- Suspender también limpiezas automáticas durante las 72 horas: hoy la papelera puede recorrer empresas sin filtrar `enabled`.

### 3. Purga persistente y verificable

- Ejecutar en `apps/worker`, al inicio y periódicamente, con reclamación atómica entre procesos y recuperación tras reinicios.
- Preparar un inventario durable de objetos antes de eliminar referencias; mantenerlo privado y solo mientras sea necesario para reintentar.
- Eliminar objetos de Storage por lotes con la API, comprobar errores y tratar objetos ya ausentes como éxito. Nunca borrar un bucket compartido completo.
- Borrar datos por orden de dependencias en transacciones acotadas; incluir registros inactivos, hijos sin `companyId`, índices, preferencias/configuraciones con claves compuestas y eventos pendientes.
- Coordinar snapshots, instalación/actualización/restauración de módulos y purga para que no se cree una copia concurrente ni reaparezcan filas. Si un respaldo compartido no se puede depurar con certeza, bloquear su restauración y resolver su disposición sin afectar otras empresas.
- Finalizar objetos y recursos externos antes de perder su inventario. Borrar `Company` al final y verificar también después de los efectos de triggers.
- Si se aprueba eliminar cuentas exclusivamente empresariales: volver a comprobar sus referencias bajo bloqueo, limpiar sus objetos propios y ejecutar el borrado de Auth con reintentos. Mantener autorización de Runly cerrada aunque queden JWT emitidos.
- No marcar éxito ante referencias desconocidas, fallos externos o filas omitidas. Alertar con identificadores operativos, sin registrar contenido empresarial.

### 4. Respaldos y restauración de infraestructura

Los respaldos de base de datos son distintos de los objetos de Storage. Hay que inventariar la política real de cada instalación antes de fijar una promesa de retención. No se presupone que se pueda editar selectivamente un respaldo físico compartido.

Definir caducidad de copias de infraestructura y un registro mínimo de empresas eliminadas que permita reaplicar la purga antes de abrir tráfico después de una restauración. Ese registro debe sobrevivir fuera del respaldo que se restaura, tener acceso restringido y retención documentada. Las copias descargadas y los dispositivos desconectados tienen límites que deben explicarse en el producto.

## Verificaciones necesarias antes de habilitarlo

- Cancelación a tiempo y rechazo al vencer, usando reloj del servidor; carrera cancelar/worker; repetición de solicitudes.
- Suspensión efectiva con sesiones existentes, rutas públicas, conexiones abiertas y trabajos ya en ejecución; recuperación accesible al último administrador.
- Fallos y reinicios en cada etapa, dos workers simultáneos, Storage parcialmente fallido y reintentos sin duplicación ni pérdida del inventario.
- Dos empresas compartiendo usuario, módulo, roles y Storage: la empresa de control conserva datos, archivos, permisos y funcionamiento.
- Archivos Office y versiones, objetos huérfanos/antiguos, módulos deshabilitados/desinstalados, modelos globales y relaciones `RESTRICT`/`SetNull`.
- Respaldos de módulo y restauración antigua: no reaparecen datos purgados. Verificación de tablas e inventario de objetos con cero residuos atribuibles.
- Eliminación de la última empresa, recuperación antes de vencer y experiencia posterior sin empresas; no se habilita setup sin autorización.

## Decisiones de producto pendientes

- Suspensión total durante las 72 horas (recomendada) o consulta sin edición.
- Quién puede solicitar/cancelar: administrador de la empresa (recomendado con autenticación reciente) o un propietario con rol específico nuevo.
- Qué significa cuenta exclusivamente empresarial y si su identidad global debe borrarse automáticamente. El modelo actual permite cuentas compartidas y recursos personales.
- Propiedad exclusiva de código custom: conservar paquetes compartidos y definir cómo identificar/eliminar los exclusivos.
- Retención de respaldos de infraestructura y del comprobante mínimo; promesa exacta del producto sobre cachés y copias descargadas.

## Referencias externas verificadas

- [Supabase: eliminar objetos](https://supabase.com/docs/guides/storage/management/delete-objects): borrar SQL/metadata no elimina el objeto; usar Storage API.
- [Supabase: gestión de usuarios](https://supabase.com/docs/guides/auth/managing-user-data): los JWT emitidos pueden seguir vigentes y los objetos cuyo dueño es el usuario pueden impedir eliminar Auth.
- [Supabase: respaldos](https://supabase.com/docs/guides/platform/backups): los respaldos de base no contienen los objetos de Storage.

Implementación: endpoints de ciclo de vida, migración privada, tarea del worker, controles de acceso, interfaz de recuperación y pruebas PostgreSQL aisladas. Se conservan las identidades globales al perder la última membresía, según lo acordado; su acceso al ERP queda bloqueado hasta reincorporarse.
