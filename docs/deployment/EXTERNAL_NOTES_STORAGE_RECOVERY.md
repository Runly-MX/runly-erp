# Recuperacion de una external migrada con Storage de Notes sin preparar

Para la instalacion external en la que el installer `2026.10.28.5` aplico
`20261028011349_notes_private_images` y `20261211000000_studio_retired_asset_lineage`
y despues se detuvo con `NOTES_STORAGE_NOT_PREPARED` (guard ausente, bucket `runly-notes`
todavia publico). Aplica a cualquier external en ese estado.

Esto es un procedimiento para ensayar primero en una copia restaurada. No lo ejecutes
por primera vez sobre la instancia real.

## Que estado tiene la instancia

- Esquema de la aplicacion: migrado (las dos migraciones aplicadas).
- Contenedores: los anteriores (el installer se detuvo antes de reemplazarlos). La API
  anterior sigue corriendo contra el esquema nuevo, de modo que conviene recuperar
  pronto.
- Storage: bucket publico y sin guard. Las imagenes siguen accesibles por URL publica
  hasta completar la recuperacion; eso es lo que la recuperacion cierra.

La recuperacion **no revierte ni reescribe migraciones** (el historial de Prisma es
inmutable), no borra datos y no mueve ni elimina objetos de Storage. Es idempotente.

## Antes de empezar

1. Copia de seguridad de la base y del almacenamiento de objetos. Para el ensayo,
   restaura ambas en una copia.
2. Usa el installer `2026.10.28.6` o posterior con imagenes del mismo SHA o posterior
   (contrato `studio-realtime-1`). El installer anterior no sirve: ejecuta la
   migracion antes del gate.
3. Ten a mano la conexion del propietario de `storage.objects` y `storage.buckets`
   (normalmente el rol que administra Storage, p. ej. `supabase_storage_admin` o
   `postgres`). Esa conexion se usa solo durante la ejecucion; no se guarda.

## Estado de solo lectura (antes y despues)

Este script solo cuenta filas y nombres de migraciones; no imprime conexiones ni
contenido. Lee la conexion de la aplicacion de `.env.external`.

```js
const pg = require('pg')
;(async () => {
  const c = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL })
  await c.connect()
  const q = async sql => { try { return (await c.query(sql)).rows } catch { return null } }
  const out = {
    migrations: (await q('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name'))?.map(r => r.migration_name) ?? null,
    unfinishedMigrations: (await q('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL'))?.length ?? null,
    notes: (await q('SELECT count(*)::int AS n FROM notes'))?.[0]?.n ?? null,
    buckets: await q("SELECT id, public FROM storage.buckets WHERE id IN ('runly-notes','atlas-notes') ORDER BY id"),
    objects: await q("SELECT bucket_id, count(*)::int AS n FROM storage.objects WHERE bucket_id IN ('runly-notes','atlas-notes') GROUP BY 1 ORDER BY 1"),
    guard: (await q("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='runly_notes_bucket_private_v1' AND NOT tgisinternal"))?.[0]?.n ?? null,
    policy: (await q("SELECT count(*)::int AS n FROM pg_policy WHERE polname='runly_notes_private_images_v1'"))?.[0]?.n ?? null,
  }
  console.log(JSON.stringify(out))
  await c.end()
})().catch(() => { console.error('STATE_QUERY_FAILED'); process.exit(1) })
```

Ejecutalo con la imagen de la API que vas a instalar (misma red que usa el installer;
si `.env.external` define `RUNLY_MIGRATION_NETWORK`, usa `--network "$RUNLY_MIGRATION_NETWORK"`,
y en caso contrario `--add-host host.docker.internal:host-gateway`):

```text
docker run --rm -i --network "$RUNLY_MIGRATION_NETWORK" --env-file .env.external "$RUNLY_API_IMAGE" node - < estado.js > estado-antes.json
```

Guarda `estado-antes.json`. Esperado ahora: las dos migraciones en `migrations`,
`guard: 0`, `policy: 0` y el bucket `runly-notes` con `public: true`.

## Preparar al propietario de forma temporal y segura

La conexion privilegiada solo debe existir en el entorno del proceso durante la
ejecucion.

```text
read -rs RUNLY_NOTES_OWNER_DATABASE_URL
export RUNLY_NOTES_OWNER_DATABASE_URL
```

