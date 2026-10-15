// Output layer of the Etiquetas screen. Each printer transport is a small
// object; the screen asks the registry for a plan (what "Imprimir" will do)
// and runs it with the rendered file. Phase 4: `bluetooth` sends ZPL to a
// paired printer from the Android app (env.bluetooth); `network` is a download
// because the API server cannot reach a printer on the customer's LAN.
//
// transport: {
//   id,
//   formats: ['pdf', ...]          formats it can deliver (first is preferred),
//   isAvailable(printer, env) -> boolean,
//   unavailableReason?: string,
//   actionLabel(format) -> string  button text,
//   prepare?(format, env) -> handle  runs synchronously on the click (before
//                                    rendering) so a new tab is not popup-blocked,
//   send({ blob, format, printer, filename, handle }, env) -> Promise<{ ok, mode, code?, message? }>,
// }
// env: { openUrl(url) -> boolean, openBlank() -> handle|null, navigate(handle, url),
//        close(handle), download(blob, filename), objectUrl(blob), revokeLater(url),
//        bluetooth?: { available, print(address, bytes) -> Promise<{ ok, code? }> } }

import { bluetoothErrorMessage, normalizeBluetoothAddress } from './bluetooth-print.js'

export const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF (cualquier impresora)' },
  { value: 'zpl', label: 'ZPL (Zebra)' },
  { value: 'png', label: 'PNG (imagen)' },
]

export const TRANSPORT_OPTIONS = [
  { value: 'browser', label: 'Navegador' },
  { value: 'file', label: 'Archivo' },
  { value: 'network', label: 'Red (IP)' },
  { value: 'bluetooth', label: 'Bluetooth' },
]

export const FILE_EXTENSIONS = { pdf: 'pdf', zpl: 'zpl', png: 'png' }

export const labelFilename = (format, date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `etiquetas-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.${FILE_EXTENSIONS[format] ?? format}`
}

const download = async ({ blob, filename }, env) => {
  env.download(blob, filename)
  return { ok: true, mode: 'download' }
}

const browserTransport = {
  id: 'browser',
  formats: ['pdf', 'zpl', 'png'],
  isAvailable: () => true,
  actionLabel: (format) => (format === 'zpl' ? 'Descargar .zpl' : 'Imprimir'),
  // PDF and PNG open in a new tab (the browser shows its print dialog from
  // there); ZPL cannot be printed by a browser, so it is downloaded.
  prepare: (format, env) => (format === 'zpl' ? null : env.openBlank()),
  async send({ blob, format, filename, handle }, env) {
    if (format === 'zpl') return download({ blob, filename }, env)
    const url = env.objectUrl(blob)
    if (handle) {
      env.navigate(handle, url)
      env.revokeLater(url)
      return { ok: true, mode: 'open' }
    }
    if (env.openUrl(url)) {
      env.revokeLater(url)
      return { ok: true, mode: 'open' }
    }
    env.revokeLater(url)
    return download({ blob, filename }, env)
  },
}

const fileTransport = {
  id: 'file',
  formats: ['pdf', 'zpl', 'png'],
  isAvailable: () => true,
  actionLabel: (format) => `Descargar .${FILE_EXTENSIONS[format] ?? format}`,
  send: download,
}

// LAN printers: the server cannot open a socket to 192.168.x.x:9100, so the
// file is downloaded and sent from a computer on the same network.
const networkTransport = {
  id: 'network',
  formats: ['zpl', 'pdf'],
  isAvailable: () => true,
  actionLabel: (format) => `Descargar .${FILE_EXTENSIONS[format] ?? format}`,
  send: download,
}

const failed = (code) => ({ ok: false, mode: 'bluetooth', code, message: bluetoothErrorMessage(code) })

// Android app only: ZPL over Bluetooth SPP to the paired printer whose MAC is
// stored in printer.address. Elsewhere the plan is unavailable.
const bluetoothTransport = {
  id: 'bluetooth',
  formats: ['zpl'],
  isAvailable: (printer, env) => Boolean(env?.bluetooth?.available),
  unavailableReason: 'Disponible en la app Android',
  actionLabel: () => 'Imprimir',
  async send({ blob, printer }, env) {
    const address = normalizeBluetoothAddress(printer?.address)
    if (!address) return failed('invalid_address')
    if (!env?.bluetooth?.available) return failed('unsupported')
    const result = await env.bluetooth.print(address, new Uint8Array(await blob.arrayBuffer()))
    return result?.ok ? { ok: true, mode: 'bluetooth' } : failed(result?.code ?? 'write_failed')
  },
}

export function createTransportRegistry(transports = [browserTransport, fileTransport, networkTransport, bluetoothTransport]) {
  const map = new Map(transports.map((t) => [t.id, t]))
  return {
    register(id, transport) { map.set(id, { ...transport, id }) },
    get: (id) => map.get(id) ?? null,
    ids: () => [...map.keys()],
  }
}

// What "Imprimir" does for a printer (null printer = browser + PDF).
// -> { transportId, format, available, reason, label }
export function resolvePrintPlan(printer, registry, env = null) {
  const transportId = printer?.transport ?? 'browser'
  const transport = registry.get(transportId)
  if (!transport) {
    return { transportId, format: printer?.format ?? 'pdf', available: false, reason: 'Transporte no compatible', label: 'Imprimir' }
  }
  const wanted = printer?.format ?? 'pdf'
  const format = transport.formats.includes(wanted) ? wanted : transport.formats[0]
  const available = Boolean(transport.isAvailable(printer, env))
  return {
    transportId,
    format,
    available,
    reason: available ? null : (transport.unavailableReason ?? 'No disponible'),
    label: transport.actionLabel(format),
  }
}

// Call synchronously inside the click handler; pass the result to runPrintPlan.
export function preparePrintPlan(plan, registry, env) {
  const transport = registry.get(plan.transportId)
  if (!transport?.prepare || !plan.available) return null
  return transport.prepare(plan.format, env) ?? null
}

export async function runPrintPlan(plan, { blob, printer, handle = null }, registry, env) {
  const transport = registry.get(plan.transportId)
  if (!transport || !plan.available) return { ok: false, mode: 'unavailable' }
  return transport.send({ blob, format: plan.format, printer, filename: labelFilename(plan.format), handle }, env)
}

// Browser side effects; injected so the plan logic stays testable under node.
export function createBrowserEnv(win = globalThis.window) {
  return {
    objectUrl: (blob) => win.URL.createObjectURL(blob),
    revokeLater: (url) => win.setTimeout(() => win.URL.revokeObjectURL(url), 60_000),
    // No 'noopener': it makes window.open return null, hiding popup blocking.
    openUrl: (url) => Boolean(win.open(url, '_blank')),
    openBlank: () => win.open('', '_blank') ?? null,
    navigate: (handle, url) => { handle.location.href = url },
    close: (handle) => { try { handle?.close() } catch { /* already closed */ } },
    download(blob, filename) {
      const url = win.URL.createObjectURL(blob)
      const a = win.document.createElement('a')
      a.href = url
      a.download = filename
      win.document.body.appendChild(a)
      a.click()
      a.remove()
      win.setTimeout(() => win.URL.revokeObjectURL(url), 60_000)
    },
  }
}

export const labelTransports = createTransportRegistry()
