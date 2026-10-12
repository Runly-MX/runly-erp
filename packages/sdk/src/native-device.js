// No Tauri dependency: the Android host supplies this bounded bridge itself.
export function createRunlyDeviceClient({ scope = globalThis } = {}) {
  const bridge = () => {
    const device = (scope.window ?? scope).__RUNLY_DEVICE__
    if (!device) throw new Error('Esta función necesita la app Android de Runly 1.2.0 o posterior.')
    return device
  }
  return {
    status: () => bridge().status(),
    permissions: {
      request: (name) => bridge().requestPermission(name),
      openSettings: (name) => bridge().openSettings(name),
    },
    bluetooth: { pairedDevices: () => bridge().pairedBluetoothDevices() },
    nfc: { readTag: () => bridge().readNfcTag(), stop: () => bridge().stopNfcReader() },
  }
}
