// Large lesson videos as HLS packages. Storage caps each object at 50 MB, so a
// video over that is remuxed in the browser (ffmpeg.wasm, lossless `-c copy`)
// into ~6 s .ts segments plus index.m3u8, and each piece is uploaded with its
// own signed URL. No imports on purpose: ffmpeg and the SDK calls are injected,
// so the pure helpers run under `node --test`.

const MB = 1024 * 1024
export const DIRECT_MAX_BYTES = 50 * MB
export const PACKAGE_MAX_BYTES = 2 * 1024 * MB
export const SEGMENT_MAX_BYTES = 50 * MB
export const UPLOAD_CONCURRENCY = 3
export const HLS_TIME_SECONDS = 6

export const UNSUPPORTED_CODEC = 'Este video usa un formato que no se puede preparar en el navegador. Expórtalo como MP4 (H.264) e inténtalo de nuevo.'
export const PACKAGE_TOO_BIG = 'El video supera 2 GB.'
export const SEGMENT_TOO_BIG = 'El video tiene fragmentos de más de 50 MB (muy pocos fotogramas clave). Expórtalo como MP4 (H.264) e inténtalo de nuevo.'
export const CANCELLED = 'Subida cancelada.'

const VIDEO_CODECS = new Set(['h264', 'hevc'])
const COPY_AUDIO = new Set(['aac', 'mp3'])

export function cancelledError() {
  const error = new Error(CANCELLED)
  error.name = 'AbortError'
  return error
}

export const isCancelled = (error) => error?.name === 'AbortError'

// 'direct' up to 50 MB, 'package' up to 2 GB.
export function chooseUploadPath(sizeBytes) {
  const size = Number(sizeBytes)
  if (!Number.isFinite(size) || size <= 0) throw new Error('El archivo de video está vacío.')
  if (size <= DIRECT_MAX_BYTES) return 'direct'
  if (size <= PACKAGE_MAX_BYTES) return 'package'
  throw new Error(PACKAGE_TOO_BIG)
}

