// Bundled with the APK so custom modules on older web deployments can use it.
(() => {
  const call = (action, permission) => window.__TAURI_INTERNALS__.invoke('host_device', { action, permission: permission ?? null })
  const device = Object.freeze({
    status: () => call('status'),
    requestPermission: (permission) => call('request', permission),
    openSettings: (permission) => call('settings', permission),
    pairedBluetoothDevices: () => call('bluetooth-paired'),
    readNfcTag: () => call('nfc-read'),
    stopNfcReader: () => call('nfc-stop'),
  })
  Object.defineProperty(window, '__RUNLY_DEVICE__', { value: device, writable: false, configurable: false })
})()
