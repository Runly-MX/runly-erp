import path from 'node:path';
import { lstat, realpath, readdir } from 'node:fs/promises';
import { inputError } from './recovery-config.mjs';

export async function assertNoLinks(target) {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await lstat(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw inputError('No se pudo revisar la ruta de recuperación.');
    }
    if (stat.isSymbolicLink()) throw inputError('La ruta no puede contener enlaces simbólicos ni junctions.');
    const canonical = await realpath(current);
    const compare = (s) => process.platform === 'win32' ? s.toLowerCase() : s;
    if (compare(canonical) !== compare(current)) throw inputError('La ruta redirige fuera de su ubicación declarada.');
  }
  return absolute;
}

export async function validateOutputPath(target) {
  if (!target || target.split(/[\\/]/).includes('..')) throw inputError('Usa una carpeta nueva sin segmentos ..');
  const absolute = await assertNoLinks(target);
  if (absolute === path.parse(absolute).root || /[,\r\n\0]/.test(absolute)) throw inputError('Destino de recuperación no permitido.');
  let existing;
  try { existing = await lstat(absolute); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) throw inputError('El destino debe ser una carpeta nueva que todavía no exista.');
  const parent = await lstat(path.dirname(absolute)).catch(() => null);
  if (!parent?.isDirectory()) throw inputError('Crea primero la carpeta padre del destino.');
  return absolute;
}

export function validateSnapshotNodes(nodes, { windows = process.platform === 'win32' } = {}) {
  const seen = new Map();
  for (const node of nodes) {
    if (!node || typeof node.path !== 'string' || !['file', 'dir'].includes(node.type) || node.linktarget) {
      throw inputError('El snapshot contiene enlaces o tipos de archivo no admitidos.');
    }
    const parts = node.path.split('/').filter(Boolean);
    if (!node.path.startsWith('/') || (node.path === '/' && node.type !== 'dir') ||
      (node.path !== '/' && node.path.endsWith('/')) ||
      path.posix.normalize(node.path) !== node.path || /[\\\x00-\x1f\x7f]/.test(node.path) || node.path.includes('//') ||
      parts.some(p => p === '..' || p === '.' || p.startsWith('.runly-recovery-'))) {
      throw inputError('El snapshot contiene una ruta insegura.');
    }
    if (windows && parts.some(p => /[:<>"|?*]/.test(p) || /[. ]$/.test(p) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
      throw inputError('Una ruta del snapshot no puede representarse de forma segura en Windows; usa un destino Linux.');
    }
    const key = windows ? node.path.toLowerCase() : node.path;
    if (seen.has(key)) throw inputError('El snapshot contiene rutas duplicadas o incompatibles con el destino.');
    seen.set(key, node.type);
  }
  for (const [key] of seen) {
    let parent = path.posix.dirname(key);
    while (parent !== '/') {
      if (seen.get(parent) === 'file') throw inputError('Una ruta del snapshot atraviesa un archivo.');
      parent = path.posix.dirname(parent);
    }
  }
}

export async function assertSafeTree(root) {
  await assertNoLinks(root);
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink() || (!item.isFile() && !item.isDirectory())) throw inputError('La extracción contiene enlaces o archivos especiales.');
      if (item.isDirectory()) await visit(path.join(directory, item.name));
    }
  }
  await visit(root);
}