- `read -s` evita que la conexion aparezca en pantalla y no la deja en el historial de
  la shell. No la pegues en un argumento ni en `.env.external`.
- El installer la lee solo desde el entorno del proceso (o, si la has escrito antes en
  `.env.external`, desde ahi: no lo hagas). La pasa al contenedor de un solo uso por
  nombre (`-e RUNLY_NOTES_OWNER_DATABASE_URL`), nunca como valor en la linea de comandos,
  y ese contenedor se elimina al terminar (`--rm`).
- Nunca llega al contenedor de la API: la E2E verifica que el entorno de la API no
  contiene la variable, y que la salida del installer no contiene la conexion.
- Al terminar, `unset RUNLY_NOTES_OWNER_DATABASE_URL`. Si la shell tiene historial
  compartido o registro de sesion, usa una shell nueva y cierrala despues.
- Alternativa sin variable: pide al administrador de la base que aplique
  `prisma/prepare-notes-storage-owner.sql` como propietario (es idempotente y no borra
  nada) y lanza el update **sin** la variable; el gate lo verificara.

## Recuperar

Con la variable exportada y el installer `.6` ya publicado:

```text
./update-external.sh
```

(`update-external.sh` refresca el installer desde `origin/main`: el installer `.6`
debe estar publicado en `main` antes.) El orden ahora es:

1. Prepara con el propietario y verifica Storage (solo lectura). Si falla, se detiene
   aqui: no se ejecuta ninguna migracion ni se reemplaza ningun contenedor.
2. Comprueba Studio Realtime, aplica `prisma migrate deploy` (sin migraciones
   pendientes; no vuelve a ejecutar las ya aplicadas) y el seed.
3. Reemplaza los contenedores con las imagenes del SHA.
4. Al arrancar, la API convierte el bucket a privado con la clave de servicio e
   inventaria las referencias antiguas sin mover objetos.
5. Espera `/health` y ejecuta la sonda anonima (`--probe`).

Despues: `unset RUNLY_NOTES_OWNER_DATABASE_URL`.

## Verificar el resultado

Ejecuta de nuevo el script de estado y compara con `estado-antes.json`:

- `migrations`: igual que antes (las dos migraciones siguen ahi; aparecen solo las
  migraciones nuevas que hubiera pendientes, ninguna desaparece).
- `notes` y `objects`: iguales (ningun objeto movido, borrado ni renombrado).
- `guard: 1`, `policy: 1`, `runly-notes` con `public: false`.
- La sonda anonima paso (lo hizo el installer). Para repetirla a mano:
  `docker run --rm --network … --env-file .env.external "$RUNLY_API_IMAGE" node apps/api/scripts/notes-storage-preflight.mjs --probe`
  (no imprime secretos).
- En la interfaz, una nota con imagenes historicas muestra las imagenes (se sirven por
  la ruta autorizada de la API) y una nota publicada con imagenes tambien.

Repetir el update es seguro: el resultado es el mismo.

## Si algo falla

| Salida | Significado | Accion |
|---|---|---|
| `NOTES_STORAGE_NOT_PREPARED` | El propietario no pudo crear politica/guard o la conexion es incorrecta | Revisa la conexion del propietario o aplica el SQL como administrador; no se ha tocado nada mas |
| `NOTES_STORAGE_ANONYMOUS_ACCESS` | Una peticion anonima pudo leer o listar | No expongas la instancia; revisa otras politicas permisivas sobre `storage.objects` |
| Falla despues de reemplazar contenedores | Raro; el esquema ya estaba migrado | Vuelve a ejecutar; no reabras el bucket; consulta "Rollback" del informe del Release Candidate |

**No reabras el bucket `runly-notes`/`atlas-notes` como parte de ninguna recuperacion.**
La API anterior se queda sin imagenes visibles hasta restaurar el candidato; eso es
preferible a exponerlas.

## Limites

- Las copias que alguien descargo o guardo mientras el bucket era publico no se pueden
  retirar.
- No se ha probado en Supabase Cloud ni en proveedores que no permitan crear politicas
  o triggers en el esquema `storage`: en ellos el propietario no existe y esta
  recuperacion no es posible.
- El procedimiento se verifica con bases desechables (`scripts/verify-notes-installer-e2e.mjs`,
  caso `external-regression-to-unsafe`), que ejecuta el script de estado de este
  documento antes y despues; no se ha ensayado en la instancia real.
