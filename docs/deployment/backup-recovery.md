# Backup and Recovery Runbook

## Herramienta de inspección y extracción (2026-10-12)

Los nuevos respaldos usan `BACKUP_COVERAGE_MODE=complete` por defecto: base,
todos los buckets inventariados, fuentes de módulos y configuración. En modo
externo son obligatorias las credenciales de Storage; `database-only` debe elegirse
explícitamente y se identifica como parcial. Un snapshot pendiente no cuenta como
respaldo verificado. Los snapshots heredados se conservan para revisión manual:
la nueva retención solo elimina snapshots verificados de la misma cobertura.

`BACKUP_MAX_AGE_HOURS=36` es el máximo predeterminado para un trabajo diario;
ajústalo al horario y pérdida de datos tolerada. Es independiente de
`BACKUP_RETENTION_DAYS=14`. El verificador falla si no hay snapshot con cobertura
verificada compatible, si está antiguo o si falla la integridad. Un parcial más
nuevo no renueva la antigüedad de un respaldo completo.

La alerta del propio job no detecta un contenedor apagado o un cron que nunca
arrancó. Programa `verify-backup.sh` desde un monitor independiente y comprueba
su código de salida; mantén una alerta externa de ausencia de ejecución. La
configuración de ese monitor y su responsable son un pendiente operativo.

Desde el repositorio, `node scripts/recovery/runly-recovery.mjs --help` muestra
los comandos. Esta herramienta extrae archivos; no restaura PostgreSQL, modifica
Storage ni inicia una instalación. La evaluación separa cobertura completa,
incompleta y heredada desconocida. Una extracción completa no certifica que la
aplicación esté recuperada.

Requiere Node.js, las dependencias del repositorio instaladas y Docker local.
Un contexto Docker remoto se rechaza: el directorio validado debe estar en la
misma máquina que recibe la extracción.

Prepara un archivo privado, por ejemplo `infra/installer/.env.recovery`, con los
valores **originales** de `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`,
`RUNLY_INSTANCE_ID`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`,
`RESTIC_PASSWORD` y, si corresponde, `BACKUP_S3_REGION`. No hace falta incluir
credenciales de la base de datos. La contraseña de Restic es distinta de la clave
de B2. Si no existe una copia local, recupérala del gestor privado o de la
configuración de la instalación antes del simulacro; no se puede reemplazar por
una contraseña nueva para leer los snapshots anteriores.

La imagen de backup debe existir localmente y ser una versión oficial fija o un
ID local `sha256:...`. Define `RECOVERY_IMAGE_ID` con el ID verificado de esa imagen
y `RECOVERY_SNAPSHOT_ID` con el ID que elijas después de inspeccionar. No uses
`latest` como snapshot ni como versión de imagen.

```powershell
node scripts/recovery/runly-recovery.mjs inspect --config infra/installer/.env.recovery --image $env:RECOVERY_IMAGE_ID
node scripts/recovery/runly-recovery.mjs extract --config infra/installer/.env.recovery --image $env:RECOVERY_IMAGE_ID --snapshot $env:RECOVERY_SNAPSHOT_ID --output ./restore-selected
node scripts/recovery/runly-recovery.mjs assess --input ./restore-selected
```

`restore-selected` todavía no debe existir; su carpeta padre sí. Se rechazan
enlaces/junctions y tipos de archivo especiales. En Windows, archivos cuyos
nombres no se pueden representar fielmente requieren un destino Linux.
La configuración temporal se limita a las variables necesarias y se elimina al
terminar. Los comandos usan `--no-lock` y no crean ni desbloquean el repositorio.
No ejecutes prune mientras realizas el simulacro con lectura sin lock.

Códigos de salida: 0 operación terminada (puede haber cobertura heredada
desconocida), 1 fallo de ejecución/integridad, 2 entrada o destino inválido,
3 cobertura conocida incompleta. Si se interrumpe una extracción, queda
`.runly-recovery-incomplete`; revisa la carpeta y utiliza un destino nuevo en el
siguiente intento. `.runly-recovery-result.json` contiene el resumen privado.
Antes de restaurar una instalación, revisa qué falta y mantén detenidos API,
worker y cron: la API aplica migraciones y seed al arrancar.

Verificación sintética: 2026-10-12, MinIO con usuario de solo lectura, cinco
buckets, snapshots completo/heredado, PostgreSQL 17 recuperado en una base nueva.
No se ejecutó todavía un simulacro con el repositorio B2 real.

Spec: [docs/superpowers/specs/2026-09-26-backup-recovery-system-design.md](../superpowers/specs/2026-09-26-backup-recovery-system-design.md)

This feature is opt-in (`BACKUP_MODE=enabled` in `.env.local`/`.env.external`).
Restore is **always manual** — there is no automated restore path, by design
(see the spec's Non-goals). Follow this runbook step by step.

## Prerequisites

- Access to the same `BACKUP_S3_ENDPOINT`/`BACKUP_S3_BUCKET`/credentials the
  instance backed up to.
- The instance's `RESTIC_PASSWORD` (from `.env.local`/`.env.external`, or
  wherever you saved it externally per the one-time setup warning).
- The instance's `RUNLY_INSTANCE_ID` (same env file) — snapshots are
  namespaced by it.
- Docker, to run the `runly-backup` image as a one-off container.

## 1. List available snapshots

```bash
docker run --rm \
  -e RESTIC_REPOSITORY="s3:$BACKUP_S3_ENDPOINT/$BACKUP_S3_BUCKET/$RUNLY_INSTANCE_ID" \
  -e RESTIC_PASSWORD="$RESTIC_PASSWORD" \
  -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
  raulbellosom/runlyerp:backup-latest \
  restic snapshots --host "$RUNLY_INSTANCE_ID"
