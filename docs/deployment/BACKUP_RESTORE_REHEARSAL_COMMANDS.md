# Comandos ejecutados en el ensayo de respaldo y recuperacion

Generado por `scripts/rehearsal/render-commands.mjs` a partir del registro de la ejecucion `r4`. Son los comandos que el arnes lanzo de verdad, con los secretos enmascarados (`<secreto>`) y las rutas locales, nombres de proyecto, puertos e identificadores de acceso generados sustituidos por marcadores. Solo se muestra la primera aparicion de cada tipo.

## Redaccion y filtrado de la configuracion (runbook B.2 y B.3)

runbook B.2: redact the configuration copy

```text
bash -c awk -F= '/^[A-Za-z0-9_]+=/ { if ($1 ~ /(SECRET|PASS|TOKEN|KEY|CREDENTIAL|DATABASE_URL|DIRECT_URL|_URL$|ENDPOINT|BUCKET|HOST|DOMAIN|ORIGIN|EMAIL|_USER$)/) { print $1"="; next } } { print }' .env.external > env.external.redactada
```

runbook B.3: drop BACKUP_*/RESTIC_*/SMTP_* from the container environment

```text
bash -c grep -v -E '^(BACKUP_|RESTIC_|SMTP_)' .env.external > env.sin-respaldo
```

runbook B.2: count surviving secrets (must be 0)

```text
bash -c grep -E -c '^[A-Za-z0-9_]*(SECRET|PASS|TOKEN|KEY|CREDENTIAL)[A-Za-z0-9_]*=.+' env.external.redactada
```

runbook B.3: count BACKUP_/RESTIC_/SMTP_ variables left (must be 0)

```text
bash -c grep -c -E '^(BACKUP_|RESTIC_|SMTP_)' env.sin-respaldo
```

## Destino S3 local (MinIO)

minio: start a local S3 destination (loopback port only)

```text
docker run -d --name runly-rehearsal-minio-r4 --env-file <ejecucion>/work/minio.env -p 127.0.0.1:<puerto-minio>:9000 minio/minio:latest server /data
```

minio: create bucket rehearsal-a

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-a
```

minio: create bucket rehearsal-b

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-b
```

minio: create bucket rehearsal-f-interrupted-3cb237

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-f-interrupted-3cb237
```

minio: create bucket rehearsal-f-dumpkilled-38d222

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-f-dumpkilled-38d222
```

minio: create bucket rehearsal-f-missing-47ad62

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-f-missing-47ad62
```

minio: create bucket rehearsal-f-corrupt-d5081a

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-f-corrupt-d5081a
```

minio: create bucket rehearsal-f-dbonly-26dc62

```text
docker run --rm --env-file <ejecucion>/work/mc.env --entrypoint /usr/bin/mc minio/minio:latest mb t/rehearsal-f-dbonly-26dc62
```

## Respaldo real de Runly (run-backup.sh)

backup: complete run 1 (redacted configuration)

```text
docker run --rm --network <proyecto-origen>_default --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-a -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=complete -e BACKUP_RETENTION_DAYS=1 -e BACKUP_STORAGE_S3_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e BACKUP_STORAGE_S3_ACCESS_KEY_ID=<id> -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=<secreto> -e BACKUP_STORAGE_S3_REGION=local -v <ejecucion>/work/env.external.redactada:/config-source/.env.external:ro -v <repo>/.artifacts/studio/<proyecto-origen>/custom-modules:/modules-source:ro runly-backup-rehearsal:8bf95a479d43 ./run-backup.sh
```

backup: integral run (original configuration, separate repository)

```text
docker run --rm --network <proyecto-origen>_default --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-b -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=complete -e BACKUP_RETENTION_DAYS=14 -e BACKUP_STORAGE_S3_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e BACKUP_STORAGE_S3_ACCESS_KEY_ID=<id> -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=<secreto> -e BACKUP_STORAGE_S3_REGION=local -v <ejecucion>/work/.env.external:/config-source/.env.external:ro -v <repo>/.artifacts/studio/<proyecto-origen>/custom-modules:/modules-source:ro runly-backup-rehearsal:8bf95a479d43 ./run-backup.sh
```

## Listado y clasificacion de snapshots

restic: init the rehearsal repository

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-a.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache init
```

restic: store a snapshot without Runly coverage tags

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-a.env --entrypoint restic -v <ejecucion>/work/legacy:/legacy:ro runly-backup-rehearsal:8bf95a479d43 --no-cache backup /legacy --host rehearsal-source --quiet
```

restic: list snapshots of rehearsal-a

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-a.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache --no-lock snapshots --json
```

restic: list snapshots of rehearsal-b

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-b.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache --no-lock snapshots --json
```

