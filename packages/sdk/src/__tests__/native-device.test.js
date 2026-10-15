import test from 'node:test'
import assert from 'node:assert/strict'
import { bluetoothErrorCode, bytesToBase64, createRunlyDeviceClient } from '../native-device.js'

test('device client fails clearly outside the native Android host', () => {
  assert.throws(() => createRunlyDeviceClient({ scope: {} }).status(), /Android/)
})

test('device client forwards named operations without exposing arbitrary native commands', async () => {
  const calls = []
  const scope = { __RUNLY_DEVICE__: Object.fromEntries(['status', 'requestPermission', 'openSettings', 'pairedBluetoothDevices', 'readNfcTag', 'stopNfcReader'].map((name) => [name, (...args) => { calls.push([name, ...args]); return Promise.resolve({}) }])) }
  const client = createRunlyDeviceClient({ scope })
  await client.status()
  await client.permissions.request('camera')
  await client.permissions.openSettings('bluetooth')
  await client.bluetooth.pairedDevices()
  await client.nfc.readTag()
  await client.nfc.stop()
  assert.deepEqual(calls.map(([name]) => name), ['status', 'requestPermission', 'openSettings', 'pairedBluetoothDevices', 'readNfcTag', 'stopNfcReader'])
  assert.equal(client.invoke, undefined)
})

test('bluetooth.print reports unsupported outside the host and on older APKs', async () => {
  assert.deepEqual(await createRunlyDeviceClient({ scope: {} }).bluetooth.print('00:11:22:33:44:55', '^XA^XZ'), { ok: false, code: 'unsupported', error: null })
  const old = createRunlyDeviceClient({ scope: { __RUNLY_DEVICE__: { status: () => ({}) } } })
  assert.equal((await old.bluetooth.print('00:11:22:33:44:55', '^XA^XZ')).code, 'unsupported')
})

test('bluetooth.print validates input, sends base64 and maps native errors', async () => {
  const calls = []
  let reject = null
  const scope = { __RUNLY_DEVICE__: { printBluetoothRaw: async (address, data) => { calls.push([address, data]); if (reject) throw new Error(reject); return { bytes: 6 } } } }
  const client = createRunlyDeviceClient({ scope })
  assert.equal((await client.bluetooth.print('nope', '^XA^XZ')).code, 'invalid_address')
  assert.equal((await client.bluetooth.print('00:11:22:33:44:55', '')).code, 'invalid_data')
  assert.deepEqual(await client.bluetooth.print('aa:bb:cc:dd:ee:ff', '^XA^XZ'), { ok: true, bytes: 6 })
  assert.deepEqual(calls[0], ['AA:BB:CC:DD:EE:FF', Buffer.from('^XA^XZ').toString('base64')])
  await client.bluetooth.print('AA:BB:CC:DD:EE:FF', new Uint8Array([1, 2, 3]))
  assert.equal(calls[1][1], 'AQID')
  for (const [raw, code] of [['BLUETOOTH_PERMISSION_REQUIRED', 'permission_denied'], ['BLUETOOTH_NOT_PAIRED', 'not_paired'], ['BLUETOOTH_CONNECT_FAILED', 'connect_failed'], ['BLUETOOTH_TIMEOUT', 'timeout'], ['UNSUPPORTED_DEVICE_ACTION', 'unsupported'], ['boom', 'write_failed']]) {
    reject = raw
    assert.equal((await client.bluetooth.print('AA:BB:CC:DD:EE:FF', 'x')).code, code)
  }
})

test('bytesToBase64 chunks large payloads without changing the result', () => {
  const bytes = new Uint8Array(70_001).map((_, i) => i % 256)
  const expected = Buffer.from(bytes).toString('base64')
  assert.equal(bytesToBase64(bytes), expected)
  assert.equal(bytesToBase64(bytes, 7), expected)
  assert.equal(bluetoothErrorCode({ message: 'x BLUETOOTH_BUSY' }), 'busy')
})
