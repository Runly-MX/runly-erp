import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, lstat, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const TRANSIENT = new Set(['.locks', '.staging', '.previews']);
const INVENTORY_SQL = `SELECT json_build_object(
  'buckets', COALESCE((SELECT json_agg(b ORDER BY b.id) FROM storage.buckets b), '[]'::json),
  'objects', COALESCE((SELECT json_agg(json_build_object('bucket', bucket_id, 'name', name,
    'version', version, 'size', metadata->>'size') ORDER BY bucket_id, name) FROM storage.objects), '[]'::json),
  'modules', COALESCE((SELECT json_agg(key ORDER BY key) FROM runly_module
    WHERE status = 'INSTALLED' AND (key LIKE 'custom.%' OR key LIKE 'community.%')), '[]'::json)
)::text`;

export function relativeParts(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(value) ||
    value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Ruta de recurso no admitida.');
  return value.split('/');
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function inventoryFiles(root, { modules = false } = {}) {
  const files = [];
  async function visit(directory, relative = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (modules && !relative && item.isDirectory() && TRANSIENT.has(item.name)) continue;
      const key = relative ? `${relative}/${item.name}` : item.name;
      relativeParts(key);
      if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) throw new Error('El origen contiene enlaces o archivos especiales.');
      if (item.isDirectory()) await visit(path.join(directory, item.name), key);
      else {
        const file = path.join(directory, item.name);
        const info = await lstat(file);
        files.push({ path: key, bytes: info.size, sha256: await hashFile(file) });
      }
    }
  }
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('El origen requerido no es un directorio normal.');
  await visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function postgresEnv(values) {
  let url;
  try { url = new URL(values.DATABASE_URL); } catch { throw new Error('DATABASE_URL no está configurada correctamente.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error('DATABASE_URL no está configurada correctamente.');
  return { ...values, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer', PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c row_security=off' };
}

export function validateSourceInventory(metadata) {
  if (!Array.isArray(metadata?.buckets) || !Array.isArray(metadata?.objects) || !Array.isArray(metadata?.modules)) throw new Error('Inventario de origen inválido.');
  const buckets = new Set();
  for (const bucket of metadata.buckets) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(bucket.id ?? '') || buckets.has(bucket.id)) throw new Error('Bucket de origen inválido.');
    buckets.add(bucket.id);
  }
  const names = new Set();
  for (const object of metadata.objects) {
    relativeParts(object.name);
    const key = `${object.bucket}/${object.name}`;
    if (!buckets.has(object.bucket) || names.has(key) || object.size === null || object.size === '' ||
      !Number.isSafeInteger(Number(object.size)) || Number(object.size) < 0 ||
      (object.version && !/^[a-zA-Z0-9-]+$/.test(object.version))) throw new Error('Objeto de origen inválido o sin tamaño verificable.');
    names.add(key);
  }
  for (const key of metadata.modules) if (!/^(custom|community)\.[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(key)) throw new Error('Identidad de módulo no admitida.');
  return metadata;
}

export async function collectBackup(root, { values = process.env, run = execute } = {}) {
  const startedAt = new Date().toISOString();
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || path.resolve(root) === path.parse(path.resolve(root)).root ||
    (await readdir(root)).length) throw new Error('La colección requiere un directorio temporal nuevo y vacío.');
  const mode = values.BACKUP_COVERAGE_MODE || 'complete';
  if (!['complete', 'database-only'].includes(mode)) throw new Error('BACKUP_COVERAGE_MODE debe ser complete o database-only.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(values.RUNLY_INSTANCE_ID ?? '')) throw new Error('Falta una identidad de instancia válida.');
  const dbEnv = postgresEnv(values);
  async function call(command, args, env = values) {
    try { return (await run(command, args, { env, maxBuffer: 128 * 1024 * 1024 })).stdout.trim(); }
    catch { throw new Error(`Falló ${command}; no se publicará un respaldo completo.`); }
  }
  const serverNumber = Number(await call('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', 'SHOW server_version_num'], dbEnv));
  const serverMajor = Math.floor(serverNumber / 10000);
  const dumpMajor = Number((await call('pg_dump', ['--version'], dbEnv)).match(/PostgreSQL\)?\s+(\d+)/)?.[1]);
  if (!serverMajor || !dumpMajor || dumpMajor < serverMajor) throw new Error('pg_dump no es compatible con la versión del servidor.');
  const readMetadata = async () => validateSourceInventory(JSON.parse(await call('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', INVENTORY_SQL], dbEnv)));
  const metadata = mode === 'complete' ? await readMetadata() : null;
  await call('pg_dump', ['-Fc', '-f', path.join(root, 'db.dump')], dbEnv);
  const resources = Object.fromEntries(['database', 'storage', 'modules', 'config'].map(k => [k, { status: k === 'database' ? 'complete' : 'excluded' }]));
  resources.database.serverMajor = serverMajor;
  resources.database.dumpMajor = dumpMajor;
  if (mode === 'complete') {
    for (const name of ['storage', 'modules', 'config']) await mkdir(path.join(root, name));
    // Source folders are fixed read-only mounts, not user-composed shell text.
    const local = await access('/storage-source').then(() => true).catch(() => false);
    const prefix = values.BACKUP_STORAGE_VOLUME_PREFIX || 'stub/stub';
    const separator = values.BACKUP_STORAGE_VERSION_SEPARATOR || '/';
    relativeParts(prefix);
    if (!['/', '-$v-'].includes(separator)) throw new Error('Separador de versión Storage no admitido.');
    if (local) {
      await inventoryFiles('/storage-source');
      await call('cp', ['-a', '--', '/storage-source/.', `${root}/storage/`]);
      resources.storage.format = 'volume';
      resources.storage.volumePrefix = prefix;
      resources.storage.versionSeparator = separator;
    } else {
      for (const key of ['BACKUP_STORAGE_S3_ENDPOINT', 'BACKUP_STORAGE_S3_ACCESS_KEY_ID', 'BACKUP_STORAGE_S3_SECRET_ACCESS_KEY']) {
        if (!values[key]) throw new Error('Falta acceso al origen Storage requerido por complete.');
      }
      const storageEnv = { ...values, RCLONE_CONFIG_RUNLYSTORAGE_TYPE: 's3', RCLONE_CONFIG_RUNLYSTORAGE_PROVIDER: 'Other',
        RCLONE_CONFIG_RUNLYSTORAGE_ENV_AUTH: 'false', RCLONE_CONFIG_RUNLYSTORAGE_ACCESS_KEY_ID: values.BACKUP_STORAGE_S3_ACCESS_KEY_ID,
        RCLONE_CONFIG_RUNLYSTORAGE_SECRET_ACCESS_KEY: values.BACKUP_STORAGE_S3_SECRET_ACCESS_KEY,
        RCLONE_CONFIG_RUNLYSTORAGE_ENDPOINT: values.BACKUP_STORAGE_S3_ENDPOINT,
        RCLONE_CONFIG_RUNLYSTORAGE_REGION: values.BACKUP_STORAGE_S3_REGION || values.REGION || 'us-east-1' };
      for (const bucket of metadata.buckets) {
        await mkdir(path.join(root, 'storage', bucket.id));
        await call('rclone', ['copy', `runlystorage:${bucket.id}`, path.join(root, 'storage', bucket.id), '--fast-list', '--log-level', 'ERROR'], storageEnv);
        const copied = await inventoryFiles(path.join(root, 'storage', bucket.id));
        const expected = new Set(metadata.objects.filter(o => o.bucket === bucket.id).map(o => o.name));
        if (copied.length !== expected.size || copied.some(f => !expected.has(f.path))) throw new Error('La copia Storage no coincide con el inventario del origen.');
      }
      resources.storage.format = 's3-objects';
    }
    for (const object of metadata.objects) {
      const relative = local ? `${prefix}/${object.bucket}/${object.name}${object.version ? separator + object.version : ''}` : `${object.bucket}/${object.name}`;
      const file = path.join(root, 'storage', ...relativeParts(relative));
      const info = await lstat(file).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink() || info.size !== Number(object.size)) throw new Error('Falta un objeto Storage requerido o su tamaño no coincide.');
    }
    resources.storage.status = 'complete';
    resources.storage.buckets = metadata.buckets.map(b => {
      const objects = metadata.objects.filter(o => o.bucket === b.id);
      return { name: b.id, objectCount: objects.length, bytes: objects.reduce((n, o) => n + Number(o.size), 0) };
    });
    await writeFile(path.join(root, 'storage-metadata.json'), JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 });
    await inventoryFiles('/modules-source', { modules: true });
    for (const key of metadata.modules) {
      const entry = await lstat(path.join('/modules-source', key, 'module.manifest.js')).catch(() => null);
      if (!entry?.isFile() || entry.isSymbolicLink()) throw new Error('Falta la fuente de un módulo instalado.');
    }
    for (const entry of await readdir('/modules-source', { withFileTypes: true })) {
      if (entry.isDirectory() && TRANSIENT.has(entry.name)) continue;
      await call('cp', ['-a', '--', `/modules-source/${entry.name}`, `${root}/modules/`]);
    }
    // Only top-level installer transients are excluded. Nested module data stays.
    resources.modules.status = 'complete';
    resources.modules.installedKeys = metadata.modules;
    const configFiles = await inventoryFiles('/config-source');
    if (!configFiles.some(f => /^\.env\.(local|external)$/.test(f.path))) throw new Error('Falta la configuración original de la instancia.');
    await call('cp', ['-a', '--', '/config-source/.', `${root}/config/`]);
    resources.config.status = 'complete';
    if (JSON.stringify(await readMetadata()) !== JSON.stringify(metadata)) throw new Error('El inventario cambió durante la copia; repite el respaldo.');
  }
  const files = await inventoryFiles(root);
  const manifest = { schemaVersion: 1, coverageMode: mode, instanceId: values.RUNLY_INSTANCE_ID,
    createdAt: new Date().toISOString(), startedAt, consistency: 'metadata-stable-not-atomic',
    sourceRevision: values.RUNLY_RELEASE_REVISION || null, resources, files };
  await writeFile(path.join(root, 'backup-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return { coverageMode: mode, fileCount: files.length, bucketCount: resources.storage.buckets?.length ?? 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('Falta el directorio temporal de respaldo.');
    console.log(JSON.stringify(await collectBackup(process.argv[2])));
  } catch (error) {
    // Do not include process outputs, queries, connection strings or resource names.
    console.error('[backup] No se completó la colección requerida.', error.message?.startsWith('Falló ') ? error.message : 'Revisa fuentes, versiones e inventario.');
    process.exitCode = 1;
  }
}
