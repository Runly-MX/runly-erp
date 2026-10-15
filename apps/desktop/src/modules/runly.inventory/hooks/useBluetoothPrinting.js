import { useEffect, useMemo, useState } from 'react'
import { bluetoothErrorCode, createRunlyDeviceClient } from '@runly/sdk'
import { native } from '../../../native/index.js'
import { ensureBluetoothReady } from '../lib/bluetooth-print.js'

let detection = null
// True only inside a Runly Android app whose host can print over Bluetooth.
function detectBluetoothPrinting() {
  if (!detection) {
    detection = (async () => {
      if (typeof globalThis.window?.__RUNLY_DEVICE__?.printBluetoothRaw !== 'function' || !native.isAvailable()) return false
      await native.getHostInfo()
      return native.supports('bluetooth-print')
    })().catch(() => false)
  }
  return detection
}

// Bluetooth label printing for the transports and the printer editor.
// print/pairedDevices never throw: they resolve { ok, ... } or { ok: false, code }.
export function useBluetoothPrinting() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let alive = true
    detectBluetoothPrinting().then((value) => { if (alive) setAvailable(Boolean(value)) })
    return () => { alive = false }
  }, [])

  return useMemo(() => {
    const device = createRunlyDeviceClient()
    const guard = async (run) => {
      if (!available) return { ok: false, code: 'unsupported' }
      try {
        const code = await ensureBluetoothReady(device)
        return code ? { ok: false, code } : await run()
      } catch (error) {
        return { ok: false, code: bluetoothErrorCode(error) }
      }
    }
    return {
      available,
      print: (address, bytes) => guard(() => device.bluetooth.print(address, bytes)),
      pairedDevices: () => guard(async () => ({ ok: true, devices: (await device.bluetooth.pairedDevices())?.devices ?? [] })),
      openSettings: () => device.permissions.openSettings('bluetooth').catch(() => {}),
    }
  }, [available])
}
