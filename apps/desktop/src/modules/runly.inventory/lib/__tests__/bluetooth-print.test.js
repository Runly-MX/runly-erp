import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bluetoothErrorMessage, ensureBluetoothReady, normalizeBluetoothAddress, testLabelZpl } from '../bluetooth-print.js'

const device = (bluetooth, after = bluetooth) => {
  const calls = []
  return { calls, status: async () => ({ bluetooth }), permissions: { request: async (name) => { calls.push(name); return { bluetooth: after } } } }
}

describe('bluetooth printing helpers', () => {
  it('maps every error code to a precise Spanish message', () => {
    assert.match(bluetoothErrorMessage('permission_denied'), /permiso de Bluetooth/)
    assert.match(bluetoothErrorMessage('not_paired'), /no está emparejada/)
    assert.match(bluetoothErrorMessage('connect_failed'), /encendida/)
    assert.match(bluetoothErrorMessage('write_failed'), /Error de envío/)
    assert.equal(bluetoothErrorMessage('???'), bluetoothErrorMessage('write_failed'))
  })
  it('normalizes MAC addresses', () => {
    assert.equal(normalizeBluetoothAddress(' aa-bb-cc-dd-ee-0f '), 'AA:BB:CC:DD:EE:0F')
    assert.equal(normalizeBluetoothAddress('192.0.2.5:9100'), null)
  })
  it('requests the Bluetooth permission only when it is missing', async () => {
    assert.equal(await ensureBluetoothReady(device({ available: true, state: 'granted', enabled: true })), null)
    const prompt = device({ available: true, state: 'prompt' }, { available: true, state: 'granted', enabled: true })
    assert.equal(await ensureBluetoothReady(prompt), null)
    assert.deepEqual(prompt.calls, ['bluetooth'])
    assert.equal(await ensureBluetoothReady(device({ available: true, state: 'prompt' }, { state: 'denied' })), 'permission_denied')
    const blocked = device({ available: true, state: 'blocked' })
    assert.equal(await ensureBluetoothReady(blocked), 'permission_denied')
    assert.deepEqual(blocked.calls, [])
    assert.equal(await ensureBluetoothReady(device({ available: true, state: 'granted', enabled: false })), 'bluetooth_unavailable')
    assert.equal(await ensureBluetoothReady(device({ available: false, state: 'unsupported' })), 'unsupported')
  })
  it('builds a test label sized to the media without ZPL injection', () => {
    const zpl = testLabelZpl({ name: 'Zebra ^XZ~JR', dpi: 203, mediaWidthMm: 50, mediaHeightMm: 25 }, new Date(2026, 9, 15, 9, 5))
    assert.match(zpl, /^\^XA/)
    assert.match(zpl, /\^XZ$/)
    assert.match(zpl, /\^PW400\n\^LL200/)
    assert.match(zpl, /\^FDZebra  XZ JR\^FS/)
    assert.match(zpl, /2026-10-15 09:05/)
    assert.equal(zpl.match(/\^XZ/g).length, 1)
  })
})
