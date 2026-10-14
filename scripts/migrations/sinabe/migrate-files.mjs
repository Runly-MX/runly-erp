// File access for migrate/verify: every byte goes through the throttled
// file-fetcher; the uploads listing (when given) pre-filters missing and
// oversize files so they are never requested. Issues are coded, never named.
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

// Dry-run check without transferring: listing first, else a local stat.
export async function probeFile(run, key) {
  if (run.listing) {
    const entry = run.listing.get(key)
    if (!entry) return { ok: false, reason: 'missing' }
    if (entry.size > run.maxFileBytes) return { ok: false, reason: 'oversize', size: entry.size }
    return { ok: true, size: entry.size }
  }
  if (run.filesDir) {
    try {
      const info = await stat(resolve(run.filesDir, key))
      if (info.size > run.maxFileBytes) return { ok: false, reason: 'oversize', size: info.size }
      return { ok: true, size: info.size }
    } catch { return { ok: false, reason: 'missing' } }
  }
  return { ok: true, size: null }
}

// -> { buffer, sha256, size } or null (missing / oversize / fetch error, all reported).
export async function fetchFile(run, key, entity, legacyId) {
  const { report } = run
  const probe = run.listing ? await probeFile(run, key) : { ok: true }
  if (!probe.ok) {
    if (probe.reason === 'missing') { report.file('missing'); report.warn('FILE_MISSING') } else { report.file('oversize'); report.conflict(entity, 'FILE_TOO_LARGE', legacyId) }
    return null
  }
  try {
    const result = await run.fetcher.fetch(key)
    report.file('transferred')
    report.file('bytes', result.size)
    const listed = run.listing?.get(key)
    if (listed && listed.size !== result.size) report.file('sizeMismatches')
    if (result.size > run.maxFileBytes) { report.file('oversize'); report.conflict(entity, 'FILE_TOO_LARGE', legacyId); return null }
    if (result.size === 0) { report.warn('FILE_EMPTY'); return null }
    return result
  } catch (error) {
    if (error.code === 'FILE_NOT_FOUND') { report.file('missing'); report.warn('FILE_MISSING'); return null }
    report.file('fetchErrors')
    report.error(entity, error.code ?? 'FILE_FETCH_FAILED', legacyId)
    return null
  }
}

// Dry-run accounting of a file that would be transferred.
export async function dryFile(run, key, entity, legacyId) {
  const probe = await probeFile(run, key)
  if (probe.ok) { run.report.file('transferred'); run.report.file('bytes', probe.size ?? 0); return true }
  if (probe.reason === 'missing') { run.report.file('missing'); run.report.warn('FILE_MISSING') } else { run.report.file('oversize'); run.report.conflict(entity, 'FILE_TOO_LARGE', legacyId) }
  return false
}

// Error code of an exception (LegacyImportError / Prisma / fetch), prefixed by entity.
export const errorCode = (prefix, error) => `${prefix}_${String(error?.code ?? 'ERROR').replace(/[^A-Z0-9_]/gi, '_').toUpperCase()}`
