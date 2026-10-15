# Eliminación de empresas y cuentas sin acceso

## Administrar una eliminación

En **Empresa → Perfil de empresa → Eliminar empresa**, un administrador de esa
empresa confirma su nombre exacto y su contraseña. El servidor registra un plazo
de **72 horas exactas**; volver a solicitarlo no extiende el vencimiento.

La empresa queda suspendida. Sus membresías permanecen para permitir recuperarla,
pero dejan de autorizar operaciones. Las cuentas con otra empresa activa pueden
seguir trabajando en ella. La cuenta que pierde su última empresa ve una pantalla
de acceso bloqueado con las opciones de volver a comprobar el acceso y cerrar
sesión. La identidad se conserva y vuelve a servir cuando le asignan una empresa.
No se elimina el usuario de Supabase Auth por perder una membresía.

Los administradores ven las empresas pendientes y su fecha de vencimiento en esa
pantalla. Si conservan otra empresa, también pueden recuperarlas desde el panel
de eliminación del perfil de empresa. La recuperación requiere una membresía
administradora vigente de la empresa suspendida y debe ocurrir **antes** de vencer.
Restablece su estado previo; llamadas terminadas y procesos externos interrumpidos
no se recrean automáticamente. El listado de recuperación es visible para todos
los administradores autorizados; no se envían correos de aviso automáticamente.

Al vencer comienza una purga del worker, que puede tardar según el volumen. Desde
entonces no se puede cancelar. Los errores dejan la empresa bloqueada y permiten
reintentar; no se presenta como eliminada mientras existan dependencias o errores
de almacenamiento. Las cuentas, avatares, firmas y recursos personales globales se
conservan. También se conservan los módulos y recursos utilizados por otra empresa.

## Qué elimina el worker

- Registros activos y desactivados con `company_id`, incluyendo tablas RME3 de
  módulos deshabilitados o desinstalados; hijos identificados por claves foráneas
  y relaciones de chat administradas mediante SQL.
- Membresías, roles propios, permisos, configuración de empresa, proyectos y
  revisiones Builder, conexiones, eventos, actividad y auditoría empresariales.
- Archivos cuyos propietarios son la empresa o sus entidades, versiones Office,
  adjuntos/versiones de chat, evidencias y archivos administrados con `bucket` y
  `object_key`. Se conserva un inventario privado para reintentar. Después de llamar
  a Storage se comprueba que los objetos ya no aparezcan antes de borrar metadata.
- Segmentos de grabación y pistas de transcripción, e imágenes de notas
  identificables por empresa o por el UUID de una nota. Se detienen productores
  activos antes de inventariar sus archivos. El worker también intenta detener
  las llamadas durante la suspensión, sin esperar a las 72 horas.
- Publicaciones y ZIP de sitios estáticos bajo el prefijo de esa empresa.
- Paquetes, bundles, tablas, permisos y metadata de módulos custom con asignación
  o proyecto Builder exclusivo, sin otras empresas consumidoras ni dependencias
  desde otros módulos. No se atribuye propiedad por quién subió un archivo.
- Datos identificables de esa empresa en las copias `runly_backup`. Las copias
  exclusivas de un módulo eliminado se retiran junto con el módulo.

Una referencia desde otra empresa, una tabla sin clave para identificar sus filas,
una dependencia desconocida o un error externo impiden completar la purga. No se
deshabilitan restricciones ni se eliminan recursos de otras empresas para forzarla.

## Instalación y operación

Este cambio necesita desplegar **API, web y worker** y aplicar primero las
migraciones del proyecto con `pnpm db:migrate`. La migración
`20261014180000_company_deletion` crea el esquema privado `runly_lifecycle` y los
triggers de suspensión. No agrega modelos ni tablas RME3 al esquema Prisma.