recovery-cli: inspect

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs inspect --config <ejecucion>/work/recovery-a.env --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

restic: list snapshots of rehearsal-f-interrupted-3cb237

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-f-interrupted-3cb237.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache --no-lock snapshots --json
```

restic: list snapshots of rehearsal-f-dumpkilled-38d222

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-f-dumpkilled-38d222.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache --no-lock snapshots --json
```

restic: list snapshots of rehearsal-f-missing-47ad62

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-f-missing-47ad62.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache --no-lock snapshots --json
```

recovery-cli: inspect

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs inspect --config <ejecucion>/work/recovery-bad-password.env --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

recovery-cli: inspect

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs inspect --config <ejecucion>/work/recovery-bad-secret.env --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

restic: list snapshots of rehearsal-f-dbonly-26dc62

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-f-dbonly-26dc62.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache --no-lock snapshots --json
```

## Extraccion y evaluacion con la CLI de recuperacion

recovery-cli: extract

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs extract --config <ejecucion>/work/recovery-a.env --snapshot 3493a1ce7051b21b798d238c75b9e32b801f0774b5ac7657cf4ccfedec9b0e11 --output <ejecucion>/extract-a --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

recovery-cli: assess

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs assess --input <ejecucion>/extract-a
```

recovery-cli: extract

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs extract --config <ejecucion>/work/recovery-b.env --snapshot 878d35fcaa3d33306ea9938858c3baa345ee1918212aa1ce96811f73f52b39a0 --output <ejecucion>/extract-b --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

recovery-cli: assess

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs assess --input <ejecucion>/extract-altered
```

recovery-cli: assess

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs assess --input <ejecucion>/extract-missing
```

recovery-cli: extract

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs extract --config <ejecucion>/work/recovery-bad-password.env --snapshot 3493a1ce7051b21b798d238c75b9e32b801f0774b5ac7657cf4ccfedec9b0e11 --output <ejecucion>/extract-never --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

recovery-cli: extract

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs extract --config <ejecucion>/work/recovery-dbonly.env --snapshot 37420575e350b543ec394dc7634e6e6fe7c4a490b22fc0419fa74c7c25ca191d --output <ejecucion>/extract-dbonly --image sha256:53826b29f7fbc70515140829e0a070ddd2c99f73c3229c9205e41d2bc4402056
```

recovery-cli: assess

```text
C:\Program Files\nodejs\node.exe scripts/recovery/runly-recovery.mjs assess --input <ejecucion>/extract-dbonly
```

## Tabla de contenido del volcado

pg_restore --list on the extracted dump

```text
docker run --rm -v <ejecucion>/extract-a/tmp/tmp.KgFEKYJQME:/restore:ro runly-backup-rehearsal:8bf95a479d43 pg_restore --list /restore/db.dump
```

## Roles globales sin contrasenas (runbook B.4) y controles

pg_dumpall --roles-only --no-role-passwords (application role)

```text
docker run --rm --network <proyecto-origen>_default -e PGHOST=supabase-db -e PGPORT=5432 -e PGUSER=postgres -e PGPASSWORD -e PGDATABASE=postgres -e PGPASSWORD runly-backup-rehearsal:8bf95a479d43 pg_dumpall --roles-only --no-role-passwords
```

pg_dumpall --roles-only WITHOUT the flag (superuser control)

```text
docker run --rm --network <proyecto-origen>_default -e PGHOST=supabase-db -e PGPORT=5432 -e PGUSER=supabase_admin -e PGPASSWORD -e PGDATABASE=postgres -e PGPASSWORD runly-backup-rehearsal:8bf95a479d43 pg_dumpall --roles-only
```

pg_dumpall --roles-only --no-role-passwords (superuser)

```text
docker run --rm --network <proyecto-origen>_default -e PGHOST=supabase-db -e PGPORT=5432 -e PGUSER=supabase_admin -e PGPASSWORD -e PGDATABASE=postgres -e PGPASSWORD runly-backup-rehearsal:8bf95a479d43 pg_dumpall --roles-only --no-role-passwords
```

## Restauracion de la base en la replica

pg_restore into a scratch database without applying the roles

```text
docker run --rm --network <proyecto-replica>_default -e PGHOST=supabase-db -e PGPORT=5432 -e PGUSER=supabase_admin -e PGPASSWORD -e PGDATABASE=postgres -v <ejecucion>/extract-a/tmp/tmp.KgFEKYJQME:/restore:ro -e PGDATABASE=restore_noroles runly-backup-rehearsal:8bf95a479d43 pg_restore --clean --if-exists -N _realtime --dbname restore_noroles /restore/db.dump
```

pg_restore --clean --if-exists -N _realtime into the replica

