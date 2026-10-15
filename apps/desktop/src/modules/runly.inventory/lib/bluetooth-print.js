// Pure helpers for Bluetooth label printing from the Android app.

const MESSAGES = {
  unsupported: 'La impresión por Bluetooth necesita la app Android de Runly actualizada.',
  permission_denied: 'Runly no tiene permiso de Bluetooth (Dispositivos cercanos). Actívalo en los ajustes de Android.',
  bluetooth_unavailable: 'El Bluetooth del teléfono está apagado. Actívalo e inténtalo de nuevo.',
  not_paired: 'La impresora no está emparejada con este teléfono. Emparéjala en los ajustes de Bluetooth de Android y vuelve a elegirla.',
  connect_failed: 'No se pudo conectar con la impresora. Verifica que esté encendida, cerca y sin otro equipo conectado.',
  timeout: 'La impresora no respondió a tiempo. Verifica que esté encendida y cerca del teléfono.',
  write_failed: 'Error de envío: se interrumpió la conexión con la impresora. Revísala e inténtalo de nuevo.',
  busy: 'Ya hay una impresión por Bluetooth en curso. Espera a que termine.',
  invalid_address: 'La dirección Bluetooth de la impresora no es válida. Edita la impresora y elige el dispositivo emparejado.',
  invalid_data: 'El archivo de etiquetas está vacío o es demasiado grande para enviarlo por Bluetooth.',
}

export const bluetoothErrorMessage = (code) => MESSAGES[code] ?? MESSAGES.write_failed

const MAC = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/
export function normalizeBluetoothAddress(value) {
  const mac = String(value ?? '').trim().toUpperCase().replace(/-/g, ':')
  return MAC.test(mac) ? mac : null
}

// Asks for BLUETOOTH_CONNECT (Android 12+) when needed, from a user click.
// device: SDK device client. -> null when ready, otherwise an error code.
export async function ensureBluetoothReady(device) {
  let bt = (await device.status())?.bluetooth
  if (!bt?.available) return 'unsupported'
  if (bt.state !== 'granted') {
    if (bt.state === 'blocked') return 'permission_denied'
    bt = (await device.permissions.request('bluetooth'))?.bluetooth
    if (bt?.state !== 'granted') return 'permission_denied'
  }
  return bt.enabled === false ? 'bluetooth_unavailable' : null
}

// Codes the user fixes in Android settings ("Abrir ajustes").
export const bluetoothSettingsCodes = new Set(['permission_denied', 'bluetooth_unavailable', 'not_paired'])

const dots =(mm, dpi) => Math.round((Number(mm) * Number(dpi || 203)) / 25.4)
// ZPL field data cannot carry ^ or ~ (command prefixes).
const zplText = (value) => String(value ?? '').replace(/[\^~\\]/g, ' ').replace(/[^\x20-\x7E -ÿ]/g, '').slice(0, 40)

// Small test label sized to the printer's media (defaults 50 x 25 mm).
export function testLabelZpl({ name, dpi = 203, mediaWidthMm, mediaHeightMm } = {}, date = new Date()) {
  const width = dots(Number(mediaWidthMm) || 50, dpi)
  const height = dots(Number(mediaHeightMm) || 25, dpi)
  const margin = dots(2, dpi)
  const big = Math.max(18, Math.round(height / 6))
  const small = Math.max(14, Math.round(big * 0.7))
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return [
    '^XA', '^CI28', `^PW${width}`, `^LL${height}`,
    `^FO${margin},${margin}^A0N,${big},${big}^FDPrueba de Runly^FS`,
    `^FO${margin},${margin + big + 6}^A0N,${small},${small}^FD${zplText(name) || 'Impresora'}^FS`,
    `^FO${margin},${margin + big + small + 12}^A0N,${small},${small}^FD${stamp}^FS`,
    `^FO${margin},${Math.max(margin, height - margin - 4)}^GB${Math.max(10, width - margin * 2)},3,3^FS`,
    '^XZ',
  ].join('\n')
}
