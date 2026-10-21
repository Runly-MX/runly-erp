import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const PAGE_SIZE = 16384n

export function checkAndroidElf(buffer, name) {
  if (buffer.length < 64 || buffer.readUInt32BE(0) !== 0x7f454c46 || buffer[4] !== 2 || buffer[5] !== 1) {
    throw new Error(`${name}: expected a little-endian ELF64 library`)
  }
  const offset = Number(buffer.readBigUInt64LE(32))
  const size = buffer.readUInt16LE(54)
  const count = buffer.readUInt16LE(56)
  if (size < 56 || offset + size * count > buffer.length) throw new Error(`${name}: invalid ELF headers`)
  const segments = []
  for (let i = 0; i < count; i++) {
    const at = offset + i * size
    segments.push({
      type: buffer.readUInt32LE(at),
      flags: buffer.readUInt32LE(at + 4),
      address: buffer.readBigUInt64LE(at + 16),
      memorySize: buffer.readBigUInt64LE(at + 40),
      alignment: buffer.readBigUInt64LE(at + 48),
    })
  }
  const loads = segments.filter((segment) => segment.type === 1)
  if (!loads.length || loads.some((segment) => segment.alignment < PAGE_SIZE)) {
    throw new Error(`${name}: LOAD segments are not 16 KB aligned; rebuild the native library`)
  }
  for (const relro of segments.filter((segment) => segment.type === 0x6474e552)) {
    const end = relro.address + relro.memorySize
    const protectedEnd = ((end + PAGE_SIZE - 1n) / PAGE_SIZE) * PAGE_SIZE
    // RELRO can include padding beyond its LOAD segment. That is safe if
    // no writable data in any LOAD segment occupies that padding's page.
    if (protectedEnd > end && loads.some((load) => (load.flags & 2) && load.address < protectedEnd && load.address + load.memorySize > end)) {
      throw new Error(`${name}: RELRO overlaps writable data on 16 KB devices`)
    }
  }
}

export async function checkAndroidApk(apkPath) {
  const zip = await JSZip.loadAsync(readFileSync(apkPath))
  const libraries = Object.values(zip.files).filter((entry) => /^lib\/(arm64-v8a|x86_64)\/[^/]+\.so$/.test(entry.name))
  if (!libraries.some((entry) => entry.name.endsWith('/librunly_erp_lib.so'))) throw new Error('APK is missing the Runly native library')
  for (const library of libraries) checkAndroidElf(await library.async('nodebuffer'), library.name)
  return libraries.map((entry) => entry.name)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/check-android-apk.mjs <apk>')
  const libraries = await checkAndroidApk(process.argv[2])
  console.log(`Android 16 KB: ${libraries.length} native libraries verified`)
}