El worker consulta al arrancar y cada minuto. Usa bloqueos transaccionales por
empresa para coordinar procesos y cancelaciones. Un fallo de purga se reintenta
tras cinco minutos; un reinicio retoma trabajos en curso. Credenciales y destinos
se toman de la configuración existente. El worker necesita acceso de escritura
al volumen de módulos y a los bundles, además de permisos de Storage y LiveKit
para los recursos que use la empresa.

La API exige autorización empresarial en cada solicitud autenticada, aunque la
identidad JWT esté en caché. Solo deja disponibles el arranque de identidad,
membresías, recuperación y aceptación de invitaciones cuando no hay empresas.
Los gateways públicos verifican capacidades contra empresas suspendidas. Los
triggers congelan las escrituras, incluso desde workers, y las limpiezas de
archivos excluyen empresas suspendidas. Los cambios globales de módulos y las
copias/restauraciones se bloquean mientras hay eliminaciones pendientes.

Consulta operativa desde una conexión administrativa privada:

```sql
SELECT company_id, state, purge_after, attempts, error_code, updated_at
FROM runly_lifecycle.company_deletion
WHERE state IN ('PENDING', 'PURGING', 'FAILED')
ORDER BY purge_after;
```

`FAILED` requiere corregir la causa (`STORAGE_DELETE_FAILED`,
`CROSS_COMPANY_REFERENCE`, etc.); el siguiente ciclo vuelve a intentarlo. Los
errores registrados no contienen SQL, direcciones, credenciales ni contenido.
No modificar `purge_after` para anticipar una eliminación en una instalación real.

## Respaldos, copias y límites de propiedad

El plazo de recuperación de 72 horas conserva los datos actuales; no depende de
restaurar un respaldo de toda la instalación. Una restauración de módulo anterior
a una eliminación definitiva se rechaza para impedir reintroducir datos. Las
copias nuevas se permiten una vez terminadas las eliminaciones.

Se conservan comprobantes técnicos privados: UUID de empresa, solicitante, fechas,
estado y claves de recursos eliminados. No contienen nombres, correos, objetos de
Storage ni contenido empresarial. Sirven para bloquear callbacks tardíos y
reintroducciones con los mismos identificadores. Su retención debe cubrir la
ventana de restauración de infraestructura; no tienen caducidad automática.

Los respaldos físicos, PITR y exportaciones de infraestructura tienen su propia
retención. Esta función no modifica copias físicas compartidas. Antes de reabrir
tráfico tras restaurarlas se debe reconciliar el registro de eliminaciones desde
una copia externa al respaldo restaurado y reaplicar las purgas correspondientes.
No restaurar una copia anterior sin ese procedimiento operativo.

Las URLs públicas o firmadas ya emitidas pueden conservar acceso hasta caducar o
eliminarse el objeto. Bloquear los gateways no retira archivos de un CDN ni copias
descargadas. Los clientes desconectados tampoco pueden recibir una revocación
instantánea. Estas copias no se presentan como eliminadas por este proceso.

Los paquetes heredados sin asignación o propiedad comprobable y los borradores de
imagen antiguos almacenados bajo el usuario sin asociación empresarial no pueden
atribuirse automáticamente a una empresa. Se preservan como recursos sin propiedad
empresarial demostrable. Las nuevas imágenes de notas empresariales incluyen el
UUID de empresa en su ruta para evitar esa ambigüedad.

## Validación aislada

La suite destructiva exige `RUNLY_LIFECYCLE_TEST_DATABASE_URL` apuntando a una base
**desechable llamada `runly_lifecycle_test`**. No usa `DATABASE_URL` ni `DIRECT_URL`.
Recrea sus esquemas y genera el core desde el esquema Prisma del repositorio.

```sh
node --test apps/api/src/services/__tests__/company-access-policy.test.js
node --test apps/api/src/services/__tests__/company-deletion.integration.test.js
```

La integración cubre recuperación, plazo, idempotencia, congelación, cuentas
compartidas, Storage fallido, documentos con versiones, chat, tablas custom,
respaldos, paquetes exclusivos, conflictos entre empresas y workers simultáneos.