```

Note the snapshot ID (or use `latest`) you want to restore.

## 2. Restore the snapshot to a local directory

```bash
docker run --rm \
  -e RESTIC_REPOSITORY="s3:$BACKUP_S3_ENDPOINT/$BACKUP_S3_BUCKET/$RUNLY_INSTANCE_ID" \
  -e RESTIC_PASSWORD="$RESTIC_PASSWORD" \
  -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
  -v "$PWD/restore:/restore" \
  raulbellosom/runlyerp:backup-latest \
  restic restore latest --target /restore --host "$RUNLY_INSTANCE_ID"
```

This produces `./restore/<scratch-dir-name>/{db.dump, storage/, config/}` on
your machine.

## 3. Restore Postgres

Point this at the target Postgres instance (a fresh one, or the same one
after fixing the underlying disk issue):

```bash
docker run --rm \
  --network <compose-project>_default \
  -v "$PWD/restore:/restore" \
  raulbellosom/runlyerp:backup-latest \
  pg_restore --clean --if-exists -d "$DATABASE_URL" /restore/<scratch-dir-name>/db.dump
```

`--network <compose-project>_default` is only needed when `DATABASE_URL` resolves a
Docker Compose service name (local mode) — omit it when the target Postgres is
reachable directly (typical for external mode).

**Expect `pg_restore` to report hundreds of ignored errors about event triggers
(e.g. `issue_pg_cron_access`, `pgrst_ddl_watch`) — this is normal, not a failed
restore.** The dump includes Supabase's own internal event triggers, which a
fresh `supabase-db` container already creates from its own init scripts before
you ever restore anything; `pg_restore` cannot recreate them as the non-superuser
`postgres` role Supabase self-hosted uses. Verified against a real restore
(disposable Backblaze B2 bucket, 2026-09-27): despite ~750 such warnings,
`_prisma_migrations` and every Runly application table (`company`, `membership`,
`runly_module`, `permission`, `role`, etc.) restored with their exact row counts
intact. Confirm the restore actually worked by querying your own data, not by
checking `pg_restore`'s exit code.

Verify: connect and confirm `Company`/`Membership`/module tables have the
expected row counts for the snapshot's date.

## 4. Restore Supabase Storage files

- **Local mode:** copy `./restore/<scratch-dir-name>/storage/*` back into the
  `supabase-storage-data` Docker volume (e.g. via a temporary container that
  mounts that volume and `cp -a`s the restored tree into it), then restart
  `supabase-storage`.
- **External mode:** upload `./restore/<scratch-dir-name>/storage/<bucket>/*`
  back into each corresponding bucket on the target Supabase instance (via
  its Storage API, the Studio UI, or `rclone copy` against its S3-protocol
  endpoint if available).

## 5. Restore instance config (full disaster recovery only)

Only needed when rebuilding a destroyed VPS from scratch: copy
`./restore/<scratch-dir-name>/config/.env.local` (or `.env.external`) and, in
local mode, `./restore/<scratch-dir-name>/config/supabase-db-init/*` back
into a fresh `infra/installer` checkout at the same paths, **before**
running `setup-local.mjs`/`setup-external.mjs` for the first time on the new
machine.

## 6. Verify a backup without restoring anything

Run this any time (also suitable for wiring into external monitoring), from
your `infra/installer` checkout:

`docker compose` alone does not know the `supabase-storage-data` volume local
mode's `runly-backup-local` service mounts — it is declared in
`supabase/docker-compose.supabase.yml`, a separate file the installer always
passes alongside the rest. Running without it fails with `refers to
undefined volume supabase-storage-data: invalid compose project`. Pass the
same files the installer itself uses (add `-f docker-compose.linux.yml` only
if that file exists in your checkout, which it does on Linux):

```bash
# local mode
docker compose -f docker-compose.yml -f docker-compose.linux.yml -f supabase/docker-compose.supabase.yml \
  --profile backup-local run --rm runly-backup-local ./verify-backup.sh
# external mode
docker compose -f docker-compose.yml -f docker-compose.linux.yml \
  --profile backup-external run --rm runly-backup-external ./verify-backup.sh
```

Exits non-zero if the latest snapshot is older than half the retention
window, or if `restic check` finds repository corruption.

## 7. Failure alerts

The nightly `run-backup.sh` job emails an alert automatically if the backup
fails for any reason (a failed `pg_dump`, a failed `restic check`, etc.) —
no separate monitoring setup needed. It reuses the same `SMTP_*` variables
already configured for the platform's outgoing mail (`.env.local`/
`.env.external`), and sends to `RUNLY_SUPPORT_EMAIL` if set, or to
`hola@runly.mx` (Runly's own support address) otherwise — the same default
the "Reportar bug" button uses. If `SMTP_HOST` isn't set at all, no alert is
sent (only logged); `docker logs runly-backup-local` (or `-external`) is
still the source of truth either way.
