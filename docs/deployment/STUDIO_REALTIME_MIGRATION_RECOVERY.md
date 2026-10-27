# Recuperar la migración de Studio Realtime

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

## Verificación local

`node scripts/verify-studio-realtime-upgrade.mjs` usa una pila Docker desechable
y las imágenes locales indicadas en el script. Reproduce una base anterior sin
el nuevo init SQL, el error de permisos y el P3009 posterior; comprueba que el
diagnóstico no escribe y que un fallo desconocido se rechaza. Después ejecuta
la recuperación real y dos migraciones consecutivas. Verifica datos testigo,
checksums históricos, conservación del intento fallido y restricciones globales
de Realtime. No utiliza la base de una instancia existente.
