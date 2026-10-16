import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { resolveOfficeConfig } from '../infra/installer/lib/office-config.mjs';
import { withRunlyEnvAliases, syncMissingEnvFile } from '../infra/installer/lib/env-compat.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function syncDevelopmentEnv(directory = repoRoot) {
  // .env.local is an override layer when .env exists. Blank defaults there
  // would shadow working credentials/URLs inherited from .env.
  const envFile = ['.env', '.env.local'].find(file => fs.existsSync(path.join(directory, file)));
  if (envFile) return syncMissingEnvFile(path.join(directory, envFile), path.join(directory, '.env.example'));
}

export function startOfficeDev({ values, run = spawnSync } = {}) {
  if (!values) {
    const envPath = path.join(repoRoot, '.env');
    values = withRunlyEnvAliases(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}, process.env);
  }
  if (values.RUNLY_OFFICE_ENABLED !== 'true') return { status: 'disabled' };
  const office = resolveOfficeConfig(values);
  const internal = new URL(office.env.COLLABORA_INTERNAL_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(internal.hostname)) {
    return { status: 'external' };
  }
  if (internal.protocol !== 'http:' || internal.port !== '9980') {
    throw new Error('El editor Docker de desarrollo publica http://127.0.0.1:9980. Revisa COLLABORA_INTERNAL_URL.');
  }
  const result = run('docker', [
    'compose', '-p', 'runlyerp', '-f', path.join(repoRoot, 'infra/docker/office-dev.compose.yml'),
    'up', '-d', '--no-deps', 'collabora-dev',
  ], {
    cwd: repoRoot,
    // The partial Compose file intentionally shares the existing Runly project.
    // Never prune/recreate other services, and never pass a WOPI signing key as config.
    env: { ...process.env, ...office.compose, COMPOSE_IGNORE_ORPHANS: 'true' },
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error('No se pudo iniciar Collabora. Comprueba Docker y el puerto 9980.');
  return { status: 'started' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await syncDevelopmentEnv();
    const result = startOfficeDev();
    if (result.status === 'started') console.log('[office] Editor local disponible en el grupo Docker runlyerp.');
  } catch (error) {
    // Office is optional: keep the regular API/web/worker development flow available.
    console.warn(`[office] ${error.message} Runly puede iniciar, pero la edición Office requiere resolver este aviso.`);
  }
}