```text
docker run --rm --network <proyecto-replica>_default -e PGHOST=supabase-db -e PGPORT=5432 -e PGUSER=supabase_admin -e PGPASSWORD -e PGDATABASE=postgres -v <ejecucion>/extract-a/tmp/tmp.KgFEKYJQME:/restore:ro runly-backup-rehearsal:8bf95a479d43 pg_restore --clean --if-exists -N _realtime --dbname postgres /restore/db.dump
```

## Restauracion de Storage por S3

rclone copy storage/runly-files into the replica

```text
docker run --rm --network <proyecto-replica>_default -v <ejecucion>/extract-a/tmp/tmp.KgFEKYJQME/storage:/src:ro -e RCLONE_CONFIG_RS_TYPE=s3 -e RCLONE_CONFIG_RS_PROVIDER=Other -e RCLONE_CONFIG_RS_ENV_AUTH=false -e RCLONE_CONFIG_RS_ACCESS_KEY_ID=<id> -e RCLONE_CONFIG_RS_SECRET_ACCESS_KEY=<secreto> -e RCLONE_CONFIG_RS_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e RCLONE_CONFIG_RS_REGION=local --entrypoint rclone runly-backup-rehearsal:8bf95a479d43 copy /src/runly-files rs:runly-files --no-check-dest --retries 2 --log-level ERROR
```

## Descifrado de un valor guardado con la clave original o con la nueva

decrypt the stored SMTP password with a given JWT_SECRET

```text
docker run --rm -e JWT_SECRET -e CIPHERTEXT --entrypoint node runly-notifications:api-40e1b6b0a6d6 --input-type=module -e import { createHash } from 'node:crypto'; import { decryptPassword } from '/app/apps/api/src/services/smtp-service.js'; try { process.stdout.write(createHash('sha256').update(decryptPassword(process.env.CIPHERTEXT)).digest('hex')) } catch { process.exit(3) }
```

## Sondas de aislamiento y comprobaciones de la API recuperada

probe the replica API from inside the internal network

```text
docker run --rm --network runly-rehearsal-internal-r4 --entrypoint node runly-notifications:api-40e1b6b0a6d6 -e fetch('http://runly-api:4010/health').then(r => process.exit(r.ok ? 0 : 2), () => process.exit(3))
```

probe from inside the running API container

```text
docker exec runly-rehearsal-api-r4 node -e const net = require('node:net'); const dns = require('node:dns').promises; const t = [{"name":"host-service","host":"host.docker.internal","port":62652},{"name":"production-container","host":"<ip-contenedor>","port":9100}];
        const tcp = (h, p) => new Promise(r => { const s = net.connect({ host: h, port: p, timeout: 2500 }); s.once('connect', () => { s.destroy(); r(true) }); s.once('timeout', () => { s.destroy(); r(false) }); s.once('error', () => r(false)) });
        (async () => { const o = { internet: await fetch('https://example.com', { signal: AbortSignal.timeout(3000) }).then(() => true, () => false), dns: await dns.lookup('example.com').then(() => true, () => false) };
        for (const x of t) o[x.name] = await tcp(x.host, x.port); console.log(JSON.stringify(o)) })()
```

sign in with a restored user and read notes through the recovered API

```text
docker run --rm --network runly-rehearsal-internal-r4 -e ANON=<jwt> -e EMAIL=owner@studio.example.test -e PASSWORD=<secreto> -e COMPANY=01a185dc-8858-7a26-bd81-b845937e51b9 --entrypoint node runly-notifications:api-40e1b6b0a6d6 -e const kong = 'http://supabase-kong:8000'; (async () => {
        const login = await fetch(kong + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: process.env.ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }) });
        if (login.status !== 200) { console.log(JSON.stringify({ step: 'login', status: login.status })); return }
        const { access_token } = await login.json();
        const notes = await fetch('http://runly-api:4010/notes', { headers: { Authorization: 'Bearer ' + access_token, 'X-Runly-Company-Id': process.env.COMPANY } });
        const body = await notes.json().catch(() => ({}));
        console.log(JSON.stringify({ step: 'notes', status: notes.status, titles: (body.notes ?? body.data?.notes ?? []).map(n => n.title) })) })()
```

## Fallos simulados

backup: interrupted after the upload (restic check killed)

```text
docker run --rm --network <proyecto-origen>_default --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-f-interrupted-3cb237 -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=complete -e BACKUP_RETENTION_DAYS=14 -e BACKUP_STORAGE_S3_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e BACKUP_STORAGE_S3_ACCESS_KEY_ID=<id> -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=<secreto> -e BACKUP_STORAGE_S3_REGION=local -v <ejecucion>/work/env.external.redactada:/config-source/.env.external:ro -v <repo>/.artifacts/studio/<proyecto-origen>/custom-modules:/modules-source:ro -v <ejecucion>/work/shim-restic-kill:/usr/local/sbin/restic:ro runly-backup-rehearsal:8bf95a479d43 ./run-backup.sh
```

