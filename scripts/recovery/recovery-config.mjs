import { parse } from 'dotenv';

export function inputError(message) {
  return Object.assign(new Error(message), { exitCode: 2 });
}

export function validateImage(image) {
  if (typeof image !== 'string' || !(
    /^sha256:[a-f0-9]{64}$/.test(image) ||
    /^raulbellosom\/runlyerp@sha256:[a-f0-9]{64}$/.test(image) ||
    /^raulbellosom\/runlyerp:backup-[a-zA-Z0-9_.-]+$/.test(image)
  ) || /:backup-.*latest$/i.test(image)) {
    throw inputError('Usa un digest local sha256 o una imagen oficial de backup con versión fija; latest no está permitido.');
  }
  return image;
}

export function resolveRecoveryConfig(source) {
  const values = typeof source === 'string' || Buffer.isBuffer(source) ? parse(source) : source;
  const required = ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'RUNLY_INSTANCE_ID',
    'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY', 'RESTIC_PASSWORD'];
  const clean = {};
  for (const key of [...required, 'BACKUP_S3_REGION']) {
    const value = String(values?.[key] ?? '');
    if (required.includes(key) && !value.trim()) throw inputError(`Falta ${key} en la configuración de recuperación.`);
    if (/[\r\n\0]/.test(value)) throw inputError(`${key} no admite saltos de línea.`);
    clean[key] = value;
  }
  let endpoint;
  try { endpoint = new URL(clean.BACKUP_S3_ENDPOINT); } catch { throw inputError('BACKUP_S3_ENDPOINT no es una URL válida.'); }
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname) ||
    (endpoint.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
    throw inputError('El endpoint debe usar HTTPS, sin credenciales ni rutas; HTTP solo se admite en loopback.');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(clean.BACKUP_S3_BUCKET) || clean.BACKUP_S3_BUCKET.includes('..')) {
    throw inputError('BACKUP_S3_BUCKET no es un nombre S3 válido.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(clean.RUNLY_INSTANCE_ID) || ['.', '..'].includes(clean.RUNLY_INSTANCE_ID)) {
    throw inputError('RUNLY_INSTANCE_ID no es un identificador válido.');
  }
  const region = clean.BACKUP_S3_REGION || 'us-east-1';
  if (!/^[a-zA-Z0-9_-]+$/.test(region)) throw inputError('BACKUP_S3_REGION no es válida.');
  return {
    instanceId: clean.RUNLY_INSTANCE_ID,
    env: {
      RESTIC_REPOSITORY: `s3:${endpoint.origin}/${clean.BACKUP_S3_BUCKET}/${clean.RUNLY_INSTANCE_ID}`,
      RESTIC_PASSWORD: clean.RESTIC_PASSWORD,
      AWS_ACCESS_KEY_ID: clean.BACKUP_S3_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: clean.BACKUP_S3_SECRET_ACCESS_KEY,
      AWS_DEFAULT_REGION: region,
    },
  };
}

export function serializeRecoveryEnv(env) {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
}

export function validateSnapshotId(id) {
  if (!/^[a-f0-9]{8,64}$/.test(id ?? '')) throw inputError('Selecciona un ID hexadecimal de snapshot; latest no está permitido.');
  return id;
}
