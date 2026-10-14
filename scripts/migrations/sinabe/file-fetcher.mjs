// Fetches sinabe upload files one by one, either from a local staging folder
// or over sinabe's own nginx (`<baseUrl>/<key>`, e.g. https://host.example/api/uploads),
// with a bandwidth cap, low concurrency and no aggressive retries.
//
// createFileFetcher(opts).fetch(key) -> Promise<{ buffer, sha256, size }>
// Errors carry a `code`: FILE_BAD_KEY | FILE_NOT_FOUND | FILE_HTTP_ERROR | FILE_FETCH_FAILED.
// Error messages never include the key (file names are private data).
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export class FileFetchError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

export function createFileFetcher({
  mode = 'local', dir = null, baseUrl = null, bytesPerSecond = 0, concurrency = 1, pauseMs = 0,
  timeoutMs = 120_000, fetchImpl = globalThis.fetch,
} = {}) {
  if (mode === 'local' && !dir) throw new Error('createFileFetcher: local mode needs dir')
  if (mode === 'http' && !baseUrl) throw new Error('createFileFetcher: http mode needs baseUrl')
  if (mode !== 'local' && mode !== 'http') throw new Error(`createFileFetcher: unknown mode ${mode}`)
  const root = dir ? resolve(dir) : null
  const limit = Math.max(1, Math.min(2, Math.floor(concurrency) || 1))
  const stats = { files: 0, bytes: 0, retries: 0, failures: 0 }
  let active = 0
  const waiters = []
  let nextFreeAt = 0 // bandwidth budget: earliest time the next transfer may start

  const acquire = async () => {
    if (active >= limit) await new Promise((r) => waiters.push(r))
    active++
  }
  const release = () => { active--; waiters.shift()?.() }
  const throttle = async () => {
    const wait = nextFreeAt - Date.now()
    if (wait > 0) await sleep(wait)
    if (pauseMs > 0) nextFreeAt = Math.max(nextFreeAt, Date.now() + pauseMs)
  }
  const charge = (bytes) => {
    if (bytesPerSecond > 0) nextFreeAt = Math.max(nextFreeAt, Date.now()) + (bytes / bytesPerSecond) * 1000
  }

  const fetchLocal = async (key) => {
    const full = resolve(root, key)
    if (!full.startsWith(root + sep)) throw new FileFetchError('FILE_BAD_KEY')
    try {
      return await readFile(full)
    } catch (error) {
      if (error.code === 'ENOENT') throw new FileFetchError('FILE_NOT_FOUND')
      throw new FileFetchError('FILE_FETCH_FAILED', error.code ?? 'io')
    }
  }
  const fetchHttpOnce = async (key) => {
    const url = `${baseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
    let response
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      throw new FileFetchError('FILE_FETCH_FAILED', error.name ?? 'network')
    }
    if (response.status === 404) throw new FileFetchError('FILE_NOT_FOUND')
    if (!response.ok) throw new FileFetchError('FILE_HTTP_ERROR', String(response.status))
    return Buffer.from(await response.arrayBuffer())
  }
  const fetchHttp = async (key) => {
    try {
      return await fetchHttpOnce(key)
    } catch (error) {
      if (error.code === 'FILE_NOT_FOUND') throw error
      stats.retries++
      await sleep(Math.max(1000, pauseMs))
      return fetchHttpOnce(key)
    }
  }

  const fetch = async (key) => {
    if (!key || key.includes('..')) throw new FileFetchError('FILE_BAD_KEY')
    await acquire()
    try {
      await throttle()
      const buffer = mode === 'local' ? await fetchLocal(key) : await fetchHttp(key)
      charge(buffer.length)
      stats.files++; stats.bytes += buffer.length
      return { buffer, sha256: sha256(buffer), size: buffer.length }
    } catch (error) {
      stats.failures++
      throw error
    } finally {
      release()
    }
  }

  return { fetch, stats, pause: () => (pauseMs > 0 ? sleep(pauseMs) : Promise.resolve()) }
}
