import yauzl from 'yauzl'
import { crc32 } from 'node:zlib'
import { packageError } from './errors.js'
import { resolveLimits } from './limits.js'

export const shaPattern = /^[a-f0-9]{64}$/

// Hardened ZIP reader shared by the Studio package and the Website template.
// Nothing is extracted to disk and no decompressor is opened before the bounds
// are checked. Every failure is a PackageError with a stable `reason`.
//   mimetype  exact content of the mandatory first, stored entry
//   folders   the only directories an archive may declare
export async function readZip(input, { mimetype, folders, limits: overrides } = {}) {
  const L = resolveLimits(overrides)
  if (!(input instanceof Uint8Array)) throw new TypeError('BYTES_MUST_BE_UINT8ARRAY')
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (bytes.length > L.compressed) throw packageError('zip_limit_exceeded', 'El paquete supera el tamaño máximo permitido.')
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw packageError('zip_invalid')
  const end = bytes.length - 22
  if (bytes.readUInt32LE(end) !== 0x06054b50) throw packageError('zip_invalid')
  // A trailing comment, multi-disk archives and ZIP64 markers are not accepted.
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20) || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)) throw packageError('zip_unsafe_entry', 'El archivo ZIP usa estructuras no permitidas.')
  const count = bytes.readUInt16LE(end + 10), directory = bytes.readUInt32LE(end + 16)
  if (!count || directory + bytes.readUInt32LE(end + 12) !== end) throw packageError('zip_invalid')
  if (count > L.entries) throw packageError('zip_limit_exceeded', 'El paquete tiene demasiadas entradas.')
  const zip = await new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, opened) => (error ? reject(packageError('zip_invalid')) : resolve(opened))))
  const files = new Map(), names = new Map(), seenFolders = new Set()
  let expanded = 0, offset = 0, seen = 0
  try {
    await new Promise((resolve, reject) => {
      // yauzl's strict file names already refuse traversal, absolute and odd paths: those are "unsafe", not "corrupt".
      const unsafe = /relative path|absolute path|invalid characters in fileName/i
      const fail = (error) => { zip.close(); reject(error?.reason ? error : unsafe.test(String(error?.message)) ? packageError('zip_unsafe_entry', 'El paquete contiene una ruta no permitida.') : packageError('zip_invalid')) }
      zip.on('error', fail); zip.on('end', resolve)
      zip.on('entry', (entry) => {
        void (async () => {
          const name = entry.fileName, isDirectory = name.endsWith('/'), key = isDirectory ? name.slice(0, -1) : name, parts = key.split('/')
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (++seen > count) throw packageError('zip_invalid')
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(key) || parts.some((p) => !p || p === '.' || p === '..')) throw packageError('zip_unsafe_entry', 'El paquete contiene una ruta no permitida.')
          if (isDirectory && (!folders.includes(key) || entry.uncompressedSize !== 0)) throw packageError('zip_unsafe_entry', 'El paquete contiene una carpeta no permitida.')
          if (parts.length > L.depth) throw packageError('zip_limit_exceeded', 'El paquete anida demasiadas carpetas.')
          if (names.has(key.toLowerCase())) throw packageError('zip_unsafe_entry', 'El paquete repite una ruta.')
          if ((mode && mode !== (isDirectory ? 0x4000 : 0x8000)) || (entry.externalFileAttributes & 0xffff & ~(isDirectory ? 0x31 : 0x21))) throw packageError('zip_unsafe_entry', 'El paquete contiene enlaces o atributos no permitidos.')
          // Bit 0x800 (UTF-8 names) is the only general flag allowed: encryption (0x1) and data descriptors (0x8) are not.
          if (entry.generalPurposeBitFlag & ~0x800) throw packageError('zip_unsafe_entry', 'El paquete usa cifrado o descriptores de datos no permitidos.')
          if (![0, 8].includes(entry.compressionMethod) || entry.versionNeededToExtract > 20) throw packageError('zip_unsafe_entry', 'El paquete usa un método de compresión no permitido.')
          if (entry.uncompressedSize > L.entry) throw packageError('zip_limit_exceeded', 'Una entrada del paquete es demasiado grande.')
          if (entry.uncompressedSize > Math.max(1, entry.compressedSize) * L.ratio) throw packageError('zip_limit_exceeded', 'La razón de compresión del paquete no es segura.')
          names.set(key.toLowerCase(), isDirectory ? 'directory' : 'file')
          for (let i = 1; i < parts.length; i++) {
            const folder = parts.slice(0, i).join('/').toLowerCase()
            if (names.has(folder) && names.get(folder) !== 'directory') throw packageError('zip_unsafe_entry')
            seenFolders.add(folder)
          }
          if (!isDirectory && seenFolders.has(key.toLowerCase())) throw packageError('zip_unsafe_entry')
          if (seenFolders.size > L.folders) throw packageError('zip_limit_exceeded', 'El paquete declara demasiadas carpetas.')
          if ((expanded += entry.uncompressedSize) > L.expanded) throw packageError('zip_limit_exceeded', 'El paquete se expande por encima del límite.')
          if (entry.relativeOffsetOfLocalHeader !== offset) throw packageError('zip_invalid')
          const pos = offset, nameBytes = Buffer.from(name)
          if (pos + 30 > directory || bytes.readUInt32LE(pos) !== 0x04034b50 || bytes.readUInt16LE(pos + 6) !== entry.generalPurposeBitFlag || bytes.readUInt16LE(pos + 8) !== entry.compressionMethod || bytes.readUInt32LE(pos + 14) !== entry.crc32 || bytes.readUInt32LE(pos + 18) !== entry.compressedSize || bytes.readUInt32LE(pos + 22) !== entry.uncompressedSize || bytes.readUInt16LE(pos + 26) !== nameBytes.length || !bytes.subarray(pos + 30, pos + 30 + nameBytes.length).equals(nameBytes)) throw packageError('zip_invalid')
          offset = pos + 30 + nameBytes.length + bytes.readUInt16LE(pos + 28) + entry.compressedSize
          if (offset > directory || (seen === 1 && (name !== 'mimetype' || entry.compressionMethod !== 0 || bytes.readUInt16LE(pos + 28)))) throw packageError('zip_invalid')
          const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, opened) => (error ? reject(error) : resolve(opened))))
          const chunks = []
          let size = 0
          for await (const chunk of stream) {
            size += chunk.length
            if (size > entry.uncompressedSize || size > L.entry) { stream.destroy(); throw packageError('zip_limit_exceeded', 'Una entrada del paquete es demasiado grande.') }
            chunks.push(chunk)
          }
          if (size !== entry.uncompressedSize) throw packageError('zip_invalid')
          const content = Buffer.concat(chunks)
          if (crc32(content) !== entry.crc32) throw packageError('zip_invalid')
          if (!isDirectory) files.set(name, content)
          zip.readEntry()
        })().catch(fail)
      })
      zip.readEntry()
    })
    if (seen !== count || offset !== directory || files.get('mimetype')?.toString() !== mimetype) throw packageError('zip_invalid', 'El archivo no es un paquete de este formato.')
    return files
  } finally { zip.close() }
}
