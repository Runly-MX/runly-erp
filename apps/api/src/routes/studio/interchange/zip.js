import yauzl from 'yauzl'
import JSZip from 'jszip'
import { crc32 } from 'node:zlib'
import { StudioError } from '../../../../../shared/studio/document.js'

export const PACKAGE_MIME = 'application/vnd.runly.studio+zip'
export const PACKAGE_LIMITS = Object.freeze({ compressed: 64 * 1024 * 1024, expanded: 128 * 1024 * 1024, entry: 10 * 1024 * 1024, entries: 256, ratio: 200, folders: 32, depth: 3 })
export const invalidPackage = message => new StudioError(message ?? 'El paquete Studio no es válido.', 400, 'STUDIO_PACKAGE_INVALID')
export const shaPattern = /^[a-f0-9]{64}$/

// No extraction to disk. Bounds are checked before opening a decompressor.
export async function readPackageZip(bytes) {
  const L = PACKAGE_LIMITS
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > L.compressed || bytes.readUInt32LE(0) !== 0x04034b50) throw invalidPackage()
  const end = bytes.length - 22
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20) || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)) throw invalidPackage()
  const count = bytes.readUInt16LE(end + 10), directory = bytes.readUInt32LE(end + 16)
  if (!count || count > L.entries || directory + bytes.readUInt32LE(end + 12) !== end) throw invalidPackage()
  const zip = await new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => error ? reject(invalidPackage()) : resolve(zip)))
  const files = new Map(), names = new Map(), folders = new Set()
  let expanded = 0, offset = 0, seen = 0
  try {
    await new Promise((resolve, reject) => {
      const fail = () => { zip.close(); reject(invalidPackage()) }
      zip.on('error', fail); zip.on('end', resolve)
      zip.on('entry', entry => {
        void (async () => {
          const name = entry.fileName, isDirectory = name.endsWith('/'), key = isDirectory ? name.slice(0, -1) : name, parts = key.split('/'), mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (++seen > count || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(key) || (isDirectory && (!['assets','previews','licenses'].includes(key) || entry.uncompressedSize !== 0)) || parts.some(p => !p || p === '.' || p === '..') || parts.length > L.depth || names.has(key.toLowerCase()) || (mode && mode !== (isDirectory ? 0x4000 : 0x8000)) || (entry.externalFileAttributes & 0xffff & ~(isDirectory ? 0x31 : 0x21)) || entry.generalPurposeBitFlag & ~0x800 || ![0, 8].includes(entry.compressionMethod) || entry.versionNeededToExtract > 20 || entry.uncompressedSize > L.entry || entry.uncompressedSize > Math.max(1, entry.compressedSize) * L.ratio) throw invalidPackage()
          names.set(key.toLowerCase(), isDirectory ? 'directory' : 'file')
          for (let i = 1; i < parts.length; i++) { const folder = parts.slice(0, i).join('/').toLowerCase(); if (names.has(folder) && names.get(folder) !== 'directory') throw invalidPackage(); folders.add(folder) }
          if ((!isDirectory && folders.has(key.toLowerCase())) || folders.size > L.folders || (expanded += entry.uncompressedSize) > L.expanded || entry.relativeOffsetOfLocalHeader !== offset) throw invalidPackage()
          const pos = offset, nameBytes = Buffer.from(name)
          if (pos + 30 > directory || bytes.readUInt32LE(pos) !== 0x04034b50 || bytes.readUInt16LE(pos + 6) !== entry.generalPurposeBitFlag || bytes.readUInt16LE(pos + 8) !== entry.compressionMethod || bytes.readUInt32LE(pos + 14) !== entry.crc32 || bytes.readUInt32LE(pos + 18) !== entry.compressedSize || bytes.readUInt32LE(pos + 22) !== entry.uncompressedSize || bytes.readUInt16LE(pos + 26) !== nameBytes.length || !bytes.subarray(pos + 30, pos + 30 + nameBytes.length).equals(nameBytes)) throw invalidPackage()
          offset = pos + 30 + nameBytes.length + bytes.readUInt16LE(pos + 28) + entry.compressedSize
          if (offset > directory || (seen === 1 && (name !== 'mimetype' || entry.compressionMethod !== 0 || bytes.readUInt16LE(pos + 28)))) throw invalidPackage()
          const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)))
          const chunks = []; let size = 0
          for await (const chunk of stream) { size += chunk.length; if (size > entry.uncompressedSize || size > L.entry) { stream.destroy(); throw invalidPackage() }; chunks.push(chunk) }
          if (size !== entry.uncompressedSize) throw invalidPackage()
          const content = Buffer.concat(chunks)
          if (crc32(content) !== entry.crc32) throw invalidPackage()
          if (!isDirectory) files.set(name, content); zip.readEntry()
        })().catch(fail)
      })
      zip.readEntry()
    })
    if (seen !== count || offset !== directory || files.get('mimetype')?.toString() !== PACKAGE_MIME) throw invalidPackage()
    return files
  } finally { zip.close() }
}

export async function writePackageZip(entries) {
  const zip = new JSZip()
  for (const [name, bytes] of entries) zip.file(name, bytes, { compression: 'STORE', createFolders: false, date: new Date('2000-01-01T00:00:00Z'), unixPermissions: 0o100644 })
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE', platform: 'UNIX' })
  if (bytes.length > PACKAGE_LIMITS.compressed) throw new StudioError('El paquete supera 64 MiB.', 413)
  return bytes
}
