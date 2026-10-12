import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunlyDeviceClient } from '../native-device.js'

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
