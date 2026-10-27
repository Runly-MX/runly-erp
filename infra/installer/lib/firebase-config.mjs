import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey } from 'node:crypto';
import { parseOfficeEnv } from './office-config.mjs';
import { canonicalizeRunlyEnvText } from './env-compat.mjs';

export const FIREBASE_DEFAULTS = {
  ATLAS_FCM_ENABLED: 'false',
  FIREBASE_PROJECT_ID: '',
  GOOGLE_APPLICATION_CREDENTIALS: '/run/secrets/firebase/service-account.json',
};

// Keep exact user values when setup-local regenerates its environment file.
export function preserveFirebaseEnv(text) {
  return text.split(/\r?\n/).filter(line => Object.keys(FIREBASE_DEFAULTS)
    .some(key => line.startsWith(`${key}=`) || line.startsWith(`${key.replace(/^ATLAS_/, 'RUNLY_')}=`))).join('\n');
}

export async function configureFirebase({ envFile }) {
  const directory = path.join(path.dirname(envFile), '.secrets', 'firebase');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const text = await fs.readFile(envFile, 'utf8');
  const stored = parseOfficeEnv(text);
  const missing = Object.entries(FIREBASE_DEFAULTS).filter(([key]) => !Object.hasOwn(stored, key));
  if (missing.length) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    await fs.appendFile(envFile, eol + '# Firebase server push (runtime integration pending)' + eol
      + canonicalizeRunlyEnvText(missing.map(([key, value]) => `${key}=${value}`).join('\n')).replaceAll('\n', eol) + eol);
  }
  const config = { ...FIREBASE_DEFAULTS, ...stored };
  // Older template synchronization added blank declarations. An unconfigured
  // optional push integration stays disabled and must not block an ERP update.
  if (config.ATLAS_FCM_ENABLED === '') config.ATLAS_FCM_ENABLED = 'false';
  if (!['true', 'false'].includes(config.ATLAS_FCM_ENABLED)) throw new Error('ATLAS_FCM_ENABLED must be true or false');
  if (config.ATLAS_FCM_ENABLED === 'false') return { enabled: false, directory };
  if (config.GOOGLE_APPLICATION_CREDENTIALS !== FIREBASE_DEFAULTS.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Installer expects GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase/service-account.json (container path)');
  }
  let credential;
  try {
    credential = JSON.parse(await fs.readFile(path.join(directory, 'service-account.json'), 'utf8'));
    if (credential.type !== 'service_account' || !credential.client_email || !credential.project_id
      || createPrivateKey(credential.private_key).asymmetricKeyType !== 'rsa') throw new Error();
  } catch {
    throw new Error('FCM requires a valid private service-account.json in the installer .secrets/firebase directory');
  }
  if (!config.FIREBASE_PROJECT_ID || config.FIREBASE_PROJECT_ID !== credential.project_id) {
    throw new Error('FIREBASE_PROJECT_ID must match the Firebase service account');
  }
  return { enabled: true, directory };
}

// Preparation only: does not start containers, migrate data, or send messages.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = process.argv[2];
  if (!envFile) throw new Error('Usage: node lib/firebase-config.mjs .env.external|.env.local');
  configureFirebase({ envFile: path.resolve(envFile) })
    .then(() => console.log('Firebase variables and credential directory prepared; no services restarted.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