// Codecs and duration from `ffmpeg -i <input>` log output.
export function parseProbeLog(text) {
  const lines = String(text).split('\n')
  const codec = (kind) => {
    const line = lines.find((l) => new RegExp(`Stream #\\d+:\\d+.*: ${kind}: `).test(l) && !/attached pic/.test(l))
    return line ? line.split(`${kind}: `)[1].trim().split(/[\s,(]/)[0].toLowerCase() : null
  }
  const match = String(text).match(/Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)
  const durationSeconds = match ? Math.round(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) : null
  return { video: codec('Video'), audio: codec('Audio'), durationSeconds: durationSeconds || null }
}

export function assertRemuxable(probe) {
  if (!probe?.video || !VIDEO_CODECS.has(probe.video)) throw new Error(UNSUPPORTED_CODEC)
}

// First video + first audio stream; video always copied, audio copied when the
// TS container and hls.js take it as-is, otherwise re-encoded to AAC.
export function remuxArgs(inputPath, { audio = null } = {}) {
  const audioArgs = !audio ? [] : COPY_AUDIO.has(audio) ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k']
  return [
    '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'copy', ...audioArgs,
    '-f', 'hls', '-hls_time', String(HLS_TIME_SECONDS), '-hls_playlist_type', 'vod', '-hls_list_size', '0',
    '-hls_segment_filename', 'seg_%05d.ts', 'index.m3u8',
  ]
}

// ffmpeg progress event -> 0..1. `time` is in microseconds.
export function remuxProgress({ progress, time } = {}, durationSeconds = null) {
  let value = Number(durationSeconds) > 0 && Number(time) > 0 ? Number(time) / 1e6 / Number(durationSeconds) : Number(progress)
  if (!Number.isFinite(value)) value = 0
  return Math.min(1, Math.max(0, value))
}

export function manifestSegmentNames(manifestText) {
  return String(manifestText).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

export function manifestDurationSeconds(manifestText) {
  let total = 0
  for (const match of String(manifestText).matchAll(/^#EXTINF:([\d.]+)/gm)) total += Number(match[1]) || 0
  return total > 0 ? Math.round(total) : null
}

// Overall upload progress by bytes finished.
export function createByteProgress(totalBytes, onProgress) {
  let done = 0
  return {
    add(bytes) {
      done += Number(bytes) || 0
      const value = totalBytes > 0 ? Math.min(1, done / totalBytes) : 1
      onProgress?.(value)
      return value
    },
  }
}

// Runs worker over items, at most `limit` at once; stops on the first error.
export async function runPool(items, limit, worker, { signal } = {}) {
  const results = new Array(items.length)
  let next = 0
  let failed = false
  async function lane() {
    while (!failed && next < items.length) {
      if (signal?.aborted) throw cancelledError()
      const index = next++
      try {
        results[index] = await worker(items[index], index)
      } catch (error) { failed = true; throw error }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return results
}

// Remuxes `file` into an HLS package in memory. `loadFfmpeg` is @runly/ui's.
// Resolves { manifestText, segments: [{ name, blob }], durationSeconds }.
export async function packageVideoAsHls(file, { loadFfmpeg, onProgress, signal } = {}) {
  if (signal?.aborted) throw cancelledError()
  const { ffmpeg, fetchFile } = await loadFfmpeg()
  const onAbort = () => ffmpeg.terminate()
  signal?.addEventListener('abort', onAbort, { once: true })
  let log = ''
  ffmpeg.on('log', ({ message }) => { log += `${message}\n` })
  try {
    let input = '/input/' + file.name
    try {
      await ffmpeg.createDir('/input')
      await ffmpeg.mount('WORKERFS', { files: [file] }, '/input')
    } catch {
      // No WORKERFS in this core: copy the file into memory instead.
      input = 'input.' + (file.name.split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 8)
      await ffmpeg.writeFile(input, await fetchFile(file))
    }

    await ffmpeg.exec(['-hide_banner', '-i', input])
    const probe = parseProbeLog(log)
    assertRemuxable(probe)

    ffmpeg.on('progress', (event) => onProgress?.(remuxProgress(event, probe.durationSeconds)))
    const code = await ffmpeg.exec(remuxArgs(input, probe))
    if (code !== 0) throw new Error(UNSUPPORTED_CODEC)

    const manifestText = new TextDecoder().decode(await ffmpeg.readFile('index.m3u8'))
    const names = manifestSegmentNames(manifestText)
    if (!names.length) throw new Error(UNSUPPORTED_CODEC)
    const segments = []
    for (const name of names) {
      const data = await ffmpeg.readFile(name)
      if (data.byteLength > SEGMENT_MAX_BYTES) throw new Error(SEGMENT_TOO_BIG)
      segments.push({ name, blob: new Blob([data], { type: 'video/mp2t' }) })
      await ffmpeg.deleteFile(name) // frees worker memory as we go
    }
    onProgress?.(1)
    return { manifestText, segments, durationSeconds: manifestDurationSeconds(manifestText) ?? probe.durationSeconds }
  } catch (error) {
    if (signal?.aborted) throw cancelledError()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    ffmpeg.terminate()
  }
}

async function put(url, blob, contentType, { signal, fetchImpl, failMessage }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response = null
    try {
      response = await fetchImpl(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: await blob.arrayBuffer(), signal })
    } catch (error) {
      if (signal?.aborted) throw cancelledError()
      if (attempt) throw new Error(failMessage)
      continue
    }
    if (response.ok) return
    if (response.status < 500 || attempt) throw new Error(failMessage)
  }
}

const unwrap = (response) => response?.data ?? response

// presign -> PUT segments (3 at a time) -> PUT manifest -> confirm.
// onProgress receives 0..1 over all bytes; onStage 'uploading' | 'confirming'.
export async function uploadHlsPackage(pkg, { fileName, sourceBytes, presign, confirm, onProgress, onStage, signal, fetchImpl = fetch }) {
  const manifestBlob = new Blob([pkg.manifestText], { type: 'application/vnd.apple.mpegurl' })
  const totalBytes = pkg.segments.reduce((sum, s) => sum + s.blob.size, 0) + manifestBlob.size
  const presigned = unwrap(await presign({
    fileName,
    sourceBytes,
    durationSeconds: pkg.durationSeconds,
    segments: pkg.segments.map((s) => ({ name: s.name, sizeBytes: s.blob.size })),
    manifestBytes: manifestBlob.size,
  }))
  const urls = new Map((presigned.segmentUploadUrls ?? []).map((s) => [s.name, s.uploadUrl]))
  const progress = createByteProgress(totalBytes, onProgress)
  const options = { signal, fetchImpl, failMessage: 'No se pudo subir el video.' }

  onStage?.('uploading')
  onProgress?.(0)
  await runPool(pkg.segments, UPLOAD_CONCURRENCY, async (segment) => {
    const url = urls.get(segment.name)
    if (!url) throw new Error('No se pudo preparar la subida del video.')
    await put(url, segment.blob, 'video/mp2t', options)
    progress.add(segment.blob.size)
  }, { signal })
  await put(presigned.manifestUploadUrl, manifestBlob, 'application/vnd.apple.mpegurl', options)
  progress.add(manifestBlob.size)

  if (signal?.aborted) throw cancelledError()
  onStage?.('confirming')
  const confirmed = unwrap(await confirm(presigned.fileId))
  return {
    fileId: confirmed?.fileId ?? presigned.fileId,
    fileName: confirmed?.fileName ?? fileName,
    durationSeconds: confirmed?.durationSeconds ?? pkg.durationSeconds ?? null,
  }
}
