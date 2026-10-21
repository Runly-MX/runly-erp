import test from 'node:test'
import assert from 'node:assert/strict'
import { checkAndroidElf } from '../check-android-apk.mjs'

function elf({ alignment = 16384n, relroSize = 16384n, loadSize = 32768n } = {}) {
  const buffer = Buffer.alloc(64 + 56 * 2)
  buffer.writeUInt32BE(0x7f454c46)
  buffer[4] = 2
  buffer[5] = 1
  buffer.writeBigUInt64LE(64n, 32)
  buffer.writeUInt16LE(56, 54)
  buffer.writeUInt16LE(2, 56)
  buffer.writeUInt32LE(1, 64)
  buffer.writeUInt32LE(6, 68)
  buffer.writeBigUInt64LE(loadSize, 64 + 40)
  buffer.writeBigUInt64LE(alignment, 64 + 48)
  buffer.writeUInt32LE(0x6474e552, 120)
  buffer.writeBigUInt64LE(relroSize, 120 + 40)
  return buffer
}

test('rejects the 4 KB native-library alignment shipped in Android 1.2.3', () => {
  assert.throws(() => checkAndroidElf(elf({ alignment: 4096n }), 'runly.so'), /LOAD segments/)
})

test('accepts 16 KB alignment and rejects RELRO overlapping writable data', () => {
  assert.doesNotThrow(() => checkAndroidElf(elf(), 'runly.so'))
  assert.throws(() => checkAndroidElf(elf({ relroSize: 4096n }), 'runly.so'), /RELRO/)
  assert.doesNotThrow(() => checkAndroidElf(elf({ relroSize: 4096n, loadSize: 4096n }), 'runly.so'))
})

test('rejects malformed native-library headers', () => {
  assert.throws(() => checkAndroidElf(Buffer.alloc(2), 'runly.so'), /ELF64/)
})
