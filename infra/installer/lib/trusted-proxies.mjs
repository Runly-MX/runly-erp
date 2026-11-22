// RUNLY_TRUSTED_PROXIES / RUNLY_MCP_TRUSTED_PROXIES: which hops may set
// X-Forwarded-For. The installer never invents or widens a value: it validates what
// the administrator already has, backs the env file up before a rewrite, and
// explains how to narrow a broad setting. Detection is advice, never authorization.
import fs from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';

export const TRUSTED_PROXY_KEYS = ['RUNLY_TRUSTED_PROXIES', 'RUNLY_MCP_TRUSTED_PROXIES'];
const SHORTCUTS = new Set(['private', 'loopback']);
const BACKUPS_KEPT = 5;

const stripIp = v => String(v).trim().replace(/^\[|\]$/g, '');

// Strict: every entry must be an IP, a CIDR with an in-range prefix or a shortcut.
export function validateProxyList(value = '') {
  const entries = String(value).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const invalid = [], broad = [];
  for (const entry of entries) {
    if (SHORTCUTS.has(entry)) { if (entry === 'private') broad.push(entry); continue; }
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(stripIp(address));
    const max = family === 6 ? 128 : 32;
    const bits = prefix === undefined ? max : /^\d{1,3}$/.test(prefix) ? Number(prefix) : NaN;
    if (!family || extra !== undefined || !Number.isInteger(bits) || bits > max) { invalid.push(entry); continue; }
    if (bits < (family === 6 ? 16 : 8)) broad.push(entry);
  }
  return { entries, invalid, broad, ok: invalid.length === 0 };
}

export function readEnvValue(text, key) {
  let value;
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^[\t ]*(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=(.*)$/);
    if (m && m[1] === key) value = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return value;
}

// Throws (before any container restarts) when a configured value is malformed.
export async function assertTrustedProxiesEnv(envFile, { log = console.info } = {}) {
  let text = '';
  try { text = await fs.readFile(envFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; return { ok: true }; }
  for (const key of TRUSTED_PROXY_KEYS) {
    const value = readEnvValue(text, key);
    if (value === undefined) continue;
    const result = validateProxyList(value);
    if (!result.ok) {
      throw new Error(`${key} contiene entradas invalidas: ${result.invalid.join(', ')}. Usa IPs, CIDR (10.0.0.0/8) o los atajos private/loopback. El archivo ${path.basename(envFile)} no se modifico; corrige el valor y vuelve a ejecutar.`);
    }
    if (result.broad.length) log(`[runly-proxies] ${key} confia en rangos amplios (${result.broad.join(', ')}). Funciona detras de nginx/Docker, pero si el servidor tiene otro proxy publico conviene reemplazarlo por su IP exacta. Ver docs/deployment/trusted-proxies.md`);
    if (!value.trim()) log(`[runly-proxies] ${key} esta vacio: la API usa la IP del socket (detras de un proxy todas las visitas compartirian cuota).`);
  }
  return { ok: true };
}

// Copies the env file to .runly-installer/env-backups/ only when its content changed
// since the last backup, so repeated runs stay idempotent. Returns the backup path.
export async function backupEnvFile(envFile, { root = path.dirname(envFile) } = {}) {
  let text;
  try { text = await fs.readFile(envFile); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const dir = path.join(root, '.runly-installer', 'env-backups'), name = path.basename(envFile);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const files = (await fs.readdir(dir)).filter(f => f.startsWith(`${name}.`)).sort();
  if (files.length && (await fs.readFile(path.join(dir, files.at(-1)))).equals(text)) return path.join(dir, files.at(-1));
  const target = path.join(dir, `${name}.${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.writeFile(target, text, { mode: 0o600 });
  for (const old of files.slice(0, Math.max(0, files.length + 1 - BACKUPS_KEPT))) await fs.unlink(path.join(dir, old));
  return target;
}

export async function restoreLatestEnvBackup(envFile, { root = path.dirname(envFile) } = {}) {
  const dir = path.join(root, '.runly-installer', 'env-backups'), name = path.basename(envFile);
  const files = (await fs.readdir(dir)).filter(f => f.startsWith(`${name}.`)).sort();
  if (!files.length) throw new Error('No hay respaldos de configuracion.');
  await fs.copyFile(path.join(dir, files.at(-1)), envFile);
  return path.join(dir, files.at(-1));
}
