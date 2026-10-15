# Inventory labels phase 4: Bluetooth printing from the Android APK

Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md` ("Phase 4").

## Decisions

- Network (IP:9100) printing is NOT done server-side: the API runs on a VPS and
  cannot reach a printer on the customer's LAN. The `network` transport stays a
  `.zpl`/PDF download with an explanation; docs list the LAN options (ZPL file,
  Zebra Browser Print, OS driver with PDF).
- Bluetooth uses Classic SPP/RFCOMM (UUID `00001101-0000-1000-8000-00805F9B34FB`),
  paired devices only (no discovery, no BLUETOOTH_SCAN). The printer `address`
  stores the paired device MAC.

## Tasks

1. Native host
   - `DeviceAccess.kt`: `bluetoothPrint(invoke)` (args `address`, `data` base64):
     permission/adapter/paired checks, background thread, secure socket with
     insecure fallback, 512 B chunks + flush, 20 s watchdog that closes the
     socket, single print at a time. Rejects with codes
     `BLUETOOTH_PERMISSION_REQUIRED`, `BLUETOOTH_UNAVAILABLE`,
     `BLUETOOTH_NOT_PAIRED`, `BLUETOOTH_CONNECT_FAILED`, `BLUETOOTH_WRITE_FAILED`,
     `BLUETOOTH_TIMEOUT`, `BLUETOOTH_BUSY`, `INVALID_BLUETOOTH_ADDRESS`,
     `INVALID_PRINT_DATA`.
   - `ScreenSharePlugin.kt` `@Command bluetoothPrint`; `mobile_media.rs`
     `host_device` action `bluetooth-print` (validates MAC and payload size);
     capability `bluetooth-print` in `host_info`; `device-bridge.js`
     `printBluetoothRaw(address, base64)`. Manifest already declares
     BLUETOOTH/BLUETOOTH_ADMIN (maxSdk 30) and BLUETOOTH_CONNECT; runtime request
     reuses the existing `bluetooth` permission alias.
2. SDK: `device.bluetooth.print(address, bytes|string)` -> `{ ok, bytes }` or
   `{ ok: false, code, error }` (`unsupported` outside the host or on older
   APKs). Helpers `bytesToBase64` (chunked) and `bluetoothErrorCode`. Tests in
   `native-device.test.js`. Docs: `docs/mobile/RUNLY_NATIVE_HOST.md`.
3. UI: `lib/bluetooth-print.js` (Spanish error messages, test-label ZPL, MAC
   normalization), `bluetooth` transport in `label-transports.js` (renders ZPL,
   sends with `env.bluetooth.print`), `network` becomes a download transport,
   hook `useBluetoothPrinting` (capability detection, permission flow, paired
   devices). Printer editor: paired-device picker in the APK, manual field + note
   on web, "Imprimir prueba".
4. Tests for transport selection, error mapping, base64 chunking, test label.
   `pnpm lint`, `pnpm build:web`. Kotlin/Android compiled only if the toolchain is
   already present.

## Verification

Not testable here: real printing needs the Zebra printer and an APK build.
