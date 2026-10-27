# Recuperar la migración de Studio Realtime

Distribución versionada, compatibilidad, matriz de instalaciones y decisión de
seguridad: [cierre local del Installer](STUDIO_INSTALLER_CLOSURE_LOCAL.md).

`P3009` indica que Prisma encontró una migración fallida y bloqueó las siguientes.
En actualizaciones selfhosted, `20261210000000_studio_realtime_ephemeral` podía
fallar porque el Installer anterior solo montaba la preparación del rol para
volúmenes nuevos. Un volumen existente no vuelve a ejecutar los scripts init.
La transacción explícita puede dejar `logs` vacío en `_prisma_migrations`.

La corrección prepara el rol mediante `supabase_admin` antes de migrar, descarga
el SQL en ambos bootstrap local y conserva intacta la migración original.
Actualizar archivos del repositorio local no publica imágenes ni actualiza un
servidor. El procedimiento siguiente requiere descargar primero el Installer
corregido mediante el canal de distribución habitual.

## Diagnóstico y recuperación

Ejecutar desde la carpeta existente del Installer que contiene `.env.local`,
`.env`, `docker-compose.yml` y `supabase/docker-compose.supabase.yml`:

```bash
node recover-studio-realtime.mjs
```

Sin opciones solo consulta el estado. Para recuperar el caso conocido, indicar
explícitamente la imagen API que ya está instalada y contiene esa migración:

```bash
node recover-studio-realtime.mjs --recover-known-failure --api-image=YOUR_EXISTING_API_IMAGE
npm run runly:local
```

Sustituir `YOUR_EXISTING_API_IMAGE` por la referencia real. No se descarga la
imagen: se usa `--pull=never`. Compose utiliza `.env` para interpolación; los
jobs de aplicación utilizan `.env.local`.

La recuperación exige un único intento fallido de esta migración, ausencia de
su función y sus dos políticas, y uno de los checksums originales:

- LF: `37275b48040e5b877b868136eeefd14d52139fa810e30fa87db8c974f73a850f`.
- CRLF: `3d7e94500a5a690b1fc2f819ca8a753de2e2dcb5ee193136dd9eb41a20952dfb`.

Solo acepta logs vacíos o el error conocido de preparación del propietario.
También comprueba que la conexión de Prisma apunta al mismo PostgreSQL
selfhosted. Otros fallos o aplicaciones parciales requieren diagnóstico propio.

Primero prepara el rol de forma atómica y vuelve a consultar el estado. Después
ejecuta `prisma migrate resolve --rolled-back`: conserva el registro fallido y
permite reintentar la migración. No la marca como aplicada ni elimina datos.
El setup posterior ejecuta el SQL pendiente. Este uso de `--rolled-back` sigue
el procedimiento de [recuperación de Prisma](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing).

## Instalaciones external

El setup external corregido ejecuta una comprobación previa con la misma
conexión y red que Prisma. Si el rol ya está preparado, continúa sin cambios.
Si falta preparación, intenta ejecutarla de forma atómica con la cuenta de la
base configurada. Una cuenta con permiso suficiente no requiere acceso SSH al
servidor de PostgreSQL ni credenciales adicionales.

Si esa cuenta no puede preparar el rol, el setup se detiene antes de ejecutar
Prisma. No convierte la cuenta de aplicación en administrador ni elimina RLS.
Para usar una conexión autorizada temporal, crear un archivo privado
`.secrets/studio-admin.env` con una sola asignación:

```dotenv
SUPABASE_ADMIN_DATABASE_URL=postgresql://OWNER:PASSWORD@database.example:5432/postgres
```

La conexión debe apuntar al mismo host, puerto y base que la conexión efectiva
de Prisma. Usar credenciales reales solo en ese archivo ignorado y restringir
su lectura al propietario (por ejemplo, `chmod 600 .secrets/studio-admin.env`).
No añadirlas a `.env.external`. El archivo se pasa únicamente a la tarea de
preparación; la tarea de Prisma y los servicios no lo reciben. También puede
prepararse el SQL del propietario por separado y retirar el archivo privado.

Si la actualización ya falló, usar la imagen API existente explícitamente:

```bash
node studio-realtime-external.mjs --api-image=YOUR_EXISTING_API_IMAGE
node studio-realtime-external.mjs --api-image=YOUR_EXISTING_API_IMAGE --recover-known-failure
./update-external.sh
```

El primer comando solo consulta. El segundo aplica las mismas comprobaciones
de checksum, transacción y fallos ajenos que la recuperación local antes de
marcar el intento como revertido. Una base restringida puede requerir que su
propietario prepare el rol. Supabase alojado no garantiza acceso a
`supabase_admin`; este procedimiento no pretende eludir las restricciones del
proveedor ni certifica compatibilidad con cualquier plan o proyecto alojado.

Si los jobs deben entrar en una red Docker existente, configurar
`RUNLY_MIGRATION_NETWORK` en el entorno del Installer. La misma red se utiliza
para diagnóstico, preparación, recuperación y migraciones external. No se
construye automáticamente a partir de un nombre de servidor.

## Verificación local

`node scripts/verify-studio-realtime-upgrade.mjs` usa una pila Docker desechable
y las imágenes locales indicadas en el script. Reproduce una base anterior sin
el nuevo init SQL, el error de permisos y el P3009 posterior; comprueba que el
diagnóstico no escribe y que un fallo desconocido se rechaza. Después ejecuta
la recuperación real y dos migraciones consecutivas. Verifica datos testigo,
checksums históricos, conservación del intento fallido y restricciones globales
de Realtime. No utiliza la base de una instancia existente.

`node scripts/verify-studio-realtime-external-upgrade.mjs` prueba el flujo external
contra otra pila local desechable: cuenta insuficiente sin nuevo fallo Prisma,
cuenta autorizada sin configuración adicional, rechazo de conexión admin a otra
base, recuperación del fallo conocido y actualizaciones repetibles. No sustituye
una validación en un proyecto de Supabase alojado.