verify-backup.sh against the interrupted repository

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-f-interrupted-3cb237 -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> runly-backup-rehearsal:8bf95a479d43 ./verify-backup.sh
```

backup: pg_dump killed during collection

```text
docker run --rm --network <proyecto-origen>_default --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-f-dumpkilled-38d222 -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=complete -e BACKUP_RETENTION_DAYS=14 -e BACKUP_STORAGE_S3_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e BACKUP_STORAGE_S3_ACCESS_KEY_ID=<id> -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=<secreto> -e BACKUP_STORAGE_S3_REGION=local -v <ejecucion>/work/env.external.redactada:/config-source/.env.external:ro -v <repo>/.artifacts/studio/<proyecto-origen>/custom-modules:/modules-source:ro -v <ejecucion>/work/shim-pgdump-kill:/usr/local/sbin/pg_dump:ro runly-backup-rehearsal:8bf95a479d43 ./run-backup.sh
```

backup: Storage file missing for a listed object

```text
docker run --rm --network <proyecto-origen>_default --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-f-missing-47ad62 -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=complete -e BACKUP_RETENTION_DAYS=14 -e BACKUP_STORAGE_S3_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e BACKUP_STORAGE_S3_ACCESS_KEY_ID=<id> -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=<secreto> -e BACKUP_STORAGE_S3_REGION=local -v <ejecucion>/work/env.external.redactada:/config-source/.env.external:ro -v <repo>/.artifacts/studio/<proyecto-origen>/custom-modules:/modules-source:ro -e RCLONE_RETRIES=1 -e RCLONE_LOW_LEVEL_RETRIES=2 runly-backup-rehearsal:8bf95a479d43 ./run-backup.sh
```

backup: database-only run for the corruption test

```text
docker run --rm --network <proyecto-origen>_default --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-f-corrupt-d5081a -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=database-only -e BACKUP_RETENTION_DAYS=14 -e BACKUP_STORAGE_S3_ENDPOINT=http://supabase-kong:8000/storage/v1/s3 -e BACKUP_STORAGE_S3_ACCESS_KEY_ID=<id> -e BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=<secreto> -e BACKUP_STORAGE_S3_REGION=local -v <ejecucion>/work/env.external.redactada:/config-source/.env.external:ro -v <repo>/.artifacts/studio/<proyecto-origen>/custom-modules:/modules-source:ro runly-backup-rehearsal:8bf95a479d43 ./run-backup.sh
```

restic check --read-data on the corrupted repository

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-f-corrupt-d5081a.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache check --read-data
```

restic restore --verify from the corrupted repository

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/restic-rehearsal-f-corrupt-d5081a.env --entrypoint restic runly-backup-rehearsal:8bf95a479d43 --no-cache restore latest --target /tmp/restore --verify
```

verify-backup.sh (complete mode) against a database-only repository

```text
docker run --rm --add-host host.docker.internal:host-gateway --env-file <ejecucion>/work/env.sin-respaldo -e BACKUP_S3_ENDPOINT=http://host.docker.internal:<puerto-minio> -e BACKUP_S3_BUCKET=rehearsal-f-dbonly-26dc62 -e BACKUP_S3_ACCESS_KEY_ID=<id> -e BACKUP_S3_SECRET_ACCESS_KEY=<secreto> -e RESTIC_PASSWORD=<secreto> -e BACKUP_COVERAGE_MODE=complete runly-backup-rehearsal:8bf95a479d43 ./verify-backup.sh
```

pg_restore of a dump cut in half into a scratch database

```text
docker run --rm --network <proyecto-replica>_default -v <ejecucion>/extract-a/tmp/tmp.KgFEKYJQME:/restore:ro -e PGHOST=supabase-db -e PGUSER=supabase_admin -e PGPASSWORD -e PGDATABASE=restore_db_truncated runly-backup-rehearsal:8bf95a479d43 pg_restore --clean --if-exists -N _realtime --dbname restore_db_truncated /restore/db.truncated
```

pg_restore of a dump with damaged data bytes into a scratch database

```text
docker run --rm --network <proyecto-replica>_default -v <ejecucion>/extract-a/tmp/tmp.KgFEKYJQME:/restore:ro -e PGHOST=supabase-db -e PGUSER=supabase_admin -e PGPASSWORD -e PGDATABASE=restore_db_damaged runly-backup-rehearsal:8bf95a479d43 pg_restore --clean --if-exists -N _realtime --dbname restore_db_damaged /restore/db.damaged
```
