// Native host rejection strings -> stable codes for bluetooth.print results.
const BLUETOOTH_ERRORS = [
  ['BLUETOOTH_PERMISSION_REQUIRED', 'permission_denied'],
  ['BLUETOOTH_UNAVAILABLE', 'bluetooth_unavailable'],
  ['BLUETOOTH_NOT_PAIRED', 'not_paired'],
  ['BLUETOOTH_CONNECT_FAILED', 'connect_failed'],
  ['BLUETOOTH_WRITE_FAILED', 'write_failed'],
  ['BLUETOOTH_TIMEOUT', 'timeout'],
  ['BLUETOOTH_BUSY', 'busy'],
  ['INVALID_BLUETOOTH_ADDRESS', 'invalid_address'],
  ['INVALID_PRINT_DATA', 'invalid_data'],
  ['UNSUPPORTED_DEVICE_ACTION', 'unsupported'],
  ['INVALID_DEVICE_ACTION', 'unsupported'],
]
export const BLUETOOTH_PRINT_MAX_BYTES = 2 * 1024 * 1024
const MAC = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/

export function bluetoothErrorCode(error) {
  const text = String(error?.message ?? error ?? '')
  return BLUETOOTH_ERRORS.find(([raw]) => text.includes(raw))?.[1] ?? 'write_failed'
}

// Chunked so large ZPL jobs do not overflow the String.fromCharCode arguments.
export function bytesToBase64(bytes, chunkSize = 0x8000) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  return globalThis.btoa(binary)
}

const toBytes = (data) => {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return null
}

// No Tauri dependency: the Android host supplies this bounded bridge itself.
export function createRunlyDeviceClient({ scope = globalThis } = {}) {
  const host = () => (scope.window ?? scope).__RUNLY_DEVICE__
  const bridge = () => {
    const device = host()
    if (!device) throw new Error('Esta función necesita la app Android de Runly 1.2.0 o posterior.')
    return device
  }
  return {
    status: () => bridge().status(),
    permissions: {
      request: (name) => bridge().requestPermission(name),
      openSettings: (name) => bridge().openSettings(name),
    },
    bluetooth: {
      pairedDevices: () => bridge().pairedBluetoothDevices(),
      // Raw bytes to a paired SPP printer. Never throws:
      // -> { ok: true, bytes } | { ok: false, code, error }.
      async print(address, data) {
        const device = host()
        if (typeof device?.printBluetoothRaw !== 'function') return { ok: false, code: 'unsupported', error: null }
        const mac = String(address ?? '').trim().toUpperCase()
        if (!MAC.test(mac)) return { ok: false, code: 'invalid_address', error: null }
        const bytes = toBytes(data)
        if (!bytes?.length || bytes.length > BLUETOOTH_PRINT_MAX_BYTES) return { ok: false, code: 'invalid_data', error: null }
        try {
          const result = await device.printBluetoothRaw(mac, bytesToBase64(bytes))
          return { ok: true, bytes: result?.bytes ?? bytes.length }
        } catch (error) {
          return { ok: false, code: bluetoothErrorCode(error), error: String(error?.message ?? error) }
        }
      },
    },
    nfc: { readTag: () => bridge().readNfcTag(), stop: () => bridge().stopNfcReader() },
  }
}
